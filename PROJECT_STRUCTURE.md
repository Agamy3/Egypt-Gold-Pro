# EgyptGold Pro - Project Structure

## Directory Overview

```
egyptgold-pro/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── marketSnapshot/       # Main market data endpoint
│   │   │   └── route.ts
│   │   └── debug/
│   │       └── sources/          # Source audit endpoint
│   │           └── route.ts
│   ├── globals.css               # Global styles (Tailwind)
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
│
├── components/                   # React components
│   ├── Dashboard.tsx             # Main dashboard with cards
│   └── SourceAuditPanel.tsx      # Debug panel for sources
│
├── lib/                          # Core business logic
│   ├── db.ts                     # SQLite database setup
│   ├── goldapi.ts                # GoldAPI.io integration
│   ├── egypt-sources.ts          # Egypt market sources (GoldBillion, Dahab Masr)
│   ├── pricing.ts                # Pricing engine (pure functions)
│   └── pricing.test.ts           # Unit tests for pricing engine
│
├── db/                           # SQLite database files (created at runtime)
│
├── public/                       # Static assets
│
├── .dockerignore                 # Docker ignore patterns
├── .gitignore                    # Git ignore patterns
├── docker-compose.yml            # Docker Compose configuration
├── Dockerfile                    # Docker build file
├── jest.config.js                # Jest test configuration
├── jest.setup.js                 # Jest setup file
├── next.config.js                # Next.js configuration
├── package.json                  # Dependencies and scripts
├── postcss.config.js             # PostCSS configuration
├── QUICKSTART.md                 # Quick start guide
├── README.md                     # Full documentation
├── tailwind.config.ts            # Tailwind CSS configuration
└── tsconfig.json                 # TypeScript configuration
```

## Key Files

### Core Logic

- **`lib/pricing.ts`**: Pure functions for all pricing calculations
  - TROY OUNCE conversion (31.1034768 grams)
  - USD per gram (24k/21k)
  - Implied Gold FX computation
  - Variance calculation
  - **Never computes market prices from spot**

- **`lib/goldapi.ts`**: GoldAPI.io integration
  - Single source of truth for XAU/USD spot
  - Caching (30-60s)
  - Stale data handling

- **`lib/egypt-sources.ts`**: Egypt market sources
  - GoldBillion parser
  - Dahab Masr parser
  - Median calculation
  - Retry logic
  - Error handling

- **`lib/db.ts`**: SQLite database
  - Schema initialization
  - Tables: `gold_spot`, `egypt_market`

### API Routes

- **`app/api/marketSnapshot/route.ts`**:
  - Aggregates all market data
  - Computes pricing
  - Returns warnings (low confidence, unavailable)

- **`app/api/debug/sources/route.ts`**:
  - Source audit information
  - Raw API responses
  - Error messages
  - Database records

### Frontend

- **`app/page.tsx`**: Main page with polling (30s interval)
- **`components/Dashboard.tsx`**: Dashboard cards and warnings
- **`components/SourceAuditPanel.tsx`**: Debug panel

## Data Flow

```
1. Frontend polls /api/marketSnapshot every 30s
   ↓
2. API route fetches:
   - GoldAPI spot (via lib/goldapi.ts with cache)
   - Egypt sources (via lib/egypt-sources.ts with cache)
   ↓
3. Pricing engine (lib/pricing.ts) computes:
   - USD per gram
   - Implied Gold FX
   - Variance
   ↓
4. Returns aggregated data to frontend
   ↓
5. Dashboard displays with warnings if needed
```

## Critical Design Rules

✅ **TROY OUNCE ONLY**: All calculations use 31.1034768 grams
✅ **NO Manual Entry**: All data from APIs
✅ **NO Silent Fallbacks**: Shows "REFERENCE UNAVAILABLE"
✅ **Never Compute Market from Spot**: Hard guards in pricing.ts
✅ **Source Attribution**: Every value shows source + timestamp

## Testing

- **Unit Tests**: `lib/pricing.test.ts`
  - Acceptance test: `xau=2682.67, market21=6025 → usdEgp_gold ≈ 79-81`
  - All pricing functions tested
  - Edge cases covered

Run: `npm test`

## Deployment

- **Development**: `npm run dev`
- **Production**: `npm run build && npm start`
- **Docker**: `docker-compose up --build`

## Configuration

All configuration via environment variables (see README.md):
- `GOLDAPI_API_KEY` (required)
- `DATABASE_PATH`
- `GOLDAPI_CACHE_TTL`
- `EGYPT_SOURCES_CACHE_TTL`
- `GOLDBILLION_API_URL`
- `DAHABMASR_API_URL`

