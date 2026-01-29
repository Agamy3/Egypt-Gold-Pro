# EgyptGold Pro — Context Pack (copy/paste into a new ChatGPT thread)

Use this document to quickly brief a new AI assistant on the repo, architecture, and current production behaviors.  
**Do not include secrets** (service role keys, cron secrets, API keys) when sharing.

---

## Product & goals

**EgyptGold Pro** is a Next.js 14 (App Router) web app deployed on **Vercel** with **Supabase** as the backend DB/auth.

Primary user-facing features:
- **Dashboard** with market snapshot + derived analytics
- **Forecast** card + **forecast series chart** (local vs global, daily/weekly/monthly/yoy)
- **News** (RSS/GDELT ingestion + fallback to GLOBAL if country feed empty)
- **Portfolio** (holdings, empty-state UX)
- **Premium/Coupons** gating
- **Notifications** (email + web push)
- **Ads** (AdSense) with strict content-first gating and route exclusions
- **RTL/Arabic** support

Hard constraints:
- TypeScript strict must pass
- `npm run build` must pass
- No service role key exposure to client
- Avoid breaking premium/coupons/news logic

---

## High-level architecture

### Frontend
- Next.js App Router (`app/`)
- TailwindCSS
- Shared layout: `app/layout.tsx`
  - `Sidebar` (desktop) + `MobileDrawer` (mobile)
  - Language provider (RTL support)
  - Cookie consent
  - AdSense base script in `<head>` (actual ad units are gated in components)
  - Service Worker registration (`public/sw.js`)

Key components:
- `components/layout/Sidebar.tsx` — collapsible desktop nav, persists collapse in `localStorage`
- `components/layout/MobileDrawer.tsx` — mobile overlay drawer
- `components/layout/Header.tsx` — shared header used across pages
- `components/ForecastCard.tsx` — forecast UI + series polling + staleness badge + dev-only debug
- `components/ForecastMiniChart.tsx` — responsive SVG chart (hover hitbox, ticks, gaps)

### Backend
API routes are under `app/api/*`. Notable:
- Market data: `GET /api/marketSnapshot`
- Forecast: `GET /api/forecast`
- Forecast series chart: `GET /api/forecast/series`
- News: `GET /api/news`, admin ingest: `POST /api/admin/news/ingest`
- Notifications: `/api/notifications/*` + push subscribe/unsubscribe
- Cron: `/api/cron/*` (ingestion, notifications, news-ingest)
- Admin: coupons, premium-requests, EG backfill endpoint

Deployment:
- Vercel cron configured in `vercel.json`

---

## Data model (Supabase tables you should know)

The repo includes schema references in:
- `supabase_schema_match_sqlite.sql` (matches legacy sqlite column names; helpful for wide tables)
- `MULTICOUNTRY_IMPLEMENTATION.md` (normalized schema creation for `market_snapshots_norm`)

Key tables (Supabase):
- `market_snapshots_norm` (normalized, multi-country, per-karat rows)
  - columns (typical): `country`, `karat`, `price`, `currency`, `source`, `trusted`, `created_at`, `raw_hash`
  - Used by `/api/forecast/series` for local series
  - Used by `/api/marketSnapshot` for latest local values
- `market_snapshots` (wide, high-frequency, epoch-ms `createdAt`)
  - columns include `"createdAt"` bigint, `"market24Buy"` etc, `"rawHash"`, `error`
- `gold_spot` (global XAU spot history, epoch-ms)
- `egypt_market` (legacy EG sources, epoch-ms)
- `source_staleness` (tracks last OK per source/karat)

Notifications-related:
- `user_notification_rules`
- `notification_deliveries`
- `web_push_subscriptions`

---

## Forecast + chart design (current behavior)

### `/api/forecast/series` (critical)
Purpose: return time-series points for the chart.

