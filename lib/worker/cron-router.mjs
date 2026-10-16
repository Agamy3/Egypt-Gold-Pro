// Shared by the website dispatcher and the lightweight background Worker.
export const CRON_PATHS = {
  '* * * * *': ['/api/cron/ingest-eg', '/api/cron/notifications-eval'],
  '*/5 * * * *': ['/api/cron/ingest-global', '/api/cron/notify'],
  '*/10 * * * *': ['/api/cron/gold-signals'],
  '*/15 * * * *': ['/api/cron/silver-local-eg'],
  '0 */6 * * *': ['/api/cron/news-ingest'],
};
const paths = new Set(Object.values(CRON_PATHS).flat());
export function isCronPath(path) { return paths.has(path) || path === '/api/cron/worker-health'; }

// Authenticate before importing job dependencies or touching the database.
export function isJobAuthorized(request, env) {
  const expected = String(env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const provided = request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer /, '') ||
    new URL(request.url).searchParams.get('secret');
  return provided === expected;
}

export function createJobWorker(loaders) {
  let initialized = false;
  return {
    async fetch(request, env) {
      if (!isJobAuthorized(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const path = new URL(request.url).pathname;
      if (path === '/api/cron/worker-health') {
        const ready = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
        return Response.json({ ok: ready, runtime: 'native-cron' }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
      }
      const load = loaders[path];
      if (!load) return Response.json({ error: 'Not found' }, { status: 404 });
      // Each deployment has its own isolate and fixed bindings. Initialize BEFORE
      // lazy imports: mail/push providers read configuration at module scope.
      if (!initialized) {
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === 'string') process.env[key] = value;
        }
        initialized = true;
      }
      const started = Date.now();
      try {
        const job = await load();
        const handler = request.method === 'GET' ? job.GET : request.method === 'POST' ? job.POST : null;
        if (!handler) return Response.json({ error: 'Method not allowed' }, { status: 405 });
        const response = await handler(request);
        response.headers.set('Cache-Control', 'no-store');
        console.log('[cron-worker]', { path, status: response.status, tookMs: Date.now() - started });
        return response;
      } catch (error) {
        // Avoid logging URLs, credentials or notification payloads.
        console.error('[cron-worker] failed', { path, name: error instanceof Error ? error.name : 'Error' });
        return Response.json({ error: 'Job failed' }, { status: 500 });
      }
    },
  };
}
