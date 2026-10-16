// Only these routes return the same public data for every anonymous visitor.
// Keep accounts, portfolios, billing, admin and cron responses out of this cache.
const PUBLIC_DATA_PATHS = new Set([
  '/api/marketSnapshot',
  '/api/forecast',
  '/api/forecast/series',
  '/api/landing/gold-today',
  '/api/signals/gold',
]);
const TTL_SECONDS = 15;
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate';
const ROUTER_HEADERS = ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch'];
const SAFE_VARY = new Set([...ROUTER_HEADERS, 'accept-encoding']);
const inflightByCache = new WeakMap();
const MAX_JOIN_MS = 5000;
const MAX_PENDING_KEYS = 128;

export function hasPrivateCookies(request) {
  // The consent banner does not change these audited public responses. Unknown
  // cookies (including every session/token/PKCE cookie) still fail closed.
  return (request.headers.get('cookie') || '').split(';').some(part => {
    if (!part.trim()) return false;
    const name = part.slice(0, part.indexOf('=') < 0 ? undefined : part.indexOf('=')).trim();
    return name !== 'cookie_consent';
  });
}

export function publicDataCacheKey(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !PUBLIC_DATA_PATHS.has(url.pathname) ||
      request.headers.has('authorization') || hasPrivateCookies(request) ||
      request.headers.has('range') || ROUTER_HEADERS.some(name => request.headers.has(name))) return null;
  // These forecast routes support a header override as well as query parameters.
  // Preserve all original query parameters and isolate the header variant.
  url.searchParams.set('__egp_trusted_header', request.headers.get('x-trusted-mode') ?? 'unset');
  url.searchParams.sort();
  return new Request(url, { method: 'GET' });
}

function forVisitor(response, state) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', NO_STORE);
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('X-EGP-Data-Cache', state);
  return new Response(response.body, { status: response.status, headers });
}

/** Use Cloudflare's per-location cache before loading the Next.js application. */
export async function withPublicDataCache(request, cache, ctx, next) {
  const key = publicDataCacheKey(request);
  if (!key || !cache) return next();
  try {
    const hit = await cache.match(key);
    if (hit) return forVisitor(hit, 'HIT');
  } catch {
    // Cache availability must never prevent serving fresh data.
  }

  let pending = inflightByCache.get(cache);
  if (!pending) { pending = new Map(); inflightByCache.set(cache, pending); }
  const existing = pending.get(key.url);
  if (existing && Date.now() - existing.startedAt < MAX_JOIN_MS) {
    let timeout;
    let result;
    try {
      result = await Promise.race([existing.promise, new Promise(done => {
        timeout = setTimeout(() => done(null), MAX_JOIN_MS);
      })]);
    } finally { clearTimeout(timeout); }
    // Never share cookies, errors or other non-public responses across callers.
    return result ? forVisitor(result.clone(), 'COALESCED') : next();
  }

  let resolve;
  const completion = new Promise(done => { resolve = done; });
  // Bounded even if an originating request is disconnected before cleanup.
  if (pending.size >= MAX_PENDING_KEYS) pending.delete(pending.keys().next().value);
  pending.set(key.url, { promise: completion, startedAt: Date.now() });
  try {
    const response = await next();
    const vary = (response.headers.get('vary') ?? '').toLowerCase().split(',').map(name => name.trim()).filter(Boolean);
    if (response.status !== 200 || response.headers.has('set-cookie') ||
        !response.headers.get('content-type')?.includes('application/json') ||
        vary.some(name => !SAFE_VARY.has(name))) {
      resolve(null);
      return response;
    }

    const stored = response.clone();
    const headers = new Headers(stored.headers);
    headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
    headers.delete('Pragma');
    headers.delete('Expires');
    // Only the internal Cache API copy is cacheable. Browsers still receive no-store.
    // Retain the in-flight entry through cache population to cover the short
    // gap between sending the first response and the cache write completing.
    const write = Promise.resolve().then(() => cache.put(key,
      new Response(stored.body, { status: stored.status, headers }))).catch(() => {});
    resolve(response.clone());
    ctx.waitUntil(write.finally(() => { if (pending.get(key.url)?.promise === completion) pending.delete(key.url); }));
    return forVisitor(response, 'MISS');
  } catch (error) {
    resolve(null);
    throw error;
  } finally {
    // On errors and non-cacheable results there is no pending cache write.
    completion.then(result => { if (!result && pending.get(key.url)?.promise === completion) pending.delete(key.url); });
  }
}
