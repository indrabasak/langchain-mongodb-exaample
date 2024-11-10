import { MongoUtil } from './mongo-util';

async function main() {
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
    const db = await util.connect();
    await db.command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');

    // const db = client.db('hr_database');
    const collection = db.collection('employees');

    // define your Atlas Vector Search index
    // const index = {
    //   name: 'vector_index',
    //   type: 'vectorSearch',
    //   definition: {
    //     fields: [
    //       {
    //         type: 'hnsw',
    //         path: 'embedding',
    //         similarity: 'cosine',
    //         numDimensions: 1536,
    //       },
    //     ],
    //   },
    // };
    // run the helper method
    // const result = await collection.createSearchIndex(index);
    // console.log(result);

    //{
    //   "fields": [
    //     {
    //       "numDimensions": 1536,
    //       "path": "embedding",
    //       "similarity": "cosine",
    //       "type": "vector"
    //     }
    //   ]
    // }

    await db.command({
      createIndexes: 'employees',
      indexes: [
        {
          key: { embedding: 'vector' },
          vectorOptions: {
            type: 'hnsw',
            dimensions: 1536,
            similarity: 'cosine',
          },
          name: 'vector_index',
        },
      ],
    });

    // await collection.createIndex(
    //   { embedding: 'vector' },
    //   {
    //     name: 'vector_index',
    //     vectorOptions: {
    //       type: 'hnsw',
    //       dimensions: 1536,
    //       similarity: 'cosine',
    //     },
    //   },
    // );
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await util.close();
  }
}

main().catch((err) => {
  console.error('The chatbot test encountered an error:', err);
});

module.exports = { main };
