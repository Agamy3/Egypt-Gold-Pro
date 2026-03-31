/**
 * Cloudflare Worker entry: wraps the OpenNext default handler and adds `scheduled`
 * so Vercel-only crons in vercel.json actually run on Workers.
 *
 * Requires `cf:build` first so `.open-next/worker.js` exists. `wrangler.jsonc` must define
 * matching `triggers.crons` (same strings as keys below).
 */
// Resolved after `npm run cf:build` — produces `.open-next/worker.js`
import nextApp from './.open-next/worker.js';

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
  fetch: nextApp.fetch.bind(nextApp),

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
          try {
            console.log('[cf-cron] dispatch start', { cron: cronExpr, path });
            const timeoutMs = 55_000;
            const res = await Promise.race([
              nextApp.fetch(req, env, ctx),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`timeout_after_${timeoutMs}ms`)), timeoutMs)
              ),
            ]);
            const text =
              res?.headers?.get('content-type')?.includes('json')
                ? await res.clone().text().catch(() => '')
                : '';
            console.log('[cf-cron]', cronExpr, path, res.status, {
              tookMs: Date.now() - startedAt,
              bodyPreview: text.slice(0, 200),
            });
          } catch (e) {
            console.error('[cf-cron] fetch failed', cronExpr, path, {
              tookMs: Date.now() - startedAt,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        })()
      );
    }
  },
};
