import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.ts';

type Call = { url: string; init: RequestInit };
function harness(responses: Array<Response | Error>, token: string | null = 'id-token') {
  const calls: Call[] = [];
  let signedOut = 0;
  const api = createApi({
    baseUrl: 'https://pulse.test/',
    getToken: async () => token,
    onUnauthorized: () => { signedOut++; },
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
  });
  return { api, calls, signedOut: () => signedOut };
}

test('lists follow nextOffset across pages with the bearer token', async () => {
  const { api, calls } = harness([Response.json({ data: [{ id: 1 }], nextOffset: 500 }), Response.json({ data: [{ id: 2 }], nextOffset: null })]);
  const result = await api.list('service_entries');
  assert.deepEqual(result, { data: [{ id: 1 }, { id: 2 }], error: null });
  assert.deepEqual(calls.map(call => call.url), ['https://pulse.test/api/mobile/data/service_entries', 'https://pulse.test/api/mobile/data/service_entries?offset=500']);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer id-token');
});
test('writes send JSON to the record path and return server errors', async () => {
  const { api, calls } = harness([Response.json({ error: { message: 'This record already exists.', code: '23505' } }, { status: 409 }), Response.json({ data: null })]);
  assert.deepEqual(await api.create('service_entries', { attendance: 5 }), { data: null, error: { message: 'This record already exists.', code: '23505' } });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"attendance":5}');
  assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json');
  await api.remove('service_entries', 'a b');
  assert.equal(calls[1].url, 'https://pulse.test/api/mobile/data/service_entries/a%20b');
});
test('a 401 or a missing token signs the person out without retrying', async () => {
  const expired = harness([Response.json({ error: { message: 'Sign in to Skyline Pulse to continue.' } }, { status: 401 })]);
  assert.equal((await expired.api.list('production_entries')).error?.code, 'unauthorized');
  assert.equal(expired.signedOut(), 1);
  const noToken = harness([], null);
  assert.equal((await noToken.api.status()).error?.code, 'unauthorized');
  assert.equal(noToken.calls.length, 0);
});
test('network failures and non-JSON replies become a connection error', async () => {
  const offline = harness([new Error('offline')]);
  assert.match((await offline.api.status()).error!.message, /Unable to connect/);
  const html = harness([new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } })]);
  assert.match((await html.api.list('service_entries')).error!.message, /Unable to connect/);
  const truncated = harness([new Response('{"data":', { headers: { 'Content-Type': 'application/json' } })]);
  assert.match((await truncated.api.list('service_entries')).error!.message, /Unable to connect/);
});
