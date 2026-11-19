import express from 'express';

export function createApp(database) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', async (_request, response) => {
    try {
      await database.command({ ping: 1 });
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  return app;
}
