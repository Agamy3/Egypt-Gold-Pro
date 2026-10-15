import { createJobWorker } from '../../lib/worker/cron-router.mjs';

// Native Request/Response jobs shared with Next route adapters. No Next runtime.
export default createJobWorker({
  '/api/cron/ingest-eg': () => import('../../lib/cron/jobs/ingest-eg.ts'),
  '/api/cron/ingest-global': () => import('../../lib/cron/jobs/ingest-global.ts'),
  '/api/cron/notifications-eval': () => import('../../lib/cron/jobs/notifications-eval.ts'),
  '/api/cron/notify': () => import('../../lib/cron/jobs/notify.ts'),
  '/api/cron/gold-signals': () => import('../../lib/cron/jobs/gold-signals.ts'),
  '/api/cron/silver-local-eg': () => import('../../lib/cron/jobs/silver-local-eg.ts'),
  '/api/cron/news-ingest': () => import('../../lib/cron/jobs/news-ingest.ts'),
});
