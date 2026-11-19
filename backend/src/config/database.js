import { MongoClient } from 'mongodb';

export async function connectDatabase(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
