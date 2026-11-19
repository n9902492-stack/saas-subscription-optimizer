import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { financeAccess } from '../workspaces/finance-access.js';
import { merchantKey } from '../transactions/merchant-key.js';

const billingCycles = ['monthly', 'quarterly', 'annual', 'other'];
const autoRenewOptions = ['yes', 'no', 'unknown'];

export async function subscriptionRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const subscriptions = database.collection('subscriptions');
  const workspaces = database.collection('workspaces');
  const users = database.collection('users');
  const aliases = database.collection('merchantAliases');
  await subscriptions.createIndex({ workspaceId: 1, contractEnd: 1, _id: 1 });
  router.use(requireSession, financeAccess(database));

  async function members(workspaceId) {
    const workspace = await workspaces.findOne({ _id: workspaceId }, { projection: { members: 1 } });
    const userIds = workspace?.members.map(({ userId }) => userId) ?? [];
    return users.find(
      { _id: { $in: userIds } }, { projection: { email: 1 } },
    ).sort({ email: 1 }).toArray();
  }

  router.get('/', async (request, response) => {
    const workspaceId = request.workspaceId;
    const page = Number(request.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
      return response.status(400).json({ message: 'Choose a page from 1 to 1,000.' });
    }
    const [items, owners, vendorLabels] = await Promise.all([
      subscriptions.find({ workspaceId }).sort({ contractEnd: 1, _id: 1 }).skip((page - 1) * 25).limit(26).toArray(),
      members(workspaceId),
      aliases.distinct('vendor', { workspaceId }),
    ]);
    const vendors = [...new Map(vendorLabels.sort().map((label) => [merchantKey(label), label])).values()];
    response.json({
      items: items.slice(0, 25).map(toResponse),
      owners: owners.map((owner) => ({ id: owner._id.toHexString(), email: owner.email })),
      vendors,
      hasMore: page < 1000 && items.length > 25,
    });
  });

  router.post('/', async (request, response) => {
    const record = await validate(request, response);
    if (!record) return;
    const result = await subscriptions.insertOne({
      ...record, workspaceId: request.workspaceId, createdAt: new Date(), createdBy: request.session.userId,
    });
    response.status(201).json(toResponse({ ...record, _id: result.insertedId }));
  });

  router.put('/:subscriptionId', async (request, response) => {
    const id = readId(request.params.subscriptionId);
    if (!id) return response.status(404).json({ message: 'Subscription not found.' });
    const record = await validate(request, response);
    if (!record) return;
    const updated = await subscriptions.findOneAndUpdate(
      { _id: id, workspaceId: request.workspaceId },
      [{ $set: {
        renewalDecision: {
          $cond: [{ $eq: ['$noticeDeadline', record.noticeDeadline] }, '$renewalDecision', '$$REMOVE'],
        },
        ...Object.fromEntries(Object.entries(record).map(([key, value]) => [key, { $literal: value }])),
        updatedAt: '$$NOW',
        updatedBy: request.session.userId,
      } }],
      { returnDocument: 'after' },
    );
    if (!updated) return response.status(404).json({ message: 'Subscription not found.' });
    response.json(toResponse(updated));
  });

  async function validate(request, response) {
    const body = request.body ?? {};
    const vendor = readText(body.vendor);
    const name = readText(body.name);
    const ownerId = readId(body.ownerId);
    const billingCycle = body.billingCycle;
    const autoRenew = body.autoRenew;
    const contractEnd = readText(body.contractEnd);
    const noticeDeadline = readText(body.noticeDeadline);
    const noticeEvidence = readText(body.noticeEvidence);
    if (!vendor || vendor.length > 120 || !name || name.length > 120 || !ownerId
      || /(?:\d[ -]?){12,}/.test(vendor) || /(?:\d[ -]?){12,}/.test(name)
      || !billingCycles.includes(billingCycle) || !autoRenewOptions.includes(autoRenew)
      || (contractEnd && !validDate(contractEnd)) || (noticeDeadline && !validDate(noticeDeadline))
      || (noticeDeadline && (!contractEnd || noticeDeadline > contractEnd))
      || (noticeDeadline && (!noticeEvidence || body.verifyNotice !== true))
      || (noticeEvidence && !noticeDeadline) || noticeEvidence.length > 500
      || /(?:\d[ -]?){12,}/.test(noticeEvidence)) {
      response.status(400).json({ message: 'Check the contract fields. A verified notice deadline needs a contract end date, evidence, and confirmation.' });
      return null;
    }
    const owners = await members(request.workspaceId);
    if (!owners.some(({ _id }) => _id.equals(ownerId))) {
      response.status(400).json({ message: 'Choose an owner who belongs to this workspace.' });
      return null;
    }
    return {
      vendor, vendorKey: merchantKey(vendor), name, ownerId, billingCycle, autoRenew,
      contractEnd: contractEnd || null,
      noticeDeadline: noticeDeadline || null,
      noticeEvidence: noticeEvidence || null,
      noticeVerifiedAt: noticeDeadline ? new Date() : null,
      noticeVerifiedBy: noticeDeadline ? request.session.userId : null,
    };
  }

  return router;
}

function readText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readId(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) ? new ObjectId(value) : null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toResponse(record) {
  const { _id, vendor, name, ownerId, billingCycle, autoRenew, contractEnd,
    noticeDeadline, noticeEvidence, noticeVerifiedAt } = record;
  return { id: _id.toHexString(), vendor, name, ownerId: ownerId.toHexString(), billingCycle, autoRenew,
    contractEnd, noticeDeadline, noticeEvidence, noticeVerifiedAt };
}
