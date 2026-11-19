import { Router } from 'express';
import { financeAccess } from '../workspaces/finance-access.js';

export async function paymentSourceRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const sources = database.collection('paymentSources');
  await sources.createIndex({ workspaceId: 1, labelKey: 1 }, { unique: true });

  router.use(requireSession, financeAccess(database));

  router.get('/', async (request, response) => {
    const items = await sources.find(
      { workspaceId: request.workspaceId },
      { projection: { label: 1, lastFour: 1 } },
    ).sort({ label: 1, _id: 1 }).toArray();
    response.json(items.map(toResponse));
  });

  router.post('/', async (request, response) => {
    const label = typeof request.body?.label === 'string' ? request.body.label.trim() : '';
    const lastFour = request.body?.lastFour ?? '';
    if (!label || label.length > 80 || /(?:\d[ -]?){12,}/.test(label)
      || typeof lastFour !== 'string' || !/^(?:[0-9]{4})?$/.test(lastFour)) {
      return response.status(400).json({ message: 'Enter a card nickname and, optionally, exactly four trailing digits.' });
    }

    const source = {
      workspaceId: request.workspaceId,
      label,
      labelKey: label.toLowerCase(),
      lastFour,
      createdAt: new Date(),
      createdBy: request.session.userId,
    };
    try {
      const result = await sources.insertOne(source);
      response.status(201).json(toResponse({ ...source, _id: result.insertedId }));
    } catch (error) {
      if (error.code !== 11000) throw error;
      response.status(409).json({ message: 'A payment source with that name already exists in this workspace.' });
    }
  });

  return router;
}

function toResponse(source) {
  return { id: source._id.toHexString(), label: source.label, lastFour: source.lastFour };
}
