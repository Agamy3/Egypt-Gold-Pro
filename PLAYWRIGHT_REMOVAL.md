# Playwright Removal Summary

## Files Changed

### 1. **Deleted Files**
- `lib/playwright-scraper.ts` - Playwright helper module (removed)
- `lib/playwright-helper.ts` - Legacy Playwright helper (removed)

### 2. **Created Files**
- `lib/endpoint-discovery.ts` - New endpoint discovery module using HTTP-only approach

### 3. **Modified Files**

#### `lib/ingestion-adapters.ts`
- Removed import: `import { scrapeWithPlaywright } from './playwright-scraper';`
- Added import: `import { discoverEndpoint } from './endpoint-discovery';`
- Added endpoint caching: `endpointCache` Map with 24h TTL
- Updated `IngestionResult` interface: added `discoveredEndpoint` and `jsonSnippet` fields
- **iSagha adapter (`fetchIsagha`)**: Completely rewritten
  - Removed all Playwright code
  - Implements endpoint discovery workflow:
    1. Check cache for discovered endpoint
    2. If not cached, run discovery (fetch HTML → extract JS bundles → find API endpoints)
    3. Cache discovered endpoint for 24h
    4. Fetch JSON from discovered endpoint
    5. Parse prices using `parsePriceJson()` helper
  - Returns `discoveredEndpoint` and `jsonSnippet` in result
- **GoldBillion adapter (`fetchGoldBillion`)**: Completely rewritten
  - Removed all Playwright and Jina AI code
  - Same endpoint discovery workflow as iSagha
  - Returns `discoveredEndpoint` and `jsonSnippet` in result
- Added `parsePriceJson()` helper function to extract prices from various JSON structures

#### `app/api/debug/sources/route.ts`
- Updated method extraction: changed from "playwright" to "endpoint-discovery"
- Added `discoveredEndpoint` field extraction from live fetch results
- Added `jsonSnippet` field extraction from live fetch results
- Updated default method fallback to "endpoint-discovery"

#### `lib/endpoint-discovery.ts` (new file)
- `extractJsBundleUrls()`: Extracts JS bundle URLs from HTML
- `findApiEndpointsInJs()`: Searches JS bundle text for API endpoint patterns
- `discoverEndpoint()`: Main discovery function that:
  1. Fetches HTML from prices page
  2. Extracts JS bundle URLs
  3. Fetches JS bundles and searches for API endpoints
  4. Tries candidate endpoints until one returns valid JSON with price data
  5. Returns the working endpoint or error

### 4. **No Changes Required**
- `app/api/cron/ingest/route.ts` - Already handles IngestionResult interface correctly
- `app/api/marketSnapshot/route.ts` - Already reads from DB snapshots
- Database schema - No changes needed (discoveredEndpoint/jsonSnippet stored in rawResponseSnippet)

## Key Features

1. **No Playwright Dependency**: Project builds without Playwright
2. **HTTP-Only Approach**: All fetching uses standard fetch API
3. **Endpoint Discovery**: Automatically finds API endpoints from JS bundles
4. **24h Caching**: Discovered endpoints cached in memory to avoid re-discovery
5. **Robust Parsing**: Handles multiple JSON structures (direct keys, nested objects, Arabic keys)
6. **Debug Output**: `/api/debug/sources` shows discovered endpoint URLs and JSON snippets

## Acceptance Criteria

✅ Project builds (no Playwright required)
✅ `/api/debug/sources` returns JSON with discovered endpoints
✅ `/api/cron/ingest` can insert rows with discovered endpoint data
✅ At least one source should become OK with market21Buy not null after running cron ingest


