import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { authModule } from './modules/auth/auth.js';
import { workspaceRepository } from './modules/workspaces/workspace.repository.js';
import { workspaceRoutes } from './modules/workspaces/workspace.routes.js';
import { statementImportRoutes } from './modules/imports/statement-import.routes.js';
import { transactionRoutes } from './modules/transactions/transaction.routes.js';
import { vendorRoutes } from './modules/vendors/vendor.routes.js';
import { subscriptionRoutes } from './modules/subscriptions/subscription.routes.js';
import { paymentSourceRoutes } from './modules/payment-sources/payment-source.routes.js';

export async function createApp(database) {
  const app = express();
  app.disable('x-powered-by');
  const auth = authModule(database);
  await auth.initialize();
  app.use('/api/workspaces/:workspaceId/statement-imports', express.json({ limit: '800kb' }),
    await statementImportRoutes(database, auth.requireSession));
  app.use(express.json({ limit: '8kb' }));

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    message: { message: 'Too many attempts. Try again in a minute.' },
  });
  app.post('/api/auth/signup', authLimiter, auth.signup);
  app.post('/api/auth/signin', authLimiter, auth.signin);
  app.post('/api/auth/signout', auth.requireSession, auth.signout);
  app.use('/api/workspaces/:workspaceId/transactions', await transactionRoutes(database, auth.requireSession));
  app.use('/api/workspaces/:workspaceId/vendors', vendorRoutes(database, auth.requireSession));
  app.use('/api/workspaces/:workspaceId/subscriptions', await subscriptionRoutes(database, auth.requireSession));
  app.use('/api/workspaces', workspaceRoutes(workspaceRepository(database), auth.requireSession));
  app.use('/api/workspaces/:workspaceId/payment-sources', await paymentSourceRoutes(database, auth.requireSession));

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
