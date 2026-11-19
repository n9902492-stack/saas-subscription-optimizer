import { Router } from 'express';
import { ObjectId } from 'mongodb';

const choices = ['keep', 'reduce-seats', 'review-overlap', 'cancel'];
const objectIdPattern = /^[a-f0-9]{24}$/i;
const selectFields = {
  name: 1, vendor: 1, ownerId: 1, noticeDeadline: 1, renewalDecision: 1,
};

export function renewalDecisionRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const subscriptions = database.collection('subscriptions');

  router.use(requireSession, async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const id = request.params.workspaceId;
    if (!objectIdPattern.test(id)) return response.status(404).json({ message: 'Workspace not found.' });
    const workspaceId = new ObjectId(id);
    const userId = request.session.userId;
    const workspace = await database.collection('workspaces').findOne(
      { _id: workspaceId, 'members.userId': userId },
      { projection: { members: { $elemMatch: { userId } } } },
    );
    if (!workspace) return response.status(404).json({ message: 'Workspace not found.' });
    request.workspaceId = workspaceId;
    request.canReviewAll = ['Admin', 'Finance'].includes(workspace.members[0].role);
    next();
  });

  router.get('/', async (request, response) => {
    const page = Number(request.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
      return response.status(400).json({ message: 'Choose a page from 1 to 1,000.' });
    }
    const filter = {
      workspaceId: request.workspaceId,
      noticeDeadline: { $type: 'string' },
      noticeVerifiedAt: { $type: 'date' },
      ...(request.canReviewAll ? {} : { ownerId: request.session.userId }),
    };
    const rows = await subscriptions.find(filter, { projection: selectFields })
      .sort({ noticeDeadline: -1, _id: -1 }).skip((page - 1) * 25).limit(26).toArray();
    response.json({
      items: rows.slice(0, 25).map((item) => toResponse(item, request.session.userId)),
      hasMore: page < 1000 && rows.length > 25,
    });
  });

  router.put('/:subscriptionId', async (request, response) => {
    const id = request.params.subscriptionId;
    if (!objectIdPattern.test(id)) return response.status(404).json({ message: 'Renewal not found.' });
    const { action, reason: input, noticeDeadline, expectedRevision, seatsToReduce } = request.body ?? {};
    const reason = typeof input === 'string' ? input.trim() : '';
    if (!choices.includes(action) || !reason || reason.length > 500 ||
        /(?:\d[ -]?){12,}/.test(reason) ||
        (action === 'reduce-seats' && (!Number.isSafeInteger(seatsToReduce) || seatsToReduce < 1)) ||
        typeof noticeDeadline !== 'string' ||
        !(expectedRevision === null || (typeof expectedRevision === 'string' && objectIdPattern.test(expectedRevision)))) {
      return response.status(400).json({ message: 'Choose a decision and enter a reason of up to 500 characters. Seat reductions need a positive whole number.' });
    }
    const filter = {
      _id: new ObjectId(id),
      workspaceId: request.workspaceId,
      ownerId: request.session.userId,
      noticeDeadline,
      noticeVerifiedAt: { $type: 'date' },
      ...(expectedRevision ? { 'renewalDecision.revision': expectedRevision } : {
        'renewalDecision.noticeDeadline': { $ne: noticeDeadline },
      }),
    };
    const decision = {
      action, reason, noticeDeadline, revision: new ObjectId().toHexString(),
      seatsToReduce: action === 'reduce-seats' ? seatsToReduce : null,
      recordedBy: request.session.userId, recordedAt: new Date(),
    };
    const updated = await subscriptions.findOneAndUpdate(filter, { $set: { renewalDecision: decision } }, {
      projection: selectFields, returnDocument: 'after',
    });
    if (!updated) {
      return response.status(409).json({ message: 'This renewal, its owner, or its decision has changed. Refresh to see the latest record.' });
    }
    response.json(toResponse(updated, request.session.userId));
  });

  return router;
}

function toResponse({ _id, name, vendor, ownerId, noticeDeadline, renewalDecision }, userId) {
  return {
    id: _id.toHexString(), name, vendor, noticeDeadline,
    canDecide: ownerId.equals(userId),
    decision: renewalDecision?.noticeDeadline === noticeDeadline ? renewalDecision : null,
  };
}
