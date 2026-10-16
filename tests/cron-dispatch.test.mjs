import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-cron-entry.mjs';

test('cron dispatch preserves both minute jobs and drains bodies without decoding them', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const requests = [], pending = [], timers = [], cleared = [];
  let cancelled = 0;
  let drained = 0;
  globalThis.setTimeout = callback => { const id = { callback }; timers.push(id); return id; };
  globalThis.clearTimeout = id => cleared.push(id);
  globalThis.fetch = async (req, options) => {
    requests.push({ req, options });
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{not JSON}')); controller.close(); }, cancel() { cancelled++; } }).pipeThrough(new TransformStream({ transform(chunk, controller) { drained++; controller.enqueue(chunk); } })), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await worker.scheduled({ cron: '* * * * *' }, { CRON_SECRET: 'local-test-secret', NEXT_PUBLIC_SITE_URL: 'https://example.test/' }, { waitUntil: p => pending.push(p) });
    await Promise.all(pending);
    assert.deepEqual(requests.map(r => new URL(r.req.url).pathname), ['/api/cron/ingest-eg', '/api/cron/notifications-eval']);
    for (const { req, options } of requests) {
      assert.equal(req.headers.get('x-cron-secret'), 'local-test-secret');
      assert.ok(options.signal instanceof AbortSignal);
    }
    assert.equal(cancelled, 0);
    assert.equal(drained, 2);
    assert.deepEqual(cleared, timers);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('unknown schedules do not dispatch work', async () => {
  const pending = [];
  await worker.scheduled({ cron: 'unknown' }, { CRON_SECRET: 'test' }, { waitUntil: p => pending.push(p) });
  assert.equal(pending.length, 0);
});
