# Background job Worker

The website keeps its five existing Cloudflare schedules. Each scheduled job now
uses the private `CRON_JOBS` service binding to `egyptgoldpro-jobs`, avoiding a trip
through the public website, middleware, and Next runtime. The jobs Worker has no
public workers.dev URL, preview URL, routes, or schedules of its own. This prevents
double scheduling. Existing HTTP cron paths also forward to the service binding.

The seven job implementations live in `lib/cron/jobs/`. Next route files re-export
the same handlers for local development and rollback without a binding. They use
native Request and Response APIs. The standalone Worker does not import Next.
`server-only` is a build guard replaced with an empty module only in this entirely
server-side deployment.

The Worker authenticates every request before importing job modules. It requires
CRON_SECRET even when a request has a forged Vercel header, and copies string
bindings into the Node compatibility environment before lazy imports. An
authenticated GET `/api/cron/worker-health` confirms the binding is reachable and
required database configuration exists; it does not execute jobs or send messages.

## Notification reads

The minute evaluator passes its already loaded enabled rules to the shared
notification cycle. Identical trusted history queries share a promise for that
cycle only, keyed by country, karat, and exact cutoff. New cycles reload data.
Threshold rules reuse notification preferences from the existing batched profile
query. Notification thresholds, cooldowns, delivery keys, channels, market trust
checks, and scheduled intervals are unchanged.

## Build and deploy

Use Node 22 or newer and install the lockfile dependencies. Run:

1. `npm test -- --runInBand --forceExit` and `npm run test:worker`.
2. `npm run jobs:build` to build the standalone Worker.
3. `npm run cf:build` to build the website.
4. `npm run jobs:deploy` **before** deploying the website with its service binding.
5. Deploy the website with Wrangler `deploy --keep-vars`.
6. Check the authenticated health path and observe natural scheduled executions
   in tails for both Workers. Do not manually trigger notification jobs as tests.

The job deployment script derives only an explicit allowlist of job settings from
the environment or ignored `.dev.vars` file (with legacy config fallback). It does not copy
payment, trading, or OpenAI credentials. It creates an ignored mode-0600 temporary
configuration, removes it in a finally block, and suppresses Wrangler's variable
listing. No configuration values belong in test fixtures or documentation.

Runtime values have been removed from the tracked Wrangler configuration. Keep
local settings in ignored mode-0600 `.dev.vars` (Worker tools) and `.env.local`
(Next build), or provide them through the shell/CI secret store. Always deploy
the website with `--keep-vars` to preserve its existing Cloudflare settings. Keys
previously committed remain in old repository history; removing the tracked
values does not rotate those keys or rewrite shared history.

## Rollback and verification limits

Rolling the website back to its previous version restores public HTTP dispatch
and the previous embedded Next handlers. The background Worker then receives no
scheduled work; leave its cron list empty. Changes to job logic must be deployed
to both builds because both share the same source.

A smaller bundle and fewer reads do not guarantee every job fits the free plan's
CPU limit. Cold starts, source HTML parsing, crypto and larger rule sets still
need measurement. Short successful traces establish immediate function only;
compare account error counts over a longer interval before declaring the CPU
problem resolved. Unrelated pre-existing business-card route/page parameter type
errors currently prevent a clean standalone TypeScript check.

## Silver source format

The SafeHavenHub source now encodes numeric price cells as images. The former
parser returned `No silver rows parsed`, while the route still returned HTTP 200.
A fast format check now reports the feed unavailable before importing Cheerio.
Numeric tables remain supported and tested; image-based values are never guessed
or persisted as fresh prices. This reduces wasted CPU but does not restore this
upstream data feed. The latest historical local-silver rows predate this change.
