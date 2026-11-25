import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { MongoClient, ObjectId, Decimal128 } from 'mongodb';
import { createApp } from '../src/app.js';

async function fixture(t) {
  const client = await new MongoClient(process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017').connect();
  const db = client.db(`inventory_test_${randomBytes(8).toString('hex')}`);
  const server = (await createApp(db, { mailer: { configured: false } })).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); assert.ok(db.databaseName.startsWith('inventory_test_')); await db.dropDatabase(); await client.close(); });
  const response = await fetch(`${origin}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.test', password: 'Inventory password 123' }) });
  const { token } = await response.json();
  const user = await db.collection('users').findOne({ email: 'owner@example.test' });
  const workspaceId = new ObjectId(), otherWorkspace = new ObjectId(), colleague = new ObjectId();
  await db.collection('users').insertOne({ _id: colleague, email: 'finance@example.test' });
  await db.collection('workspaces').insertOne({ _id: workspaceId, name: 'QA', members: [{ userId: user._id, role: 'Admin' }, { userId: colleague, role: 'Finance' }] });
  async function get(path) {
    const result = await fetch(`${origin}/api/workspaces/${workspaceId}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: result.status, data: await result.json() };
  }
  return { db, user, workspaceId, otherWorkspace, colleague, get };
}

test('inventory search spans all pages, escapes patterns, scopes workspaces, and returns safe seat metadata', async t => {
  const { db, user, workspaceId, otherWorkspace, colleague, get } = await fixture(t);
  const records = Array.from({ length: 30 }, (_, i) => ({ workspaceId, name: `Application ${String(i).padStart(2, '0')}`, vendor: i === 29 ? 'Notion [team]' : 'Linear', ownerId: i === 29 ? colleague : user._id, billingCycle: 'monthly', autoRenew: 'unknown', contractEnd: '2027-01-01' }));
  records[0].seatSnapshot = { source: 'csv', asOf: '2026-11-01', importedAt: new Date('2026-11-02T12:00:00Z'), inactivityDays: 60, purchasedSeats: 5, counts: { active: 1, candidate: 1, unknown: 1 }, seats: [{ account: 'never-expose-seat-account@example.test' }] };
  await db.collection('subscriptions').insertMany(records);
  await db.collection('subscriptions').insertOne({ ...records[29], _id: new ObjectId(), workspaceId: otherWorkspace, name: 'Foreign subscription' });
  const first = await get('subscriptions');
  assert.equal(first.data.total, 30); assert.equal(first.data.items.length, 25); assert.equal(first.data.hasMore, true);
  assert.equal((await get('subscriptions?page=2')).data.items.length, 5);
  const seat = first.data.items.find(item => item.seatSummary)?.seatSummary;
  assert.deepEqual(seat, { assigned: 3, active: 1, inactive: 1, unknown: 1, inactivityDays: 60, asOf: '2026-11-01', updatedAt: '2026-11-02T12:00:00.000Z', purchased: 5, source: 'csv' });
  assert.ok(!JSON.stringify(first.data).includes('never-expose-seat-account'));
  assert.equal(first.data.items.find(item => !item.seatSummary).seatSummary, null);
  const search = await get('subscriptions?q=notion');
  assert.equal(search.data.total, 1); assert.equal(search.data.items[0].name, 'Application 29');
  assert.equal((await get('subscriptions?q=%5Bteam%5D')).data.total, 1);
  assert.equal((await get('subscriptions?q=.%2A')).data.total, 0);
  assert.equal((await get('subscriptions?q=finance%40example.test')).data.total, 1);
  assert.equal((await get('subscriptions?q=Foreign')).data.total, 0);
  assert.equal((await get(`subscriptions?q=${'x'.repeat(121)}`)).status, 400);
  await db.collection('workspaces').updateOne({ _id: workspaceId }, { $set: { 'members.0.role': 'App Owner' } });
  assert.equal((await get('subscriptions')).status, 403);
});

