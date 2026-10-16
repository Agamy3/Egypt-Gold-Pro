import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicDataCacheKey, withPublicDataCache } from '../lib/worker/public-data-cache.mjs';

function harness() {
  const entries = new Map();
  const pending = [];
  let calls = 0;
  return {
    cache: {
      match: async key => entries.get(key.url)?.clone(),
      put: async (key, response) => { entries.set(key.url, response); },
    },
    ctx: { waitUntil: promise => pending.push(promise) },
    next: async () => { calls++; return Response.json({ timestamp: 123, price: 4500 }, {
      headers: { 'Cache-Control': 'no-store', vary: 'rsc, next-router-state-tree' },
    }); },
    settle: () => Promise.all(pending),
    calls: () => calls,
    entries,
  };
}

test('repeated anonymous polls skip the application while browser caching stays disabled', async () => {
  const h = harness();
  const req = new Request('https://egyptgoldpro.com/api/marketSnapshot?country=EG&currency=EGP');
  const first = await withPublicDataCache(req, h.cache, h.ctx, h.next);
  assert.equal(first.headers.get('X-EGP-Data-Cache'), 'MISS');
  await h.settle();
  const hit = await withPublicDataCache(req, h.cache, h.ctx, h.next);
  assert.equal(hit.headers.get('X-EGP-Data-Cache'), 'HIT');
  assert.match(hit.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual(await hit.json(), await first.json());
  assert.equal(h.calls(), 1);
  assert.equal([...h.entries.values()][0].headers.get('Cache-Control'), 'public, max-age=15');
});

test('country, currency, range and trusted header variants cannot share entries', () => {
  const key = (query, headers) => publicDataCacheKey(new Request('https://egyptgoldpro.com/api/forecast/series?' + query, { headers })).url;
  assert.notEqual(key('country=EG'), key('country=US'));
  assert.notEqual(key('currency=EGP'), key('currency=USD'));
  assert.notEqual(key('range=daily'), key('range=monthly'));
  assert.notEqual(key('', { 'x-trusted-mode': 'true' }), key('', { 'x-trusted-mode': 'false' }));
  assert.notEqual(key(''), key('', { 'x-trusted-mode': 'false' }));
});

test('private routes, authenticated requests and router requests bypass the shared cache', () => {
  for (const path of ['/api/portfolio', '/api/admin/settings', '/api/cron/ingest-eg', '/account', '/api/marketSnapshot/extra']) {
    assert.equal(publicDataCacheKey(new Request('https://egyptgoldpro.com' + path)), null);
  }
  for (const header of ['cookie', 'authorization', 'rsc', 'next-router-prefetch', 'range']) {
    assert.equal(publicDataCacheKey(new Request('https://egyptgoldpro.com/api/forecast', { headers: { [header]: 'value' } })), null);
  }
  assert.equal(publicDataCacheKey(new Request('https://egyptgoldpro.com/api/forecast', { method: 'POST' })), null);
});

test('errors, session cookies, non-JSON and unsupported Vary responses are never stored', async () => {
  for (const response of [Response.json({ error: true }, { status: 500 }),
    Response.json({}, { headers: { 'set-cookie': 'session=private' } }),
    new Response('<html>'), Response.json({}, { headers: { vary: 'cookie' } }),
    Response.json({}, { headers: { vary: '*' } })]) {
    const h = harness();
    await withPublicDataCache(new Request('https://egyptgoldpro.com/api/forecast'), h.cache, h.ctx, async () => response);
    await h.settle();
    assert.equal(h.entries.size, 0);
  }
});

test('cache failures fall back to the app without failing a request', async () => {
  const h = harness();
  const cache = { match: async () => { throw Error('unavailable'); }, put: async () => { throw Error('unavailable'); } };
  const res = await withPublicDataCache(new Request('https://egyptgoldpro.com/api/forecast'), cache, h.ctx, h.next);
  await h.settle();
  assert.equal(res.status, 200);
  assert.equal(h.calls(), 1);
});

test('consent-only visitors share public data; unknown/session cookies still bypass', () => {
  const request = cookie => new Request('https://egyptgoldpro.com/api/signals/gold?country=EG', { headers: cookie ? { cookie } : {} });
  assert.equal(publicDataCacheKey(request('cookie_consent=accepted')).url, publicDataCacheKey(request()).url);
  for (const cookie of ['sb-project-auth-token=session', 'sb-project-auth-token.0=chunk', 'cookie_consent=accepted; custom=unknown', 'cookie_consent_extra=value']) {
    assert.equal(publicDataCacheKey(request(cookie)), null);
  }
  assert.equal(publicDataCacheKey(new Request('https://egyptgoldpro.com/api/forecast?country=EG&range=daily')).url,
    publicDataCacheKey(new Request('https://egyptgoldpro.com/api/forecast?range=daily&country=EG')).url);
});

test('simultaneous identical public cache misses run the application once', async () => {
  const h = harness();
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const load = async () => { calls++; await ready; return Response.json({ price: 4500 }); };
  const request = new Request('https://egyptgoldpro.com/api/marketSnapshot?country=EG');
  const pending = Array.from({ length: 12 }, () => withPublicDataCache(request, h.cache, h.ctx, load));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  const responses = await Promise.all(pending);
  assert.equal(responses.filter(r => r.headers.get('x-egp-data-cache') === 'MISS').length, 1);
  assert.equal(responses.filter(r => r.headers.get('x-egp-data-cache') === 'COALESCED').length, 11);
  for (const response of responses) assert.deepEqual(await response.json(), { price: 4500 });
  await h.settle();
});

test('concurrent private/error responses are never shared between callers', async () => {
  for (const privateResponse of [true, false]) {
    const h = harness();
    let release, calls = 0;
    const ready = new Promise(resolve => { release = resolve; });
    const load = async () => { const id = ++calls; await ready; return Response.json({ id }, privateResponse ? { headers: { 'set-cookie': 'session=' + id } } : { status: 500 }); };
    const req = new Request('https://egyptgoldpro.com/api/forecast');
    const a = withPublicDataCache(req, h.cache, h.ctx, load);
    const b = withPublicDataCache(req, h.cache, h.ctx, load);
    await new Promise(resolve => setImmediate(resolve)); release();
    const [first, second] = await Promise.all([a, b]);
    assert.equal(calls, 2);
    assert.notDeepEqual(await first.json(), await second.json());
    assert.equal(h.entries.size, 0);
  }
});

test('a stalled originating request cannot indefinitely block another visitor', async () => {
  const h = harness();
  const originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let deadline, release, calls = 0;
  const ready = new Promise(resolve => { release = resolve; });
  globalThis.setTimeout = fn => { deadline = fn; return 1; };
  globalThis.clearTimeout = () => {};
  const request = new Request('https://egyptgoldpro.com/api/forecast');
  const load = async () => { if (++calls === 1) await ready; return Response.json({ price: 4500 }); };
  try {
    const first = withPublicDataCache(request, h.cache, h.ctx, load);
    await new Promise(resolve => setImmediate(resolve));
    const second = withPublicDataCache(request, h.cache, h.ctx, load);
    await new Promise(resolve => setImmediate(resolve));
    deadline();
    assert.equal((await second).status, 200);
    assert.equal(calls, 2);
    release(); await first; await h.settle();
  } finally { globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; release(); }
});
