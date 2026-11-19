import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';

const uri = process.env.MONGODB_URI;
const port = Number(process.env.PORT ?? 4000);
if (!uri || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set MONGODB_URI and a valid PORT in backend/.env.');
}

try {
  const client = await connectDatabase(uri);
  const server = createApp(client.db()).listen(port, '127.0.0.1', () => {
    console.log(`API listening at http://127.0.0.1:${port}`);
  });
  server.on('error', async () => {
    console.error('Could not start the API listener.');
    await client.close();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => void client.close()));
  }
} catch {
  console.error('MongoDB connection failed. Check MONGODB_URI and database availability.');
  process.exitCode = 1;
}