test('upcoming renewal ordering and focused links preserve workspace and owner permissions', async t => {
  const { db, user, workspaceId, otherWorkspace, colleague, get } = await fixture(t);
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const records = [-2, 14, 3].map(offset => ({ _id: new ObjectId(), workspaceId, ownerId: user._id, name: `Due ${offset}`, vendor: 'QA', noticeDeadline: day(offset), noticeVerifiedAt: new Date() }));
  const foreign = { ...records[2], _id: new ObjectId(), workspaceId: otherWorkspace };
  const otherOwner = { ...records[2], _id: new ObjectId(), ownerId: colleague };
  await db.collection('subscriptions').insertMany([...records, foreign, otherOwner]);
  const upcoming = await get('renewal-decisions?upcoming=true&sort=notice-asc');
  assert.equal(upcoming.data.items.length, 3);
  assert.deepEqual(upcoming.data.items.map(item => item.noticeDeadline), [day(3), day(3), day(14)]);
  assert.equal((await get(`renewal-decisions?subscriptionId=${foreign._id}`)).data.items.length, 0);
  assert.equal((await get('renewal-decisions?subscriptionId=invalid')).status, 400);
  assert.equal((await get('renewal-decisions?sort=invalid')).status, 400);
  await db.collection('workspaces').updateOne({ _id: workspaceId }, { $set: { 'members.0.role': 'App Owner' } });
  assert.equal((await get('renewal-decisions?upcoming=true&sort=notice-asc')).data.items.length, 2);
  assert.equal((await get(`renewal-decisions?subscriptionId=${otherOwner._id}`)).data.items.length, 0);
  const own = await get(`renewal-decisions?subscriptionId=${records[2]._id}`);
  assert.equal(own.data.items.length, 1); assert.equal(own.data.items[0].canTrackExecution, false);
});

test('recorded spend remains exact, separated by currency, with refunds reducing vendor totals', async t => {
  const { db, workspaceId, get } = await fixture(t);
  await db.collection('merchantAliases').insertOne({ workspaceId, merchantKey: 'linear', vendor: 'Linear' });
  await db.collection('statementImports').insertOne({ workspaceId, transactions: [
    { merchant: 'LINEAR', currency: 'USD', amount: Decimal128.fromString('120.0001') },
    { merchant: 'LINEAR', currency: 'USD', amount: Decimal128.fromString('-20') },
    { merchant: 'LINEAR', currency: 'EUR', amount: Decimal128.fromString('90') },
  ] });
  const { data } = await get('vendors');
  assert.deepEqual(data.totals.map(({ currency, amount }) => ({ currency, amount })), [{ currency: 'EUR', amount: '90' }, { currency: 'USD', amount: '100.0001' }]);
  assert.equal(data.vendors.length, 1); assert.equal(data.categories, undefined);
});

test('monthly spend aggregates all saved rows by month and currency with refunds and workspace isolation', async t => {
  const { db, workspaceId, otherWorkspace, get } = await fixture(t);
  await db.collection('statementImports').insertMany([
    {workspaceId,hash:"a",transactions:Array.from({length:30},()=>({date:'2026-11-20',currency:'USD',amount:Decimal128.fromString('4')}))},
    {workspaceId,hash:"b",transactions:[{date:'2026-11-21',currency:'USD',amount:Decimal128.fromString('-10.0001')},{date:'2026-11-21',currency:'EUR',amount:Decimal128.fromString('7')},{date:'2026-10-01',currency:'USD',amount:Decimal128.fromString('5')}]},
    {workspaceId:otherWorkspace,transactions:[{date:'2026-11-21',currency:'USD',amount:Decimal128.fromString('999')}]},
  ]);
  const result=await get('transactions/monthly-spend');
  assert.equal(result.status,200);
  assert.deepEqual(result.data.items,[{month:'2026-10',currency:'USD',amount:'5',count:1},{month:'2026-11',currency:'EUR',amount:'7',count:1},{month:'2026-11',currency:'USD',amount:'109.9999',count:31}]);
});
