# Quick Start Guide

## Prerequisites

1. Node.js 20+ installed
2. GoldAPI.io API key ([Sign up here](https://goldapi.io))

## Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cat > .env << EOF
GOLDAPI_API_KEY=your_goldapi_key_here
DATABASE_PATH=./db/egyptgold.db
GOLDAPI_CACHE_TTL=45
EGYPT_SOURCES_CACHE_TTL=180
GOLDBILLION_API_URL=https://goldbillion.com/api/prices
DAHABMASR_API_URL=https://dahabmasr.com/api/prices
EOF

# 3. Start development server
npm run dev
```

Open http://localhost:3000 in your browser.

## Next Steps

### 1. Configure Egypt Market Sources

The app includes placeholder parsers for GoldBillion and Dahab Masr. You need to:

1. Find the actual API endpoints or determine how to scrape their websites
2. Update the URLs in `.env` if needed
3. Adapt the parsing logic in `lib/egypt-sources.ts` to match their response format

Use the Source Audit Panel (click "Show Source Audit" in the UI) to inspect API responses.

### 2. Run Tests

```bash
npm test
```

This runs the acceptance tests including:
- ✅ Pricing engine unit tests
- ✅ Acceptance test: `xau=2682.67, market21=6025 → usdEgp_gold ≈ 79-81`

### 3. Build for Production

```bash
npm run build
npm start
```

### 4. Docker Deployment

```bash
docker-compose up --build
```

## Verification Checklist

After setup, verify:

- [ ] GoldAPI.io connection works (check Source Audit Panel)
- [ ] Global spot price displays correctly
- [ ] Egypt sources configured (or show "REFERENCE UNAVAILABLE" if not)
- [ ] Implied Gold FX computes when market data available
- [ ] Warnings display correctly (low confidence / unavailable)
- [ ] All timestamps update every 30 seconds

## Troubleshooting

### "REFERENCE UNAVAILABLE" shown

- Check Egypt source API endpoints are correct
- Verify parsing logic matches actual API response format
- Check Source Audit Panel for error messages

### GoldAPI errors

- Verify `GOLDAPI_API_KEY` is set correctly
- Check API key is valid and not expired
- Review Source Audit Panel for detailed errors

### Database errors

- Ensure `DATABASE_PATH` directory exists
- Check file permissions
- Delete `*.db` files to reset database

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │  Polls /api/marketSnapshot every 30s
│   (Next.js)     │
└────────┬────────┘
         │
┌────────▼────────────────────────┐
│   API Routes                    │
│  /api/marketSnapshot            │
│  /api/debug/sources             │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│   Core Libraries                │
│  • lib/goldapi.ts              │  GoldAPI.io integration
│  • lib/egypt-sources.ts        │  Egypt market sources
│  • lib/pricing.ts              │  Pricing engine (pure functions)
│  • lib/db.ts                   │  SQLite database
└────────┬────────────────────────┘
         │
┌────────▼────────┐
│   SQLite DB     │  Caches market data
└─────────────────┘
```

## Key Design Principles

1. **TROY OUNCE ONLY**: All calculations use 31.1034768 grams per troy ounce
2. **NO Silent Fallbacks**: Missing data shows "REFERENCE UNAVAILABLE"
3. **Source of Truth**: GoldAPI for spot, Egypt sources for market prices
4. **Never Mix**: Never compute market prices from spot or vice versa
5. **Transparency**: All values show source and timestamp

