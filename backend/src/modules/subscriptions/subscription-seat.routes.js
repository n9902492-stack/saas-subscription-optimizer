import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { parse } from 'csv-parse/sync';

const objectIdPattern = /^[a-f\d]{24}$/i;
const dayMs = 86_400_000;
const inactivityDays = 60;

export function subscriptionSeatRoutes(subscriptions) {
  const router = Router();

  router.get('/:subscriptionId/seats', async (request, response) => {
    const filter = subscriptionFilter(request);
    if (!filter) return notFound(response);
    const record = await subscriptions.findOne(filter, { projection: { seatSnapshot: 1 } });
    if (!record) return notFound(response);
    response.set('Cache-Control', 'no-store').json(record.seatSnapshot ?? null);
  });

  router.put('/:subscriptionId/seats', async (request, response) => {
    const filter = subscriptionFilter(request);
    if (!filter) return notFound(response);
    const { csv, asOf, purchasedSeats, expectedRevision } = request.body ?? {};
    let snapshot;
    try {
      if (!(expectedRevision === null ||
        (typeof expectedRevision === 'string' && objectIdPattern.test(expectedRevision)))) {
        throw new Error('Refresh the saved snapshot before importing.');
      }
      snapshot = parseSnapshot(csv, asOf, purchasedSeats);
    } catch (error) {
      return response.status(400).json({ message: error.message });
    }
    const updated = await subscriptions.findOneAndUpdate(
      { ...filter, 'seatSnapshot.revision': expectedRevision },
      { $set: { seatSnapshot: {
        ...snapshot, revision: new ObjectId().toHexString(),
        importedAt: new Date(), importedBy: request.session.userId,
      } } },
      { projection: { seatSnapshot: 1 }, returnDocument: 'after' },
    );
    if (!updated) return response.status(409).json({ message: 'The subscription or seat snapshot changed. Refresh before replacing it.' });
    response.json(updated.seatSnapshot);
  });

  return router;
}

function subscriptionFilter(request) {
  const id = request.params.subscriptionId;
  return objectIdPattern.test(id) ? { _id: new ObjectId(id), workspaceId: request.workspaceId } : null;
}

function notFound(response) {
  return response.status(404).json({ message: 'Subscription not found.' });
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? NaN : date.getTime();
}

function parseSnapshot(csv, asOf, purchasedSeats) {
  const reference = dateValue(asOf);
  if (!Number.isFinite(reference) || reference > Date.now()) throw new Error('Choose a valid snapshot date that is not in the future.');
  if (purchasedSeats !== null && (!Number.isSafeInteger(purchasedSeats) || purchasedSeats < 0)) {
    throw new Error('Purchased seats must be zero or a positive whole number.');
  }
  if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv) > 131_072) {
    throw new Error('Choose a UTF-8 CSV file no larger than 128 KiB.');
  }

  let records;
  try {
    records = parse(csv, { bom: true, trim: true, skip_empty_lines: true, max_record_size: 4096 });
  } catch {
    throw new Error('Check CSV quoting and make sure each row has the same number of columns.');
  }
  const [columns = [], ...rows] = records;
  const headers = columns.map((name) => name.toLowerCase());
  const accountIndex = headers.indexOf('account');
  const activityIndex = headers.indexOf('last_activity');
  if (accountIndex < 0 || activityIndex < 0 || new Set(headers).size !== headers.length ||
      columns.length > 40 || !rows.length || rows.length > 1000) {
    throw new Error('Include unique account and last_activity headers and 1–1,000 seat rows.');
  }

  const accounts = new Set();
  const counts = { active: 0, candidate: 0, unknown: 0 };
  const seats = rows.map((row, index) => {
    const account = row[accountIndex].trim();
    const key = account.toLowerCase();
    if (!account || account.length > 160 || accounts.has(key) || /(?:\d[ -]?){12,}/.test(account)) {
      throw new Error(`Seat row ${index + 1} needs a unique account identifier without payment details.`);
    }
    accounts.add(key);
    const lastActivity = row[activityIndex]?.trim() || null;
    const activity = dateValue(lastActivity);
    if (lastActivity && (!Number.isFinite(activity) || activity > reference)) {
      throw new Error(`Seat row ${index + 1} needs a valid activity date on or before the snapshot date, or a blank value.`);
    }
    const status = !lastActivity ? 'unknown' : reference - activity >= inactivityDays * dayMs ? 'candidate' : 'active';
    counts[status] += 1;
    return { account, lastActivity, status };
  });
  return { source: 'csv', asOf, purchasedSeats, inactivityDays, counts, seats };
}
