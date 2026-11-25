import { Router } from 'express';
import { financeAccess } from '../workspaces/finance-access.js';
import { merchantKey } from './merchant-key.js';

const pageSize = 25;

export async function transactionRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const imports = database.collection('statementImports');
  const aliases = database.collection('merchantAliases');
  await aliases.createIndex({ workspaceId: 1, merchantKey: 1 }, { unique: true });

  router.use(requireSession, financeAccess(database));

  router.get('/monthly-spend', async (request, response) => {
    const rows = await imports.aggregate([
      { $match: { workspaceId: request.workspaceId } },
      { $unwind: '$transactions' },
      { $group: { _id: { month: { $substrBytes: ['$transactions.date', 0, 7] }, currency: '$transactions.currency' }, amount: { $sum: '$transactions.amount' }, count: { $sum: 1 } } },
      { $sort: { '_id.month': 1, '_id.currency': 1 } },
    ]).toArray();
    response.json({ items: rows.map(row => ({ ...row._id, amount: row.amount.toString(), count: row.count })) });
  });

  router.get('/', async (request, response) => {
    const page = Number(request.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
      return response.status(400).json({ message: 'Choose a page from 1 to 1,000.' });
    }

    const workspaceId = request.workspaceId;
    const rows = await imports.aggregate([
      { $match: { workspaceId } },
      { $unwind: { path: '$transactions', includeArrayIndex: 'rowIndex' } },
      { $sort: { 'transactions.date': -1, _id: -1, rowIndex: 1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize + 1 },
      { $lookup: {
        from: 'paymentSources',
        let: { sourceId: '$paymentSourceId' },
        pipeline: [
          { $match: { workspaceId, $expr: { $eq: ['$_id', '$$sourceId'] } } },
          { $project: { label: 1, lastFour: 1 } },
        ],
        as: 'source',
      } },
      { $project: { transactions: 1, rowIndex: 1, source: { $first: '$source' } } },
    ]).toArray();

    const pageRows = rows.slice(0, pageSize);
    const keys = [...new Set(pageRows.map(({ transactions }) => merchantKey(transactions.merchant)))];
    const matches = await aliases.find(
      { workspaceId, merchantKey: { $in: keys } },
      { projection: { merchantKey: 1, vendor: 1 } },
    ).toArray();
    const vendors = new Map(matches.map((item) => [item.merchantKey, item.vendor]));

    response.json({
      page,
      hasMore: page < 1000 && rows.length > pageSize,
      items: pageRows.map(({ _id, rowIndex, transactions, source }) => ({
        id: `${_id}:${rowIndex}`,
        importId: _id.toHexString(),
        ...transactions,
        amount: transactions.amount.toString(),
        source: source ? { label: source.label, lastFour: source.lastFour } : null,
        vendor: vendors.get(merchantKey(transactions.merchant)) ?? null,
      })),
    });
  });

  router.put('/merchant-match', async (request, response) => {
    const merchant = typeof request.body?.merchant === 'string' ? request.body.merchant.trim() : '';
    const vendor = typeof request.body?.vendor === 'string' ? request.body.vendor.trim().replace(/\s+/g, ' ') : '';
    if (!merchant || merchant.length > 160 || !vendor || vendor.length > 120 || /(?:\d[ -]?){12,}/.test(vendor)) {
      return response.status(400).json({ message: 'Enter a vendor name up to 120 characters without card details.' });
    }
    const workspaceId = request.workspaceId;
    const existing = await imports.findOne(
      { workspaceId, 'transactions.merchant': merchant }, { projection: { _id: 1 } },
    );
    if (!existing) return response.status(404).json({ message: 'Merchant was not found in this workspace.' });

    const key = { workspaceId, merchantKey: merchantKey(merchant) };
    const changes = { $set: { vendor, updatedBy: request.session.userId, updatedAt: new Date() } };
    try {
      await aliases.updateOne(key, changes, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await aliases.updateOne(key, changes);
    }
    response.json({ vendor });
  });

  return router;
}
