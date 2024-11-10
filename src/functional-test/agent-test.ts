import { MongoUtil } from '../common/mongo-util';
import { Agent } from '../common/agent';

async function main() {
  const util = new MongoUtil(
    process.env.DB_HOST as string,
    parseInt(process.env.DB_PORT as string),
    process.env.DB_QUERY_STRING as string,
    process.env.DB_NAME as string,
    process.env.DB_CERT as string,
    process.env.DB_USER_NAME as string,
    process.env.DB_PWD as string,
  );

  await util.connect();

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

  const result = await agent.callAgent('Build a team to make an iOS app, and tell me the talent gaps.', '1');
  console.log(result);
}

main().catch((err) => {
  console.error('The chatbot test encountered an error:', err);
});

module.exports = { main };
