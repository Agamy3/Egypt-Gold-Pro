# API Runtime Environment Analysis

## Execution Environment: **Vercel Functions (Node.js Serverless)**

All API routes are running as **Vercel Functions (Node.js serverless)** - the default runtime for Next.js 14 API routes.

### Evidence:

1. **No Edge Runtime Declaration**
   - No `export const runtime = 'edge'` found in any API route files
   - Edge Functions require explicit declaration

2. **Node.js Dependencies**
   - Uses `cheerio` for HTML parsing (Node.js only, not available in Edge)
   - Uses `@supabase/supabase-js` with full Node.js features
   - Uses `server-only` imports (Node.js server environment)

3. **Next.js Configuration**
   - `next.config.js` doesn't specify edge runtime
   - Uses default Node.js runtime

4. **API Route Structure**
   - Uses Next.js 14 App Router (`route.ts` files)
   - Defaults to Node.js serverless runtime

### API Routes Breakdown:

#### `/api/marketSnapshot`
- **Runtime:** Node.js Serverless (Vercel Function)
- **External Calls:**
  - Supabase (PostgreSQL database) - via `@supabase/supabase-js`
  - Gold-API.com (optional, for gold spot prices)
  - open.er-api.com (for USD/EGP exchange rates)
- **Processing:** Server-side calculations, data aggregation

#### `/api/forecast`
- **Runtime:** Node.js Serverless (Vercel Function)
- **External Calls:**
  - Supabase (PostgreSQL database) - queries historical snapshots
- **Processing:** Server-side forecast calculations, time-series analysis

#### `/api/forecast/series`
- **Runtime:** Node.js Serverless (Vercel Function)
- **External Calls:**
  - Supabase (PostgreSQL database) - queries time-series data
- **Processing:** Server-side data aggregation, time bucketing

#### `/api/cron/ingest`
- **Runtime:** Node.js Serverless (Vercel Function)
- **External Calls:**
  - Multiple web sources (banklive, gold_era, dokangold, goldrate24, goldbullioneg)
  - Supabase (PostgreSQL database) - writes snapshots
- **Processing:** Web scraping, HTML parsing, data validation, weighted averages

### Architecture:

```
User Browser
    ↓
Vercel Edge Network (CDN)
    ↓
Next.js App Router
    ↓
API Routes (Node.js Serverless Functions)
    ↓
┌─────────────────────────────────────┐
│  External Services:                 │
│  • Supabase (PostgreSQL)            │
│  • Gold-API.com                     │
│  • open.er-api.com                  │
│  • Web sources (scraping)            │
└─────────────────────────────────────┘
```

### Key Characteristics:

1. **Serverless Functions**
   - Each API route is a separate Vercel Function
   - Cold start latency possible (typically < 1 second)
   - Auto-scales based on traffic
   - 10-second execution timeout (default)
   - Can be extended to 60 seconds for Pro/Enterprise

2. **External Backend Calls**
   - All routes make external calls to:
     - **Supabase** (primary database)
     - **Third-party APIs** (Gold-API, exchange rates)
     - **Web scraping** (for market data ingestion)

3. **Not Edge Functions**
   - Edge Functions would have `export const runtime = 'edge'`
   - Edge Functions have limitations (no Node.js APIs, smaller bundle size)
   - Current setup requires Node.js features (cheerio, full Supabase client)

### Performance Implications:

- **Cold Starts:** First request after inactivity may have ~500ms-1s latency
- **Warm Functions:** Subsequent requests are fast (~50-200ms)
- **Database Queries:** Supabase queries add ~50-200ms per call
- **External APIs:** Third-party API calls add ~100-500ms per call

### Cost Implications:

- **Vercel Functions:** Billed per invocation and execution time
- **Supabase:** Billed per database query and storage
- **External APIs:** May have rate limits or usage-based pricing

### Recommendations:

1. **Current Setup is Optimal** for this use case:
   - Requires Node.js features (cheerio, full database client)
   - Needs longer execution times for web scraping
   - Benefits from serverless auto-scaling

2. **Consider Edge Functions** only if:
   - You need sub-50ms response times
   - You can eliminate Node.js dependencies
   - You can move heavy processing to background jobs

3. **Optimization Opportunities:**
   - Add response caching for forecast data (changes slowly)
   - Use Supabase Edge Functions for database-heavy operations
   - Consider background jobs for data ingestion (already using cron)

