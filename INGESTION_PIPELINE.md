# Automated Ingestion Pipeline

## Overview

This document describes the automated ingestion pipeline that continuously fetches Egypt gold prices from iSagha and GoldBillion Egypt, stores snapshots in the database, and serves the latest data to the dashboard.

## Architecture

### Components

1. **Database Table**: `market_snapshots` - Stores ingested price snapshots
2. **Source Adapters**: `lib/ingestion-adapters.ts` - Fetch and parse prices from iSagha and GoldBillion
3. **Cron Endpoint**: `/api/cron/ingest` - Fetches data and stores in DB
4. **Market Snapshot API**: `/api/marketSnapshot` - Reads from DB (not live scraping)
5. **Scheduler**: Vercel Cron (or node-cron fallback)

## Database Schema

```sql
CREATE TABLE market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  createdAt INTEGER NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('isagha', 'goldbillion')),
  market21Buy REAL,
  market21Sell REAL,
  market24Buy REAL,
  market24Sell REAL,
  usdBuy REAL,
  usdSell REAL,
  rawHash TEXT,
  error TEXT
);
```

### Fields

- `id`: Primary key
- `createdAt`: Timestamp (milliseconds since epoch)
- `source`: Either 'isagha' or 'goldbillion'
- `market21Buy`, `market21Sell`, `market24Buy`, `market24Sell`: Price values in EGP
- `usdBuy`, `usdSell`: USD prices (nullable)
- `rawHash`: SHA256 hash of raw response (first 32 chars) for deduplication
- `error`: Error message if ingestion failed (nullable)

### Indexes

- `idx_market_snapshots_source_created`: (source, createdAt) - Fast lookups by source
- `idx_market_snapshots_rawHash`: (rawHash) - Deduplication checks

## Source Adapters

### iSagha Adapter

**URL**: `https://market.isagha.com/prices`

**Features**:
- Fetches HTML page containing "عيار 24/21 ... بيع ... شراء"
- Parses 21k and 24k buy/sell prices
- Normalizes Arabic/English digits
- Removes commas and "ج.م" symbols
- Validates prices are finite and in reasonable range (5000-8000 for 21k, 5500-8500 for 24k)
- Returns OK only if market21Buy and market21Sell are valid

### GoldBillion Adapter

**URL**: `https://goldbillion.com` (configurable via `GOLDBILLION_URL` env var)

**Features**:
- Fetches with browser-like headers + timeout/retry
- If HTML is JS-rendered/blocked, falls back to Jina AI: `https://r.jina.ai/https://<goldbillion-url>`
- Tries to parse JSON/XHR endpoints if discovered in HTML
- Parses 21k/24k buy/sell and USD if available
- Never throws; returns structured error + snippet
- Validates prices are finite and in reasonable range

## Cron Endpoint

**Path**: `/api/cron/ingest`

**Method**: GET

**Authentication**: 
- Requires `CRON_SECRET` environment variable
- Accepts secret via:
  - Header: `x-cron-secret`
  - Query param: `?secret=...`
  - Vercel Cron requests (automatically authenticated)

**Behavior**:
1. Fetches iSagha and GoldBillion in parallel
2. For each source:
   - Generates hash of raw response
   - Checks for duplicate (same hash in last 5 minutes) - skips if duplicate
   - Inserts snapshot row into DB (even if error occurred)
3. Returns JSON summary:
   ```json
   {
     "inserted": 2,
     "errors": [],
     "timestamp": 1234567890
   }
   ```

**Error Handling**:
- Individual source failures don't block other sources
- Errors are recorded in DB (`error` field) and returned in response
- Always returns HTTP 200 (errors are in response body)

## Scheduling

### Vercel Cron (Preferred)

