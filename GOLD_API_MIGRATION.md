# Gold-API.com Migration & Ingestion Fixes

## Summary

Replaced Stooq/TradingView with Gold-API.com and fixed iSagha/GoldBillion ingestion with Playwright fallback support.

## Part 1: Replaced Implied Ounce Source

### Changes

1. **Removed Stooq/TradingView**: Completely removed all references
2. **Added Gold-API.com**: 
   - Base URL: `https://api.gold-api.com`
   - Free endpoint, no API key required
   - Tries multiple endpoint patterns
   - Validates price is finite and within 2000-8000 USD range
   - 30-second cache

### Files Modified

- `lib/implied-ounce.ts`: Replaced `fetchTradingViewXAUUSD` with `fetchGoldApiOunceUsd`
- `lib/goldapi.ts`: Updated source type to `'gold-api.com'`
- `app/api/marketSnapshot/route.ts`: Updated source references
- `app/page.tsx`: Updated interface
- `components/Dashboard.tsx`: Updated interface
- `components/SourceAuditPanel.tsx`: Updated interface
- `app/api/debug/sources/route.ts`: Updated to use `fetchGoldApiOunceUsd`

### API Response

`/api/marketSnapshot` now returns:
```json
{
  "impliedOunce": {
    "impliedOunceUsd": 2650.50,
    "source": "gold-api.com",
    "fetchedAt": 1234567890,
    "stale": false
  }
}
```

## Part 2: Fixed iSagha Ingestion

### Problem
iSagha page is a JS-rendered app shell, so HTML fetch returns only JS bundles with no prices.

### Solution
1. **Try XHR/JSON endpoint first**: Scans HTML for API endpoint patterns and tries to fetch JSON directly
2. **Playwright fallback**: If direct fetch fails or returns JS shell, uses Playwright to render the page
3. **Enhanced parsing**: Same robust regex patterns to extract prices from rendered HTML

### Implementation
- Added `findIsaghaApiEndpoint()` to detect API endpoints in HTML
- Integrated Playwright via `lib/playwright-helper.ts`
- Updated `fetchIsagha()` to try API endpoint → Playwright fallback
- Returns comprehensive debug info (url, httpStatus, regexMatches, rawHtmlSnippet)

## Part 3: Fixed GoldBillion Ingestion

### Problems
1. Proxy 422 error with Jina AI
2. JS-rendered content
3. Incorrect Jina URL construction

### Solutions
1. **Fixed Jina URL construction**: Now correctly constructs `https://r.jina.ai/https://<host>/<path>`
2. **Multiple URL paths**: Tries `/prices`, `/gold-prices`, `/egypt-gold-prices`, and homepage
3. **Playwright fallback**: If Jina fails or returns JS shell, uses Playwright
4. **Debug logging**: Logs Jina URL and all fallback attempts

### Implementation
- Fixed Jina URL: `https://r.jina.ai/${finalUrl}` (properly includes full URL)
- Added URL path iteration
- Integrated Playwright fallback
- Enhanced error reporting with regexMatches

## Part 4: Debug & Acceptance

### `/api/debug/sources` Enhancements

Now shows for each source:
- `url`: The URL that was fetched
- `httpStatus`: HTTP status code
- `jinaUrl`: Jina proxy URL if used (for GoldBillion)
- `rawHtmlSnippet`: First 1200 chars of HTML/response
- `regexMatches`: Array of regex patterns and matches
- `parsed values`: Extracted prices
- `lastError`: Last error message

### Cron Ingest Endpoint

`/api/cron/ingest`:
- Fetches iSagha and GoldBillion in parallel
- Inserts snapshot rows even if one source fails
- Returns clear per-source errors in `errors[]` array
- Always returns HTTP 200 with summary:
  ```json
  {
    "inserted": 2,
    "errors": [],
    "timestamp": 1234567890
  }
  ```

### Critical Rules Maintained

✅ No manual entry
✅ No silent fallbacks (errors are logged and returned)
✅ Never compute Egypt market prices from ounce/spot
✅ Always show source attribution + timestamps

## Installation Requirements

### Playwright

Playwright is required for JS-rendered page scraping. Install:

```bash
npm install playwright
npx playwright install chromium
```

**Note**: On Vercel, Playwright requires additional configuration. Consider:
- Using Vercel's serverless functions with Playwright
- Or using a headless browser service as alternative
- Or implementing API endpoint detection (preferred approach)

## Testing

After changes, verify:

```bash
# Check market snapshot
curl -sS http://localhost:3000/api/marketSnapshot | jq '.impliedOunce'

# Should show:
# {
#   "impliedOunceUsd": <number between 2000-8000>,
#   "source": "gold-api.com",
#   "fetchedAt": <timestamp>
# }

# Check debug sources
curl -sS http://localhost:3000/api/debug/sources | jq '.isagha, .goldBillion'

# Should show:
# - url, httpStatus, rawHtmlSnippet, regexMatches for each
# - jinaUrl for GoldBillion if Jina was used

# Test cron ingest
curl -H "x-cron-secret: YOUR_SECRET" http://localhost:3000/api/cron/ingest

# Should return:
# {
#   "inserted": 0-2,
#   "errors": [...],
#   "timestamp": ...
# }
```

## Acceptance Criteria

✅ `/api/marketSnapshot` shows `impliedOunce.source="gold-api.com"` and non-null `impliedOunceUsd`
✅ At least one of iSagha/GoldBillion returns market21/24 prices
✅ `/api/debug/sources` shows comprehensive debug info for all sources
✅ Cron ingest continues even if one source fails
✅ No manual entry, no silent fallbacks, never compute Egypt market from ounce


