import { Router } from 'express';

export function workspaceRoutes(repository, requireSession) {
  const router = Router();
  router.use(requireSession);
  router.get('/', async (request, response) => {
    response.json(await repository.list(request.session.userId));
  });
  router.post('/', async (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name || name.length > 100) {
      return response.status(400).json({ message: 'Enter a workspace name of 1–100 characters.' });
    }
    response.status(201).json(await repository.create(name, request.session.userId));
  });
  return router;
}
