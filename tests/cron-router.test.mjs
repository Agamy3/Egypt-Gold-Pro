import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobWorker } from '../lib/worker/cron-router.mjs';
import website from '../cloudflare-cron-entry.mjs';
const env = { CRON_SECRET: 'local-test-secret', CRON_TEST_CONFIG: 'available-before-import', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only' };
const req = (path, headers = {}, method = 'GET') => new Request('https://jobs.test' + path, { method, headers });
const auth = { 'x-cron-secret': env.CRON_SECRET };

test('reject missing/wrong credentials, including forged Vercel headers, before loading jobs', async () => {
  let loaded = 0;
  const worker = createJobWorker({ '/api/cron/ingest-eg': () => { loaded++; throw Error('must not load'); } });
  for (const headers of [{}, { 'x-cron-secret': 'wrong' }, { 'x-vercel-id': 'forged', 'x-vercel-cron': '1' }]) {
    assert.equal((await worker.fetch(req('/api/cron/ingest-eg', headers), env)).status, 401);
  }
  assert.equal((await worker.fetch(req('/api/cron/worker-health', auth), {})).status, 401);
  assert.equal(loaded, 0);
});

test('native job routing initializes environment first and preserves body/status/no-store', async () => {
  const old = process.env.CRON_TEST_CONFIG;
  const worker = createJobWorker({ '/api/cron/ingest-eg': async () => {
    assert.equal(process.env.CRON_TEST_CONFIG, env.CRON_TEST_CONFIG);
    return { GET: async () => Response.json({ inserted: 3 }, { status: 202 }) };
  } });
  try {
    const res = await worker.fetch(req('/api/cron/ingest-eg', auth), env);
    assert.equal(res.status, 202);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { inserted: 3 });
    assert.equal((await worker.fetch(req('/api/cron/ingest-eg', auth, 'DELETE'), env)).status, 405);
    assert.equal((await worker.fetch(req('/unknown', auth), env)).status, 404);
  } finally {
    if (old === undefined) delete process.env.CRON_TEST_CONFIG; else process.env.CRON_TEST_CONFIG = old;
    delete process.env.CRON_SECRET;
  }
});

test('health check imports no business logic; failures return generic errors', async () => {
  let calls = 0;
  const worker = createJobWorker({ '/api/cron/notify': async () => { calls++; throw Error('private detail'); } });
  assert.deepEqual(await (await worker.fetch(req('/api/cron/worker-health', auth), env)).json(), { ok: true, runtime: 'native-cron' });
  assert.equal(calls, 0);
  const res = await worker.fetch(req('/api/cron/notify', auth), env);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Job failed' });
});

test('website cron requests use the service binding without loading Next', async () => {
  const request = req('/api/cron/ingest-eg', auth);
  const res = await website.fetch(request, { CRON_JOBS: { fetch: async input => {
    assert.equal(input, request); return Response.json({ native: true });
  } } }, {});
  assert.deepEqual(await res.json(), { native: true });
});

test('scheduled jobs prefer private service binding over public HTTP', async () => {
  const pending = [], paths = [];
  await website.scheduled({ cron: '* * * * *' }, { ...env, CRON_JOBS: { fetch: async (request, options) => {
    paths.push(new URL(request.url).pathname);
    assert.equal(request.headers.get('x-cron-secret'), env.CRON_SECRET);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null);
  } } }, { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  assert.deepEqual(paths, ['/api/cron/ingest-eg', '/api/cron/notifications-eval']);
});
