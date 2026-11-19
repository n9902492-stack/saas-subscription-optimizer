import { Router } from 'express';
import { ObjectId } from 'mongodb';

export async function paymentSourceRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const workspaces = database.collection('workspaces');
  const sources = database.collection('paymentSources');
  await sources.createIndex({ workspaceId: 1, labelKey: 1 }, { unique: true });

  router.use(requireSession, async (request, response, next) => {
    const id = request.params.workspaceId;
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      return response.status(404).json({ message: 'Workspace not found.' });
    }

    const workspaceId = new ObjectId(id);
    const userId = request.session.userId;
    const workspace = await workspaces.findOne(
      { _id: workspaceId, 'members.userId': userId },
      { projection: { members: { $elemMatch: { userId } } } },
    );
    if (!workspace) return response.status(404).json({ message: 'Workspace not found.' });
    if (!['Admin', 'Finance'].includes(workspace.members[0].role)) {
      return response.status(403).json({ message: 'Payment sources require Admin or Finance access.' });
    }

    request.workspaceId = workspaceId;
    next();
  });

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
