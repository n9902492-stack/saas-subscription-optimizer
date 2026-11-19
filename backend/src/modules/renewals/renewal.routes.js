import { Router } from 'express';
import { financeAccess } from '../workspaces/finance-access.js';

const dayMs = 86_400_000;
const dateKey = (date) => date.toISOString().slice(0, 10);

export async function renewalRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const subscriptions = database.collection('subscriptions');
  await subscriptions.createIndex({ workspaceId: 1, noticeDeadline: 1, _id: 1 });
  router.use(requireSession, financeAccess(database));

  router.get('/', async (request, response) => {
    const today = dateKey(new Date());
    const month = request.query.month ?? today.slice(0, 7);
    if (typeof month !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === '9999-12') {
      return response.status(400).json({ message: 'Choose a month in YYYY-MM format.' });
    }
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const upcomingThrough = dateKey(new Date(Date.parse(today) + 29 * dayMs));
    const scope = { workspaceId: request.workspaceId, noticeVerifiedAt: { $type: 'date' } };

    async function deadlines(range) {
      const rows = await subscriptions.find({ ...scope, noticeDeadline: range }, {
        projection: { vendor: 1, name: 1, ownerId: 1, contractEnd: 1, noticeDeadline: 1 },
      }).sort({ noticeDeadline: 1, _id: 1 }).limit(201).toArray();
      return { truncated: rows.length > 200, entries: rows.slice(0, 200).map(({ _id, ...row }) => ({
        ...row, id: _id.toHexString(), ownerId: row.ownerId.toHexString(),
      })) };
    }

    const [calendar, upcoming, overdueCount, unverifiedCount, workspace] = await Promise.all([
      deadlines({ $gte: dateKey(start), $lt: dateKey(end) }),
      deadlines({ $gte: today, $lte: upcomingThrough }),
      subscriptions.countDocuments({ ...scope, noticeDeadline: { $type: 'string', $lt: today } }),
      subscriptions.countDocuments({
        workspaceId: request.workspaceId,
        $or: [{ noticeDeadline: null }, { noticeVerifiedAt: { $not: { $type: 'date' } } }],
      }),
      database.collection('workspaces').findOne({ _id: request.workspaceId }, { projection: { members: 1 } }),
    ]);

    const memberIds = workspace?.members.map(({ userId }) => userId) ?? [];
    const owners = await database.collection('users').find({ _id: { $in: memberIds } }, { projection: { email: 1 } }).toArray();
    const labels = new Map(owners.map(({ _id, email }) => [_id.toHexString(), email]));
    for (const row of [...calendar.entries, ...upcoming.entries]) {
      row.owner = labels.get(row.ownerId) ?? null;
      delete row.ownerId;
    }

    response.json({ month, today, upcomingThrough, calendar, upcoming, overdueCount, unverifiedCount });
  });

  return router;
}
