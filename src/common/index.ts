import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import { MongoUtil } from './mongo-util';
import { Agent } from './agent';

const app: Express = express();
app.use(express.json());

async function main() {
  try {
    const util = new MongoUtil(
      process.env.DB_HOST as string,
      parseInt(process.env.DB_PORT as string),
      process.env.DB_QUERY_STRING as string,
      process.env.DB_NAME as string,
      process.env.DB_CERT as string,
      process.env.DB_USER_NAME as string,
      process.env.DB_PWD as string,
    );
    const db = await util.connect();
    await db.command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');

    const agent = new Agent(
      process.env.AZURE_TENANT_ID as string,
      process.env.AZURE_CLIENT_ID as string,
      process.env.AZURE_CLIENT_SECRET as string,
      process.env.AZURE_AUTHORITY_HOST as string,
      process.env.AZURE_OPENAI_API_INSTANCE_NAME as string,
      process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME as string,
      process.env.AZURE_OPENAI_API_VERSION as string,
      util,
    );
    await agent.initialize();

    // Set up basic Express route
    // curl -X GET http://localhost:3000/
    app.get('/', (req: Request, res: Response) => {
      res.send('LangGraph Agent Server');
    });

    // API endpoint to start a new conversation
    // curl -X POST -H "Content-Type: application/json" -d '{"message": "Build a team to make an iOS app, and tell me the talent gaps."}' http://localhost:3000/chat
    app.post('/chat', async (req: Request, res: Response) => {
      const initialMessage = req.body.message;
      const threadId = Date.now().toString(); // Simple thread ID generation
      try {
        const response = await agent.callAgent(initialMessage, threadId);
        res.json({ threadId, response });
      } catch (error) {
        console.error('Error starting conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // API endpoint to send a message in an existing conversation
    // curl -X POST -H "Content-Type: application/json" -d '{"message": "What team members did you recommend?"}' http://localhost:3000/chat/123456789
    app.post('/chat/:threadId', async (req: Request, res: Response) => {
      const { threadId } = req.params;
      const { message } = req.body;
      try {
        const response = await agent.callAgent(message, threadId);
        res.json({ response });
      } catch (error) {
        console.error('Error in chat:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (ex) {
    console.error('Error connecting to MongoDB:', ex);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('The chatbot test encountered an error:', err);
});

module.exports = { main };
