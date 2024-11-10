import { AzureChatOpenAI, AzureOpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { z } from 'zod';
import 'dotenv/config';
import { EMPLOYEE_SCHEMA } from './schema';
import { ClientSecretCredential, getBearerTokenProvider } from '@azure/identity';
import { MongoUtil } from './mongo-util';

type Employee = z.infer<typeof EMPLOYEE_SCHEMA>;
const parser = StructuredOutputParser.fromZodSchema(z.array(EMPLOYEE_SCHEMA));

async function generateSyntheticData(llm: ChatOpenAI): Promise<Employee[]> {
  const prompt = `You are a helpful assistant that generates employee data. Generate 10 fictional employee records. Each record should include the following fields: employee_id, first_name, last_name, date_of_birth, address, contact_details, job_details, work_location, reporting_manager, skills, performance_reviews, benefits, emergency_contact, notes. Ensure variety in the data and realistic values.
  ${parser.getFormatInstructions()}`;
  console.log('Generating synthetic data...');

  const response = await llm.invoke(prompt);
  return parser.parse(response.content as string);
}

async function createEmployeeSummary(employee: Employee): Promise<string> {
  return new Promise((resolve) => {
    const jobDetails = `${employee.job_details.job_title} in ${employee.job_details.department}`;
    const skills = employee.skills.join(', ');
    const performanceReviews = employee.performance_reviews
      .map((review) => `Rated ${review.rating} on ${review.review_date}: ${review.comments}`)
      .join(' ');
    const basicInfo = `${employee.first_name} ${employee.last_name}, born on ${employee.date_of_birth}`;
    const workLocation = `Works at ${employee.work_location.nearest_office}, Remote: ${employee.work_location.is_remote}`;
    const notes = employee.notes;

    const summary = `${basicInfo}. Job: ${jobDetails}. Skills: ${skills}. Reviews: ${performanceReviews}. Location: ${workLocation}. Notes: ${notes}`;

    resolve(summary);
  });
}

async function seedDatabase(): Promise<void> {
  // const client = new MongoClient(process.env.MONGODB_ATLAS_URI as string);
  const util = new MongoUtil(
    process.env.DB_HOST as string,
    parseInt(process.env.DB_PORT as string),
    process.env.DB_QUERY_STRING as string,
    'hr_database',
    process.env.DB_CERT as string,
    process.env.DB_USER_NAME as string,
    process.env.DB_PWD as string,
  );

  try {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID as string,
      process.env.AZURE_CLIENT_ID as string,
      process.env.AZURE_CLIENT_SECRET as string,
      {
        authorityHost: process.env.AZURE_AUTHORITY_HOST as string,
      },
    );
    console.log('Azure credential created');

    const scope = 'https://cognitiveservices.azure.com/.default';
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);
    console.log('Azure token provider created');

    const llm = new AzureChatOpenAI({
      azureADTokenProvider,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME as string,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME as string,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION as string,
      temperature: 0.7,
    });

    const db = await util.connect();
    // await db('admin').command({ ping: 1 });
    await db.command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');

    // const db = client.db('hr_database');
    const collection = db.collection('employees');

    await collection.deleteMany({});

    const syntheticData = await generateSyntheticData(llm);

    const recordsWithSummaries = await Promise.all(
      syntheticData.map(async (record) => ({
        pageContent: await createEmployeeSummary(record),
        metadata: { ...record },
      })),
    );

    const embeddings = new AzureOpenAIEmbeddings({
      azureADTokenProvider,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiDeploymentName: 'text-embedding-ada-002-blue',
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    });

    for (const record of recordsWithSummaries) {
      await MongoDBAtlasVectorSearch.fromDocuments([record], embeddings, {
        collection,
        indexName: 'vector_index',
        textKey: 'embedding_text',
        embeddingKey: 'embedding',
      });

      console.log('Successfully processed & saved record:', record.metadata.employee_id);
    }

    console.log('Database seeding completed');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await util.close();
  }
}

seedDatabase().catch((err) => {
  console.error('The chatbot test encountered an error:', err);
});

module.exports = { seedDatabase };