**File**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "* * * * *"
    }
  ]
}
```

Runs every 1 minute (60 seconds).

### Manual Testing

```bash
curl -H "x-cron-secret: YOUR_SECRET" https://your-domain.com/api/cron/ingest
# or
curl https://your-domain.com/api/cron/ingest?secret=YOUR_SECRET
```

## Market Snapshot API Updates

**Path**: `/api/marketSnapshot`

**Changes**:
- **No longer scrapes live** - Reads from `market_snapshots` table
- Reads latest successful snapshot per source (where `error IS NULL`)
- Computes median across sources from DB values
- If no valid snapshot in last 10 minutes: `referenceUnavailable=true`
- Source Audit shows:
  - `lastIngested`: Timestamp of last successful ingestion
  - `lastError`: Last error message (if any)

**Response Structure**:
```json
{
  "egyptMarket": {
    "sources": [
      {
        "source": "isagha",
        "status": "OK",
        "fetchedAt": 1234567890,
        "lastError": null
      },
      {
        "source": "goldbillion",
        "status": "OK",
        "fetchedAt": 1234567890,
        "lastError": null
      }
    ],
    "median": {
      "market21Buy": 6025.0,
      "market21Sell": 6000.0,
      "market24Buy": 6885.0,
      "market24Sell": 6857.0
    },
    "activeSourceCount": 2
  }
}
```

## Environment Variables

### Required

```bash
CRON_SECRET=your-secret-key-here  # Used to secure the cron endpoint
```

### Optional

```bash
GOLDBILLION_URL=https://goldbillion.com  # Default: https://goldbillion.com
```

## Run Instructions

### 1. Set Environment Variables

Create `.env.local`:

```bash
CRON_SECRET=your-random-secret-key-here
```

### 2. Initialize Database

The database table will be created automatically on first run (via `lib/db.ts`).

### 3. Deploy to Vercel

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel

# Add environment variable
vercel env add CRON_SECRET
```

### 4. Verify Cron Job

After deployment, Vercel will automatically schedule the cron job. Check Vercel dashboard → Your Project → Cron Jobs.

### 5. Test Manually

```bash
# Test the cron endpoint
curl -H "x-cron-secret: YOUR_SECRET" https://your-domain.vercel.app/api/cron/ingest

# Check market snapshot (should read from DB)
curl https://your-domain.vercel.app/api/marketSnapshot

# Check debug sources
curl https://your-domain.vercel.app/api/debug/sources
```

## Monitoring

### Check Ingestion Status

```bash
# Query latest snapshots
sqlite3 db/egyptgold.db "SELECT source, createdAt, market21Buy, error FROM market_snapshots ORDER BY createdAt DESC LIMIT 10;"
```

### Check for Errors

```bash
# Latest errors per source
sqlite3 db/egyptgold.db "SELECT source, createdAt, error FROM market_snapshots WHERE error IS NOT NULL ORDER BY createdAt DESC LIMIT 20;"
```

### Verify Deduplication

```bash
# Check for duplicate hashes
sqlite3 db/egyptgold.db "SELECT source, rawHash, COUNT(*) as count FROM market_snapshots GROUP BY source, rawHash HAVING count > 1;"
```

## Critical Rules (Maintained)

✅ **No manual entry** - All data comes from source adapters
✅ **No silent fallbacks** - Errors are logged and returned
✅ **Never compute Egypt market prices from ounce/spot** - Only from source adapters
✅ **Always show source attribution + timestamps** - Source and `fetchedAt` always included

## Troubleshooting

### Cron Job Not Running

1. Check Vercel dashboard → Cron Jobs
2. Verify `vercel.json` is committed
3. Check deployment logs for errors
4. Test endpoint manually with secret

### No Data in Database

1. Check cron endpoint logs: `vercel logs`
2. Verify `CRON_SECRET` is set correctly
3. Test adapters manually:
   ```typescript
   import { fetchIsagha, fetchGoldBillion } from '@/lib/ingestion-adapters';
   const result = await fetchIsagha();
   console.log(result);
   ```

### Parsing Errors

1. Check `rawResponse` field in DB (first 1000 chars stored)
2. Verify source HTML structure hasn't changed
3. Update regex patterns in adapters if needed

### Stale Data Warning

- If `referenceUnavailable=true`, check:
  1. Last ingestion time (should be < 10 minutes ago)
  2. Source status (should be 'OK')
  3. Cron job execution logs


