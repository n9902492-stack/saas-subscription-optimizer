import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/features/workspaces/api-client.js';

test('API failures remain actionable without revealing HTML error bodies', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const [status, message] of [[404, /latest routes/], [429, /Too many requests/], [500, /API is unavailable/], [502, /API is unavailable/], [503, /API is unavailable/]]) {
    globalThis.fetch = async () => new Response('<html>internal error details</html>', { status });
    await assert.rejects(request('/api/auth/forgot-password'), message);
  }
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(request('/api/auth/forgot-password'), /Cannot connect to the API/);
});

test('API messages, success responses, and cancelled requests are preserved', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ message: 'Password recovery email is unavailable right now.' }, { status: 503 });
  await assert.rejects(request('/api/auth/forgot-password'), /Password recovery email is unavailable/);
  globalThis.fetch = async () => Response.json({ message: 'Request accepted.' }, { status: 202 });
  assert.deepEqual(await request('/api/auth/forgot-password'), { message: 'Request accepted.' });
  globalThis.fetch = async () => Response.json(null);
  assert.equal(await request('/api/subscriptions/example/seats'), null);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await request('/api/auth/signout'), undefined);
  globalThis.fetch = async () => new Response('<html>Unexpected</html>');
  await assert.rejects(request('/api/auth/forgot-password'), /unexpected response/);
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw controller.signal.reason; };
  await assert.rejects(request('/api/auth/forgot-password', { signal: controller.signal }), { name: 'AbortError' });
});