Must be **fully dynamic / no caching**:
- `export const dynamic = 'force-dynamic'`
- `export const revalidate = 0`
- Response headers: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`, `Pragma: no-cache`, `Expires: 0`

Response includes proof meta:
- `meta.serverAsOf`
- `meta.lastPointAt`
- `meta.pointsCount`
- `meta.source`
- `meta.fallbackUsed`, `meta.fallbackSource`

### Key UX rules implemented
- Polling in `ForecastCard` every **20s** with `fetch(..., { cache: 'no-store' })`
- Refetch on `focus` and `visibilitychange`
- **No chart overlay inside the plot** (removed by request)
- Staleness badge shown **outside** the plot:
  - If `now - lastPointAt > 6h`: show “Data delayed / تأخر البيانات”
- Dev-only debug panel under chart shows timestamps + source + points

### Time range rules (chart domain)
In `ForecastMiniChart.tsx`:
- **Daily**: last 24h from start of the current hour
- **Weekly/Monthly/YoY**: “from today back to the eldest data found” (avoid empty graphs)
- Hover/crosshair only activates inside plot rectangle (hitbox rect)
- Large gaps break the line (avoid misleading flat tails)

---

## EG-local weekly/monthly history problem & the proper solution (Option A)

Problem: EG intraday sources are very high frequency; naive pagination caps meant weekly/monthly often covered only ~11h.

Solution implemented:
1) **Admin backfill endpoint** builds **low-frequency aggregated history** from high-frequency wide snapshots using **keyset pagination** and writes it into `market_snapshots_norm` with `source='aggregated'`.
2) `/api/forecast/series` prefers `source='aggregated'` for EG local weekly/monthly/yoy so the API can return multi-day history cheaply.

Endpoint:
- `POST /api/admin/market/backfill-eg-local`
  - Auth: admin session OR `x-cron-secret` header matching `CRON_SECRET` (server env var)
  - Body:
    - `days` (1..365)
    - optional `bucketMinutes` (defaults by days: 10m/60m/4h/12h)
  - Writes deterministic `raw_hash = "agg:<bucketTsMs>:<karat>"` so it can be re-run idempotently.

Important DB requirement:
- To support `upsert(... onConflict: 'country,karat,raw_hash')`, Supabase must have a **FULL unique index** on `(country, karat, raw_hash)` (not partial).

Expected proof after backfill:
- `GET /api/forecast/series?range=weekly&scope=local&country=EG` returns:
  - `meta.source = market_snapshots_norm_EG`
  - `meta.fallbackUsed = false`
  - `meta.egNormSpanHours ≈ 168`

---

## Ads / AdSense policy constraints

Key points:
- AdSense base script is present in `app/layout.tsx`
- Actual ad units are gated (content-first + scroll/IntersectionObserver)
- Static files like `ads.txt` must not be intercepted by middleware

Static file:
- `public/ads.txt` contains publisher line

Middleware:
- `middleware.ts` excludes `/ads.txt`, `/robots.txt`, `/sitemap.xml`, `/manifest.json`, and `/.well-known/*` from auth middleware matcher.

---

## Push notifications (minimum working)

Key pieces:
- Service worker: `public/sw.js` (push handler + notificationclick)
- Notifications UI: `app/account/notifications/page.tsx`
- Push subscribe endpoint:
  - `POST /api/push/subscribe` and/or `POST /api/notifications/push/subscribe` (repo has both namespaces)
  - Stores subscription in `web_push_subscriptions`

Env vars (server):
- `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`
Client:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

---

## News

- Public news endpoint: `GET /api/news`
  - Returns country items; if empty, falls back to GLOBAL
  - Uses no-store headers
- Ingestion:
  - RSS parsing (`lib/news/rss.ts`)
  - GDELT (`lib/news/gdelt.ts`)
  - HTML stripping via `lib/html-text-converter.ts`

---

## Env vars (do NOT paste actual values)

See `env.example` for canonical names.

Required (prod):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_SITE_URL`
- `CRON_SECRET` (server-only; rotate if leaked)

Optional depending on features:
- `RESEND_API_KEY`, `EMAIL_FROM`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

---

## Verification commands (production)

Forecast series (no-store + meta proof):
```bash
curl -sL "https://www.egyptgoldpro.com/api/forecast/series?range=daily&scope=local&country=EG" | jq .meta
curl -sL -D - "https://www.egyptgoldpro.com/api/forecast/series?range=daily&scope=local&country=EG" | head -n 40
```

Ads.txt:
```bash
curl -sL -D - https://www.egyptgoldpro.com/ads.txt | head -n 40
curl -sL https://www.egyptgoldpro.com/ads.txt
```

Run EG backfill:
```bash
curl -sS -X POST "https://www.egyptgoldpro.com/api/admin/market/backfill-eg-local" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -d '{"days":30,"bucketMinutes":60}' | jq .
```

---

## “Do not break” checklist for future changes

- Do not expose service role key to client code.
- Keep `forecast/series` responses non-cached and include meta proof fields.
- Keep sidebar collapse state persistent and RTL-safe.
- Keep AdSense units gated (no ads on empty/low-content screens).
- Keep news summary rendering plain text (no raw HTML).
- Keep `npm run build` passing.

