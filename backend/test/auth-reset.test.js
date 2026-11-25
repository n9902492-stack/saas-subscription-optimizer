import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createApp } from '../src/app.js';
import { resetMailer } from '../src/modules/auth/reset-mailer.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const confirmation = 'If an account exists for this email, a reset link has been requested. Check your inbox and spam folder. Links expire after 30 minutes.';
const oldPassword = 'Old password for test 123';
const newPassword = 'New password for test 456';

async function fixture(t, suppliedMailer) {
  // An isolated, disposable database; never run these checks against application records.
  const client = await new MongoClient(process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017').connect();
  const db = client.db(`auth_reset_test_${randomBytes(8).toString('hex')}`);
  const messages = [];
  const mailer = suppliedMailer ?? { configured: true, verify: async () => {}, send: async (email, token) => { messages.push({ email, token }); } };
  const app = await createApp(db, { mailer });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    assert.ok(db.databaseName.startsWith('auth_reset_test_'));
    await db.dropDatabase();
    await client.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function post(path, body) {
    const response = await fetch(`${url}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const email = 'recovery@example.test';
  const signup = await post('signup', { email, password: oldPassword });
  assert.equal(signup.status, 201);
  return { db, url, email, post, messages, session: signup.body.token };
}

test('reset succeeds, unknown email is indistinguishable, tokens are hashed and single use, sessions are revoked', async t => {
  const { db, url, email, post, messages, session } = await fixture(t);
  const known = await post('forgot-password', { email: email.toUpperCase() });
  const unknown = await post('forgot-password', { email: 'unknown@example.test' });
  assert.deepEqual(known, { status: 202, body: { message: confirmation } });
  assert.deepEqual(unknown, known);
  assert.equal(messages.length, 1);
  const raw = messages[0].token;
  const user = await db.collection('users').findOne({ email });
  assert.equal(user.passwordReset.hash, digest(raw));
  assert.ok(!JSON.stringify(user).includes(raw));
  assert.equal(user.passwordReset.expiresAt - user.passwordReset.requestedAt, 30 * 60_000);
  await post('forgot-password', { email });
  assert.equal(messages.length, 1, 'account cooldown prevents duplicate mail');
  assert.equal((await post('reset-password', { token: raw, password: 'short', confirmPassword: 'short' })).status, 400);
  assert.equal((await post('reset-password', { token: raw, password: newPassword, confirmPassword: 'mismatch' })).status, 400);
  assert.equal((await post('reset-password', { token: raw, password: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) })).status, 400);
  const legacy = await db.collection('sessions').findOne({ _id: digest(session) });
  assert.equal((await post('reset-password', { token: raw, password: newPassword, confirmPassword: newPassword })).status, 200);
  assert.equal((await post('reset-password', { token: raw, password: newPassword, confirmPassword: newPassword })).status, 400);
  assert.equal((await post('signin', { email, password: oldPassword })).status, 401);
  assert.equal((await post('signin', { email, password: newPassword })).status, 200);
  assert.equal((await fetch(`${url}/api/workspaces`, { headers: { Authorization: `Bearer ${session}` } })).status, 401);
  assert.equal(await db.collection('sessions').findOne({ _id: legacy._id }), null);
  // Even a stale session surviving physical cleanup cannot authorize requests.
  await db.collection('sessions').insertOne(legacy);
  assert.equal((await fetch(`${url}/api/workspaces`, { headers: { Authorization: `Bearer ${session}` } })).status, 401);
  const updated = await db.collection('users').findOne({ email });
  assert.equal(updated.passwordReset, undefined);
  assert.notEqual(updated.passwordHash, user.passwordHash);
  assert.notEqual(updated.salt, user.salt);
});

test('expired and superseded links fail; concurrent consumption succeeds exactly once', async t => {
  const { db, email, post, messages } = await fixture(t);
  await post('forgot-password', { email });
  const expired = messages[0].token;
  await db.collection('users').updateOne({ email }, { $set: {
    'passwordReset.expiresAt': new Date(Date.now() - 1),
    'passwordReset.requestedAt': new Date(Date.now() - 61_000),
  } });
  assert.equal((await post('reset-password', { token: expired, password: newPassword, confirmPassword: newPassword })).status, 400);
  await post('forgot-password', { email });
  const replaced = messages[1].token;
  await db.collection('users').updateOne({ email }, { $set: { 'passwordReset.requestedAt': new Date(Date.now() - 61_000) } });
  await post('forgot-password', { email });
  assert.equal((await post('reset-password', { token: replaced, password: newPassword, confirmPassword: newPassword })).status, 400);
  const token = messages[2].token;
  const results = await Promise.all([1, 2].map(() => post('reset-password', { token, password: newPassword, confirmPassword: newPassword })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  assert.equal((await post('reset-password', { token: 'invalid', password: newPassword, confirmPassword: newPassword })).status, 400);
});

test('recovery requests are rate limited', async t => {
  const { post } = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await post('forgot-password', { email: 'unknown@example.test' })).status, 202);
  assert.equal((await post('forgot-password', { email: 'unknown@example.test' })).status, 429);
});

test('unconfigured and unreachable email delivery return identical honest errors for known and unknown addresses', async t => {
  for (const mailer of [{ configured: false }, { configured: true, verify: async () => { throw new Error('Unavailable'); } }]) {
    const { post, email } = await fixture(t, mailer);
    const known = await post('forgot-password', { email });
    const unknown = await post('forgot-password', { email: 'unknown@example.test' });
    assert.equal(known.status, 503);
    assert.deepEqual(known, unknown);
  }
  assert.equal(resetMailer({}).configured, false);
  assert.equal(resetMailer({ PUBLIC_APP_URL: 'http://public.example.test', SMTP_HOST: 'smtp.example.test', SMTP_FROM: 'support@example.test' }).configured, false);
});

test('SMTP transport sends a reset link without putting the secret in its request URL', async t => {
  const received = [];
  const smtp = createServer(socket => {
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '', inData = false, message = [];
    socket.on('data', chunk => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') { received.push(message.join('\n')); message = []; inData = false; socket.write('250 accepted\r\n'); }
          else message.push(line);
        } else if (/^EHLO/i.test(line)) socket.write('250-localhost\r\n250 SIZE 100000\r\n');
        else if (/^DATA/i.test(line)) { inData = true; socket.write('354 Send message\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0, '127.0.0.1'); await once(smtp, 'listening');
  t.after(() => new Promise(resolve => smtp.close(resolve)));
  const mailer = resetMailer({ PUBLIC_APP_URL: 'http://localhost:3000', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_FROM: 'SaaS Optimizer <support@example.test>' });
  await mailer.verify();
  const token = randomBytes(32).toString('hex');
  await mailer.send('recipient@example.test', token);
  assert.equal(received.length, 1);
  const decoded = received[0].replace(/=\n/g, '').replaceAll('=3D', '=');
  assert.ok(decoded.includes(`/reset-password#token=${token}`));
  assert.ok(!decoded.includes(`/reset-password?token=${token}`));
});
