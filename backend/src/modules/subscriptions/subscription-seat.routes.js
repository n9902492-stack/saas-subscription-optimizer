import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { parse } from 'csv-parse/sync';
import { fetchCopilotSeats } from './copilot-seats.js';

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

  router.get('/:subscriptionId/seats/copilot', async (request, response) => {
    const filter = subscriptionFilter(request);
    if (!filter) return notFound(response);
    const record = await subscriptions.findOne(filter, { projection: { _id: 1 } });
    if (!record) return notFound(response);
    const config = copilotConfig(request.workspaceId);
    response.set('Cache-Control', 'no-store').json({ organization: config?.org ?? null });
  });

  router.post('/:subscriptionId/seats/copilot', async (request, response) => {
    const filter = subscriptionFilter(request);
    if (!filter) return notFound(response);
    const config = copilotConfig(request.workspaceId);
    if (!config) return response.status(409).json({ message: 'GitHub Copilot sync is not configured for this workspace.' });
    const { expectedRevision } = request.body ?? {};
    if (!validRevision(expectedRevision)) {
      return response.status(400).json({ message: 'Refresh the saved snapshot before syncing.' });
    }
    const versionedFilter = { ...filter, 'seatSnapshot.revision': expectedRevision };
    const current = await subscriptions.findOne(versionedFilter, { projection: { 'seatSnapshot.purchasedSeats': 1 } });
    if (!current) return response.status(409).json({ message: 'The subscription or seat snapshot changed. Refresh before syncing.' });
    let rows;
    try {
      rows = await fetchCopilotSeats(config.org, config.token);
    } catch (error) {
      const message = error.name === 'TimeoutError' ? 'GitHub sync timed out. Try again.' :
        error instanceof TypeError || error instanceof SyntaxError ? 'GitHub seat data could not be retrieved.' : error.message;
      return response.status(502).json({ message });
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const summary = summarizeSeats(rows, dateValue(asOf));
    const updated = await saveSnapshot(subscriptions, versionedFilter, request.session.userId, {
      ...summary, source: 'copilot', organization: config.org, asOf,
      purchasedSeats: current.seatSnapshot?.purchasedSeats ?? null,
    });
    if (!updated) return response.status(409).json({ message: 'The seat snapshot changed during sync. Refresh before trying again.' });
    response.set('Cache-Control', 'no-store').json(updated.seatSnapshot);
  });

  router.put('/:subscriptionId/seats', async (request, response) => {
    const filter = subscriptionFilter(request);
    if (!filter) return notFound(response);
    const { csv, asOf, purchasedSeats, expectedRevision } = request.body ?? {};
    let snapshot;
    try {
      if (!validRevision(expectedRevision)) {
        throw new Error('Refresh the saved snapshot before importing.');
      }
      snapshot = parseSnapshot(csv, asOf, purchasedSeats);
    } catch (error) {
      return response.status(400).json({ message: error.message });
    }
    const updated = await saveSnapshot(subscriptions,
      { ...filter, 'seatSnapshot.revision': expectedRevision }, request.session.userId, snapshot);
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
  const assigned = rows.map((row, index) => {
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
    return { account, lastActivity };
  });
  return { source: 'csv', asOf, purchasedSeats, ...summarizeSeats(assigned, reference) };
}

function summarizeSeats(rows, reference) {
  const counts = { active: 0, candidate: 0, unknown: 0 };
  const seats = rows.map(({ account, lastActivity }) => {
    const status = !lastActivity ? 'unknown' :
      reference - dateValue(lastActivity) >= inactivityDays * dayMs ? 'candidate' : 'active';
    counts[status] += 1;
    return { account, lastActivity, status };
  });
  return { inactivityDays, counts, seats };
}

function validRevision(value) {
  return value === null || (typeof value === 'string' && objectIdPattern.test(value));
}

function copilotConfig(workspaceId) {
  const { COPILOT_WORKSPACE_ID, COPILOT_ORG, COPILOT_READ_TOKEN } = process.env;
  if (workspaceId.toHexString() !== COPILOT_WORKSPACE_ID?.toLowerCase() ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(COPILOT_ORG ?? '') || !COPILOT_READ_TOKEN) return null;
  return { org: COPILOT_ORG, token: COPILOT_READ_TOKEN };
}

function saveSnapshot(subscriptions, filter, userId, snapshot) {
  return subscriptions.findOneAndUpdate(filter, {
    $set: { seatSnapshot: { ...snapshot, revision: new ObjectId().toHexString(),
      importedAt: new Date(), importedBy: userId } },
  }, { projection: { seatSnapshot: 1 }, returnDocument: 'after' });
}
