/**
 * Cloudflare Worker entry: wraps the OpenNext default handler and adds `scheduled`
 * so Vercel-only crons in vercel.json actually run on Workers.
 *
 * Requires `cf:build` first so `.open-next/worker.js` exists. `wrangler.jsonc` must define
 * matching `triggers.crons` (same strings as keys below).
 */
import { withPublicDataCache } from './lib/worker/public-data-cache.mjs';
// Resolved after `npm run cf:build` — produces `.open-next/worker.js`
// IMPORTANT: Keep OpenNext lazy-loaded so scheduled cron events don't pay the CPU cost
// of importing the full Next bundle on cold start.
let _nextAppPromise;
async function getNextApp() {
  if (!_nextAppPromise) {
    _nextAppPromise = import('./.open-next/worker.js').then((m) => m.default);
  }
  return _nextAppPromise;
}

/** @type {Record<string, string[]>} */
const CRON_PATHS = {
  '* * * * *': [
    '/api/cron/ingest-eg',
    '/api/cron/notifications-eval',
  ],
  '*/5 * * * *': ['/api/cron/ingest-global', '/api/cron/notify'],
  '*/10 * * * *': ['/api/cron/gold-signals'],
  '*/15 * * * *': ['/api/cron/silver-local-eg'],
  '0 */6 * * *': ['/api/cron/news-ingest'],
};

function baseUrlFromEnv(env) {
  const raw = env.CRON_BASE_URL || env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';
  return String(raw).replace(/\/$/, '');
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} env
 */
function cronRequest(path, env) {
  const secret = env.CRON_SECRET;
  if (!secret || String(secret).trim() === '') {
    throw new Error('CRON_SECRET is not set');
  }
  const base = baseUrlFromEnv(env);
  const url = `${base}${path}`;
  return new Request(url, {
    method: 'GET',
    headers: {
      'x-cron-secret': String(secret),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    return withPublicDataCache(request, globalThis.caches?.default, ctx, async () => {
      const nextApp = await getNextApp();
      return nextApp.fetch(request, env, ctx);
    });
  },

  /**
   * @param {ScheduledEvent} event
   * @param {Record<string, unknown>} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    const cronExpr = event.cron;
    const paths = CRON_PATHS[cronExpr];
    console.log('[cf-cron] scheduled event', {
      cron: cronExpr,
      mapped: Boolean(paths?.length),
      paths: paths?.length ?? 0,
      hasSecret: Boolean(env.CRON_SECRET && String(env.CRON_SECRET).trim() !== ''),
      baseUrl: baseUrlFromEnv(env),
    });
    if (!paths?.length) {
      console.warn('[cf-cron] No routes mapped for cron:', cronExpr);
      return;
    }

    if (!env.CRON_SECRET || String(env.CRON_SECRET).trim() === '') {
      console.error('[cf-cron] CRON_SECRET missing');
      return;
    }

    for (const path of paths) {
      ctx.waitUntil(
        (async () => {
          let req;
          try {
            req = cronRequest(path, env);
          } catch (e) {
            console.error('[cf-cron] build request failed', path, e);
            return;
          }

          const startedAt = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 55_000);
          try {
            console.log('[cf-cron] dispatch start', { cron: cronExpr, path });
            const res = await fetch(req, { signal: controller.signal });
            // Status is sufficient here. Cloning and decoding entire JSON bodies
            // just for a log preview spends the scheduler's small CPU allowance.
            await res.body?.cancel();
            console.log('[cf-cron]', cronExpr, path, res.status, {
              tookMs: Date.now() - startedAt,
            });
          } catch (e) {
            console.error('[cf-cron] fetch failed', cronExpr, path, {
              tookMs: Date.now() - startedAt,
              error: e instanceof Error ? e.message : String(e),
            });
          } finally {
            clearTimeout(timeout);
          }
        })()
      );
    }
  },
};
