// Only these routes return the same public data for every anonymous visitor.
// Keep accounts, portfolios, billing, admin and cron responses out of this cache.
const PUBLIC_DATA_PATHS = new Set([
  '/api/marketSnapshot',
  '/api/forecast',
  '/api/forecast/series',
  '/api/landing/gold-today',
]);
const TTL_SECONDS = 15;
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate';
const ROUTER_HEADERS = ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch'];
const SAFE_VARY = new Set([...ROUTER_HEADERS, 'accept-encoding']);

export function publicDataCacheKey(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !PUBLIC_DATA_PATHS.has(url.pathname) ||
      request.headers.has('authorization') || request.headers.has('cookie') ||
      request.headers.has('range') || ROUTER_HEADERS.some(name => request.headers.has(name))) return null;
  // These forecast routes support a header override as well as query parameters.
  // Preserve all original query parameters and isolate the header variant.
  url.searchParams.set('__egp_trusted_header', request.headers.get('x-trusted-mode') ?? 'unset');
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

  const response = await next();
  const vary = (response.headers.get('vary') ?? '').toLowerCase().split(',').map(name => name.trim()).filter(Boolean);
  if (response.status !== 200 || response.headers.has('set-cookie') ||
      !response.headers.get('content-type')?.includes('application/json') ||
      vary.some(name => !SAFE_VARY.has(name))) return response;

  const stored = response.clone();
  const headers = new Headers(stored.headers);
  headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
  headers.delete('Pragma');
  headers.delete('Expires');
  // Only the internal Cache API copy is cacheable. Browsers still receive no-store.
  ctx.waitUntil(Promise.resolve().then(() => cache.put(key,
    new Response(stored.body, { status: stored.status, headers }))).catch(() => {}));
  return forVisitor(response, 'MISS');
}
