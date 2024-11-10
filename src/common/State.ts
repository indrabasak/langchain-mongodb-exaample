import { DynamicStructuredTool } from '@langchain/core/dist/tools';
import { AzureChatOpenAI } from '@langchain/openai';

export class State {
  private static instance: State;

  private model: AzureChatOpenAI | null = null;
  private tools: DynamicStructuredTool<any>[] = [];

  // Private constructor to prevent instantiation from outside
  private constructor() {}

  // Method to get the single instance of the class
  public static getInstance(): State {
    if (!State.instance) {
      State.instance = new State();
    }
    return State.instance;
  }

  public setModel(model: AzureChatOpenAI): void {
    this.model = model;
  }

  public getModel(): AzureChatOpenAI | null {
    return this.model;
  }

  public setTools(tools: DynamicStructuredTool<any>[]): void {
    this.tools = tools;
  }

  public getTools(): DynamicStructuredTool<any>[] {
    return this.tools;
  }
}
