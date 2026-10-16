import { hasPrivateCookies } from './public-data-cache.mjs';

// Only the build-verified, entirely public home shell. Next still handles user
// sessions, actions, RSC navigation, unknown hosts and all other pages.
export async function publicHomeShell(request, env) {
  const url = new URL(request.url);
  let canonical;
  try { canonical = new URL(env.NEXT_PUBLIC_SITE_URL); } catch { return null; }
  if (!env.ASSETS || request.method !== 'GET' || url.pathname !== '/' ||
      url.host !== canonical.host || url.protocol !== 'https:' ||
      !request.headers.get('accept')?.includes('text/html') ||
      request.headers.has('authorization') || hasPrivateCookies(request) ||
      ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-action', 'range'].some(h => request.headers.has(h))) return null;
  try {
    const assetUrl = new URL('/__egp-shell/homepage.bin', url);
    const response = await env.ASSETS.fetch(new Request(assetUrl));
    if (response.status !== 200) { await response.body?.cancel(); return null; }
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'no-cache, must-revalidate');
    headers.set('Vary', 'Cookie, Authorization, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Accept');
    headers.set('X-EGP-Page', 'static-shell');
    return new Response(response.body, { status: 200, headers });
  } catch { return null; }
}
