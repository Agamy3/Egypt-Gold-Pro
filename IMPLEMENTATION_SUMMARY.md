# Implementation Summary - Egypt Gold Pro Fixes

## Files Changed

### 1. `lib/implied-ounce.ts`
- **Changed**: Removed endpoint guessing logic, use exact endpoint `https://api.gold-api.com/price/XAU`
- **Changed**: Parse `price` and `updatedAt` fields from JSON response
- **Changed**: Validate price is finite and within 2000-8000 USD range

### 2. `lib/db.ts`
- **Changed**: Added `httpStatus`, `url`, `rawResponseSnippet` columns to `market_snapshots` table

### 3. `lib/ingestion-adapters.ts`
- **iSagha Adapter**: Completely rewritten to use Playwright only (removed direct fetch/XHR attempts)
- **GoldBillion Adapter**: Fixed Jina URL construction (`https://r.jina.ai/${finalUrl}`), added Playwright fallback, fixed method tracking
- **Both adapters**: Enhanced regexMatches with method, validation results, parsed values

### 4. `app/api/cron/ingest/route.ts`
- **Changed**: Updated INSERT statements to include `httpStatus`, `url`, `rawResponseSnippet` fields
- **Changed**: Enhanced error handling to record per-source errors

### 5. `app/api/debug/sources/route.ts`
- **Changed**: Added comprehensive debug info for implied ounce (url, httpStatus, rawSnippet)
- **Changed**: Added method extraction from regexMatches for iSagha and GoldBillion
- **Changed**: Enhanced live fetch debugging with all adapter fields

### 6. `app/api/marketSnapshot/route.ts`
- **No changes needed**: Already reads from DB snapshots, validates 10-minute threshold, computes medians

## Implementation Details

### A) Global Ounce Source
✅ Uses exact endpoint: `GET https://api.gold-api.com/price/XAU`
✅ Parses `price` → `impliedOunceUsd`, `updatedAt` → `fetchedAt`
✅ Validates: finite, 2000-8000 USD range
✅ 30-second cache
✅ No silent fallbacks (returns null + error if fails)

### B) Automation/Ingestion Pipeline
✅ DB schema includes all required fields
✅ `/api/cron/ingest` validates CRON_SECRET
✅ Fetches in parallel, inserts rows even on failure
✅ Returns per-source errors

### C) iSagha Ingestion
✅ Uses Playwright only (no direct fetch)
✅ Waits for networkidle
✅ Parses Arabic labels: عيار 21/24, شراء/بيع
✅ Normalizes Arabic digits, strips currency symbols
✅ Validates: OK only if market21Buy AND market21Sell are finite

### D) GoldBillion Ingestion
✅ Fixed Jina URL: `https://r.jina.ai/${finalUrl}` (correct format)
✅ Uses `/prices` path
✅ Flow: Direct → Jina → Playwright fallback
✅ Tracks method (direct/jina/playwright) in regexMatches
✅ Validates: OK only if market21Buy AND market21Sell are finite

### E) Market Snapshot
✅ Reads from DB snapshots (not live scraping)
✅ Computes median across available sources
✅ 10-minute staleness threshold
✅ Sets `referenceUnavailable=true` if no valid snapshots
✅ Includes sources[] with status, fetchedAt, lastError

### F) Strict Rules
✅ No manual entry UI
✅ No silent fallbacks (errors logged)
✅ Never sets market prices = fair value
✅ Never derives market from ounce
✅ Always shows source attribution + timestamps
✅ APIs never throw (return HTTP 200 with errors[])

## Testing

After deployment, verify:

1. **Debug endpoint**: `curl http://localhost:3000/api/debug/sources`
   - Should show `impliedOunce.status="OK"`, `source="gold-api.com"`, `price` ~4500
   - Should show `iSagha.method="playwright"` and parsed values
   - Should show `GoldBillion.method` (direct/jina/playwright) and status

2. **Cron ingest**: `curl "http://localhost:3000/api/cron/ingest?secret=YOUR_SECRET"`
   - Should insert rows and return `inserted` count + `errors[]`

3. **Market snapshot**: `curl http://localhost:3000/api/marketSnapshot`
   - Should show `impliedOunceUsd` non-null
   - Should show `activeSourceCount >= 1`
   - Should show `median.market21Buy` not null
   - Should show `referenceUnavailable=false` when sources are working


