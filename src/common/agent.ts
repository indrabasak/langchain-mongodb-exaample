import { tool } from '@langchain/core/tools';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from '@langchain/openai';
import { z } from 'zod';
import { Collection, Db, MongoClient } from 'mongodb';
import { ClientSecretCredential, getBearerTokenProvider } from '@azure/identity';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AnnotationRoot } from '@langchain/langgraph/dist/graph/annotation';
import { DynamicStructuredTool } from '@langchain/core/dist/tools';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { CompiledStateGraph } from '@langchain/langgraph/dist/graph/state';
import { MongoUtil } from './mongo-util';
import { State } from './state';

export class Agent {
  private static readonly COLLECTION_NAME: string = 'employee';
  private static readonly INDEX_NAME: string = 'vector_index';
  private static readonly TEXT_KEY: string = 'embedding_text';
  private static readonly EMBEDDING_KEY: string = 'embedding';

  private util: MongoUtil;
  private collection: Collection | null | undefined;
  private model: AzureChatOpenAI;
  private readonly embeddings: AzureOpenAIEmbeddings;
  private graphState: AnnotationRoot<any>;
  private tools: DynamicStructuredTool<any>[] | undefined;
  private app: CompiledStateGraph<any, any, any, any, any, any> | undefined;

  constructor(
    azureTenantId: string,
    azureClientId: string,
    azureClientSecret: string,
    azureAuthorityHost: string,
    azureOpenAIApiInstanceName: string,
    azureOpenAIApiDeploymentName: string,
    azureOpenAIApiVersion: string,
    util: MongoUtil,
  ) {
    this.util = util;
    const credential = new ClientSecretCredential(azureTenantId, azureClientId, azureClientSecret, {
      authorityHost: azureAuthorityHost,
    });
    console.log('Azure credential created');

    const scope = 'https://cognitiveservices.azure.com/.default';
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);
    console.log('Azure token provider created');

    this.model = new AzureChatOpenAI({
      azureADTokenProvider,
      azureOpenAIApiInstanceName: azureOpenAIApiInstanceName,
      azureOpenAIApiDeploymentName: azureOpenAIApiDeploymentName,
      azureOpenAIApiVersion: azureOpenAIApiVersion,
      temperature: 0,
    });
    State.getInstance().setModel(this.model);
    console.log('Azure model created');

    this.embeddings = new AzureOpenAIEmbeddings({
      azureADTokenProvider,
      azureOpenAIApiInstanceName: azureOpenAIApiInstanceName,
      azureOpenAIApiDeploymentName: azureOpenAIApiDeploymentName,
      azureOpenAIApiVersion: azureOpenAIApiVersion,
    });
    console.log('Azure embeddings created');

    // Define the graph state
    this.graphState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
      }),
    });
    console.log('Graph state created');
  }

  async initialize() {
    const db = this.util.getDb() as Db;
    await db.command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');

    // const db = client.db('hr_database');
    this.collection = db.collection(Agent.COLLECTION_NAME);
    const employeeLookupTool = await this.createTool(this.collection);
    const tempTools = [employeeLookupTool];
    this.model.bindTools(tempTools);
    // We can extract the state typing via `GraphState.State`
    const toolNode = new ToolNode<typeof this.graphState.State>(tempTools);
    this.tools = tempTools;
    console.log('------- tools');
    console.log(this.tools);
    State.getInstance().setTools(tempTools);

    // Define a new graph
    const workflow = new StateGraph(this.graphState)
      .addNode('agent', this.callModel)
      .addNode('tools', toolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', this.shouldContinue)
      .addEdge('tools', 'agent');

    const client: MongoClient = this.util.getClient() as MongoClient;
    const dbName = this.util.getDbName();
    // Initialize the MongoDB memory to persist state between graph runs
    const checkpointer = new MongoDBSaver({ client, dbName });

    // This compiles it into a LangChain Runnable.
    // Note that we're passing the memory when compiling the graph
    this.app = workflow.compile({ checkpointer });
  }

  async callAgent(query: string, thread_id: string) {
    if (this.app) {
      console.log('------ callAgent ------');
      // Use the Runnable
      const finalState = await this.app.invoke(
        {
          messages: [new HumanMessage(query)],
        },
        { recursionLimit: 15, configurable: { thread_id: thread_id } },
      );

      // console.log(JSON.stringify(finalState.messages, null, 2));
      console.log(finalState.messages[finalState.messages.length - 1].content);

      return finalState.messages[finalState.messages.length - 1].content;
    }

    return 'The agent has not been initialized yet';
  }

  private async createTool(collection: Collection) {
    return tool(
      async ({ query, n = 10 }): Promise<string> => {
        console.log('Employee lookup tool called');

        const dbConfig = {
          collection: collection,
          indexName: Agent.INDEX_NAME,
          textKey: Agent.TEXT_KEY,
          embeddingKey: Agent.EMBEDDING_KEY,
        };

        // Initialize vector store
        const vectorStore = new MongoDBAtlasVectorSearch(this.embeddings, dbConfig);

        const result = await vectorStore.similaritySearchWithScore(query, n);
        return JSON.stringify(result);
      },
      {
        name: 'employee_lookup',
        description: 'Gathers employee details from the HR database',
        schema: z.object({
          query: z.string().describe('The search query'),
          n: z.number().optional().default(10).describe('Number of results to return'),
        }),
      },
    );
  }

  // Define the function that determines whether to continue or not
  shouldContinue(state: typeof this.graphState.State) {
    console.log('1 ------ shouldContinue ------ ');
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    // If the LLM makes a tool call, then we route to the "tools" node
    if (lastMessage.tool_calls?.length) {
      return 'tools';
    }
    // Otherwise, we stop (reply to the user)
    return '__end__';
  }

  // Define the function that calls the model
  async callModel(state: typeof this.graphState.State) {
    console.log('0 ------ callModel ------ ');
    const tools = State.getInstance().getTools();
    if (tools) {
      console.log('1 ------ callModel ------ ');
      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress 
        towards answering the question. If you are unable to fully answer, that's OK, another assistant with different
         tools will help where you left off. Execute what you can to make progress. If you or any of the other 
         assistants have the final answer or deliverable, prefix your response with FINAL ANSWER so the team knows 
         to stop. You have access to the following tools: {tool_names}.\n{system_message}\nCurrent time: {time}.`,
        ],
        new MessagesPlaceholder('messages'),
      ]);
      console.log('2 ------ callModel ------ ');

      const formattedPrompt = await prompt.formatMessages({
        system_message: 'You are helpful HR Chatbot Agent.',
        time: new Date().toISOString(),
        tool_names: tools.map((tool) => tool.name).join(', '),
        messages: state.messages,
      });
      console.log('3 ------ callModel ------ ');

      const model = State.getInstance().getModel();

      // @ts-expect-error - model is initialized
      const result = await model.invoke(formattedPrompt);
      console.log('4 ------ callModel ------ ');

      return { messages: [result] };
    }

    return { messages: ['Agent has not been initialized'] };
  }
}
