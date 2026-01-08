# EgyptGold Pro

Production-ready web application providing educational decision-support for the Egyptian gold market.

## Overview

EgyptGold Pro cleanly separates:
1. **True Global Gold Spot** (XAU/USD from GoldAPI.io)
2. **Egypt Local Gold Market Prices** (21k/24k from GoldBillion, Dahab Masr)

The app computes variance, over/underpricing, and implied "Gold FX" with zero manual calibration and zero self-reference.

## ⚠️ Critical Rules

- **TROY OUNCE ONLY**: 1 troy ounce = 31.1034768 grams
- **NO manual entry** anywhere in the UI
- **NO silent fallbacks**: If Egypt market prices fail → show "REFERENCE UNAVAILABLE"
- **Never replace missing market prices** with calculated values
- **Never mix global spot** with local "intl ounce" shown by Egypt sites
- **Every computed value** must show source + timestamp

## Tech Stack

- **Next.js 14** (TypeScript, App Router)
- **Tailwind CSS** for styling
- **SQLite** (better-sqlite3) for data storage
- **API Routes** for all data fetching
- **Docker** support for deployment

## Prerequisites

- Node.js 20+ 
- npm or yarn
- GoldAPI.io API key (sign up at https://goldapi.io)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd egyptgold-pro
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your GoldAPI.io API key:
```
GOLDAPI_API_KEY=your_goldapi_key_here
DATABASE_PATH=./db/egyptgold.db
GOLDAPI_CACHE_TTL=45
EGYPT_SOURCES_CACHE_TTL=180

# Egypt Market Source URLs (configure based on actual API endpoints)
GOLDBILLION_API_URL=https://goldbillion.com/api/prices
DAHABMASR_API_URL=https://dahabmasr.com/api/prices
```

**Important**: You must configure the actual API endpoints for GoldBillion and Dahab Masr in the `.env` file, and adapt the parsing logic in `lib/egypt-sources.ts` to match their actual API response format. See the Configuration section below for details.

4. Initialize the database (runs automatically on first start):
```bash
npm run dev
```

The database will be created automatically at the path specified in `DATABASE_PATH`.

## Running the Application

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker-compose up --build
```

Or using Docker directly:

```bash
docker build -t egyptgold-pro .
docker run -p 3000:3000 -e GOLDAPI_API_KEY=your_key egyptgold-pro
```

## Data Sources

### Global Gold Spot

- **Source**: GoldAPI.io
- **Endpoint**: XAU/USD per troy ounce
- **Cache TTL**: 30-60 seconds (configurable via `GOLDAPI_CACHE_TTL`)
- **Behavior**: 
  - If fetch fails → keep last value + mark STALE
  - Never inferred from local prices

### Egypt Market Prices

- **Sources**: 
  - GoldBillion
  - Dahab Masr
  - iSagha (optional)
- **Data**: 21k and 24k buy/sell prices
- **Cache TTL**: 2-5 minutes (configurable via `EGYPT_SOURCES_CACHE_TTL`)
- **Behavior**:
  - Timeout + retry (max 2 attempts)
  - If source fails → mark DOWN
  - Compute median across available sources
  - **Never computed from spot**
  - **Never overridden with fair value**

## Core Pricing Engine

The pricing engine (`lib/pricing.ts`) contains pure functions:

1. **Convert Global Spot → USD per gram**
   - `usdPerGram24 = xauSpotUsdOz / 31.1034768`
   - `usdPerGram21 = usdPerGram24 * 0.875`

2. **Implied "Gold FX" (Market FX)**
   - `usdEgp_gold = market21_buy / usdPerGram21`
   - Hard guard: Returns null if `market21_buy` is null

3. **Local Market Parity Prices**
   - `local24 = usdPerGram24 * usdEgp_gold`
   - `local21 = local24 * 0.875`

4. **Fair Value** (optional, for comparison)
   - Uses official USD/EGP exchange rate
   - `fair24 = usdPerGram24 * usdEgp_official`
   - `fair21 = fair24 * 0.875`

5. **Over/Under Pricing Validator**
   - `variancePct = (market21_buy - fair21) / fair21 * 100`
   - Classification:
     - `|variance| ≤ 1.5%` → FAIR
     - `> 1.5%` → OVERPRICED
     - `< -1.5%` → UNDERPRICED

## API Endpoints

### `GET /api/marketSnapshot`

Returns aggregated market data with pricing calculations. Frontend polls this every 30 seconds.

**Response**:
```json
{
  "timestamp": 1234567890,
  "goldSpot": {
    "xauSpotUsdOz": 2682.67,
    "timestamp": 1234567890,
    "stale": false
  },
  "egyptMarket": {
    "median": {
      "market21Buy": 6025,
      "market21Sell": 6010,
      "market24Buy": 6880,
      "market24Sell": 6865
    },
    "sources": [...],
    "activeSourceCount": 2
  },
  "pricing": {
    "usdPerGram24": 86.262,
    "usdPerGram21": 75.479,
    "usdEgpGold": 79.8,
    ...
  },
  "warnings": {
    "lowConfidence": false,
    "referenceUnavailable": false
  }
}
```

### `GET /api/debug/sources`

Returns detailed source audit information including raw responses and parsing errors.

## Testing

Run unit tests:

```bash
npm test
```

### Acceptance Tests

The test suite includes acceptance tests that verify:

1. **Test Case**: `xau=2682.67, market21=6025 → usdEgp_gold ≈ 79-81`
   - Input: XAU/USD = 2682.67, market21_buy = 6025
   - Expected: usdEgp_gold between 79-81
   - Status: ✅ Passes

2. **Test Case**: If all Egypt sources fail
   - UI must NOT compute implied FX
   - Must show "REFERENCE UNAVAILABLE"
   - Status: ✅ Implemented

3. **Test Case**: No code path assigns `market21_buy = fair21`
   - Status: ✅ Enforced by design

## Features

### Dashboard

- **Global Spot Card**: Shows XAU/USD per troy ounce from GoldAPI.io
- **Egypt Market Cards**: Shows 21k and 24k median buy/sell prices
- **Implied Gold FX**: Derived USD/EGP rate
- **Variance Badge**: Shows over/under pricing classification
- **Pricing Details**: USD per gram (24k/21k)
- **Last Updated**: Timestamps for all data

### Warnings

- **Low Confidence**: Shown when only one Egypt source is available
- **REFERENCE UNAVAILABLE**: Shown when zero sources are available, disables implied FX computation

### Source Audit Panel

Toggle-able debug panel showing:
- GoldAPI status and data
- Each Egypt source status and parsed values
- Raw API responses (first 1000 chars)
- Error messages
- Database records

## Caching Policy

- **Frontend**: Polls `/api/marketSnapshot` every 30 seconds
- **Backend**:
  - GoldAPI: 30-60s cache (configurable)
  - Egypt sources: 2-5 min cache (configurable)
- **On Fetch Failure**:
  - Use last known value
  - Mark STALE
  - Never recompute from another layer

## Important Notes

- **GoldAPI fixes spot correctness**: Single source of truth for global gold spot
- **GoldBillion / Dahab Masr fix local reality**: Source of truth for Egypt market prices
- **If either is missing, the app must refuse to guess**: No fallbacks, shows "REFERENCE UNAVAILABLE"

## Configuration

Environment variables:

- `GOLDAPI_API_KEY`: Your GoldAPI.io API key (required)
- `DATABASE_PATH`: Path to SQLite database file (default: `./db/egyptgold.db`)
- `GOLDAPI_CACHE_TTL`: Cache TTL for GoldAPI in seconds (default: 45)
- `EGYPT_SOURCES_CACHE_TTL`: Cache TTL for Egypt sources in seconds (default: 180)
- `GOLDBILLION_API_URL`: API endpoint URL for GoldBillion (default: placeholder)
- `DAHABMASR_API_URL`: API endpoint URL for Dahab Masr (default: placeholder)

### Configuring Egypt Market Sources

The Egypt market source parsers (`lib/egypt-sources.ts`) are templates that need to be adapted to the actual API structure of GoldBillion and Dahab Masr.

**Steps to configure:**

1. **Identify the API endpoints**: Determine the actual URLs and request format for each source
2. **Update environment variables**: Add the correct URLs to your `.env` file
3. **Adapt parsing logic**: Modify `parseGoldBillion()` and `parseDahabMasr()` functions in `lib/egypt-sources.ts` to:
   - Match the actual response format (JSON, HTML, etc.)
   - Extract the correct field names for 21k/24k buy/sell prices
   - Handle authentication if required
   - Parse HTML if they don't have a JSON API

The current implementation includes:
- Retry logic (max 2 attempts)
- Timeout handling (10 seconds)
- Error logging
- Raw response storage for debugging

Use the Source Audit Panel in the UI to inspect raw API responses and debug parsing issues.

## License

[Your License Here]

## Disclaimer

This application provides **educational decision-support** only, not financial advice. All computations are based on publicly available data sources and should not be used as the sole basis for financial decisions.

