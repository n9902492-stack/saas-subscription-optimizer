import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { authModule } from './modules/auth/auth.js';
import { workspaceRepository } from './modules/workspaces/workspace.repository.js';
import { workspaceRoutes } from './modules/workspaces/workspace.routes.js';

export async function createApp(database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));

  const auth = authModule(database);
  await auth.initialize();
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    message: { message: 'Too many attempts. Try again in a minute.' },
  });
  app.post('/api/auth/signup', authLimiter, auth.signup);
  app.post('/api/auth/signin', authLimiter, auth.signin);
  app.post('/api/auth/signout', auth.requireSession, auth.signout);
  app.use('/api/workspaces', workspaceRoutes(workspaceRepository(database), auth.requireSession));

  app.get('/api/health', async (_request, response) => {
    try {
      await database.command({ ping: 1 });
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ message: 'Invalid JSON request.' });
    }
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ message: 'Request body is too large.' });
    }
    response.status(500).json({ message: 'Request could not be completed.' });
  });

  return app;
}
