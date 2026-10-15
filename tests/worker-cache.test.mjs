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
