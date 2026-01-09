# Metals-API Fallback Implementation

## Summary

Added Metals-API as a fallback spot source so the app works without a GoldAPI key, while maintaining all critical rules.

## Changes Made

### 1. New Module: `lib/spot-fetch.ts`

Created a new module that handles global spot fetching with fallback:

- **Primary**: GoldAPI.io (requires API key)
- **Fallback**: Metals-API (no key required)

**Key Features**:
- `fetchGoldAPI()`: Fetches from GoldAPI.io
- `fetchMetalsAPI()`: Fetches from Metals-API and computes `xauSpotUsdOz = 1 / rates.XAU`
- `fetchGlobalSpot()`: Tries GoldAPI first, then Metals-API if GoldAPI fails
- Never throws - always returns `{ price, source, error }`

### 2. Updated `lib/goldapi.ts`

- Refactored to use `fetchGlobalSpot()` from `spot-fetch.ts`
- Updated `GoldSpotData` interface to include `source: 'GoldAPI' | 'MetalsAPI'`
- Updated caching to store and retrieve source

### 3. Database Schema Update

Updated `lib/db.ts` to add `source` column to `gold_spot` table:
- `source TEXT NOT NULL DEFAULT 'GoldAPI'`
- Stores which source was used for each spot price

### 4. Updated `/api/marketSnapshot`

- Removed early validation check for GOLDAPI_KEY (no longer required)
- Updated to use new `getGoldSpotWithCache()` which includes source
- Response now includes `goldSpot.source: 'GoldAPI' | 'MetalsAPI'`
- Error handling updated to use "GlobalSpot" as source name in errors

### 5. Updated `/api/debug/sources`

- Changed from `goldApi` to `globalSpot` in response
- Shows active source (`GoldAPI` or `MetalsAPI`)
- Includes error messages from both sources if both fail

### 6. Updated UI Components

**Dashboard.tsx**:
- Shows source badge next to "Global Gold Spot" title
- Color-coded: Blue for GoldAPI, Purple for MetalsAPI

**SourceAuditPanel.tsx**:
- Updated interface to use `globalSpot` instead of `goldApi`
- Shows active source with color-coded badge
- Displays error messages if both sources fail

**page.tsx**:
- Updated TypeScript interface to include `source` field in `goldSpot`

## Critical Rules Maintained ✅

1. ✅ **GoldAPI is primary** - Always tries GoldAPI first
2. ✅ **Never throws** - All functions return error objects, never throw
3. ✅ **Never derives spot from Egypt prices** - Only uses external APIs
4. ✅ **Explicit source labeling** - Every spot price has a `source` field
5. ✅ **No manual entry** - All data from APIs
6. ✅ **Works without GoldAPI key** - Falls back to Metals-API if GoldAPI unavailable

## How It Works

1. **Fetch Request**:
   - `fetchGlobalSpot()` is called
   - First tries `fetchGoldAPI()`
   - If GoldAPI returns 401/403 or fails, tries `fetchMetalsAPI()`
   - Returns `{ price, source, error }`

2. **Metals-API Response**:
   - Endpoint: `https://metals-api.com/api/latest?base=USD&symbols=XAU`
   - Response format: `{ rates: { XAU: 0.000372 } }`
   - Computation: `xauSpotUsdOz = 1 / rates.XAU`
   - Validation: Checks price is in reasonable range (2000-3000)

3. **Caching**:
   - Spot prices cached for 30-60 seconds (configurable via `GOLDAPI_CACHE_TTL`)
   - Source is stored with cached price
   - Stale data includes source information

4. **Error Handling**:
   - If GoldAPI fails: Logs error, tries Metals-API
   - If Metals-API fails: Returns null with combined error message
   - If both fail: `goldSpot = null` with error in `errors[]` array

## API Response Format

```json
{
  "goldSpot": {
    "xauSpotUsdOz": 2682.67,
    "source": "GoldAPI",
    "timestamp": 1234567890,
    "stale": false
  }
}
```

Or with fallback:

```json
{
  "goldSpot": {
    "xauSpotUsdOz": 2682.67,
    "source": "MetalsAPI",
    "timestamp": 1234567890,
    "stale": false
  }
}
```

## Testing

### Test without GoldAPI key:
1. Remove or comment out `GOLDAPI_KEY` from `.env.local`
2. Start server: `npm run dev`
3. Check `/api/marketSnapshot` - should return `goldSpot` with `source: "MetalsAPI"`

### Test with invalid GoldAPI key:
1. Set `GOLDAPI_KEY=invalid_key` in `.env.local`
2. Start server
3. Check `/api/marketSnapshot` - should return `goldSpot` with `source: "MetalsAPI"` (fallback)

### Test with valid GoldAPI key:
1. Set valid `GOLDAPI_KEY` in `.env.local`
2. Start server
3. Check `/api/marketSnapshot` - should return `goldSpot` with `source: "GoldAPI"` (primary)

### Verify Source Audit Panel:
1. Open `http://localhost:3000`
2. Click "Show Source Audit"
3. Should show "Global Gold Spot" with active source badge
4. Should show error messages if both sources fail

## Migration Notes

- Existing database will work - new `source` column defaults to 'GoldAPI'
- Old cached spot prices will have `source = 'GoldAPI'` by default
- No breaking changes - API response format extended with `source` field
- Frontend components updated to handle optional `source` field



