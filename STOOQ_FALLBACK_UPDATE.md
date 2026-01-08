# Stooq Fallback Implementation

## Summary

Replaced Metals-API fallback with Stooq as the no-auth fallback source for global gold spot prices.

## Changes Made

### 1. Updated `lib/spot-fetch.ts`

**Replaced Metals-API with Stooq**:
- New function: `fetchStooq()` 
- Endpoint: `https://stooq.com/q/l/?s=xauusd&i=d`
- Parses CSV response (header + one data line)
- Extracts "Close" column as XAUUSD price
- Validates price is in range (2000-3000)
- Includes first 200 chars of raw response in error messages

**Updated `fetchGlobalSpot()`**:
- Changed fallback from Metals-API to Stooq
- Updated source type from `'MetalsAPI'` to `'Stooq'`

### 2. Updated Type Definitions

**Files updated**:
- `lib/goldapi.ts`: Changed `source: 'GoldAPI' | 'MetalsAPI'` to `'GoldAPI' | 'Stooq'`
- `app/api/marketSnapshot/route.ts`: Updated source type
- `app/page.tsx`: Updated TypeScript interface
- `components/Dashboard.tsx`: Updated TypeScript interface
- `components/SourceAuditPanel.tsx`: Updated TypeScript interface

### 3. UI Color Coding

**Updated color scheme for source badges**:
- GoldAPI: Blue (`bg-blue-100 text-blue-800`)
- Stooq: Green (`bg-green-100 text-green-800`) - changed from Purple (Metals-API)

## CSV Parsing Implementation

Stooq returns CSV format:
```
Symbol,Date,Time,Open,High,Low,Close,Volume
XAUUSD,2024-01-15,23:59:59,2682.50,2685.00,2680.00,2683.25,0
```

**Parsing Logic**:
1. Split response into lines
2. Parse header to find "Close" column index
3. Parse data line and extract Close value
4. Validate as numeric and in range (2000-3000)
5. Return price or detailed error with raw snippet

## Error Handling

All errors include first 200 chars of raw response for debugging:
- HTTP errors: Include status code and response snippet
- Parsing errors: Include raw response snippet
- Validation errors: Include raw response snippet

## API Response Format

```json
{
  "goldSpot": {
    "xauSpotUsdOz": 2682.67,
    "source": "Stooq",
    "timestamp": 1234567890,
    "stale": false
  }
}
```

## Source Audit Panel

The Source Audit Panel shows:
- Active source: "GoldAPI" or "Stooq" with color-coded badge
- Price: Last parsed price from active source
- Error messages: Detailed error if source failed
- Status: OK/ERROR indicator

## Testing

### Test without GoldAPI key:
1. Remove `GOLDAPI_KEY` from `.env.local`
2. Start server: `npm run dev`
3. Check `/api/marketSnapshot` - should return `goldSpot` with `source: "Stooq"`

### Test with invalid GoldAPI key:
1. Set `GOLDAPI_KEY=invalid_key` in `.env.local`
2. Start server
3. Check `/api/marketSnapshot` - should return `goldSpot` with `source: "Stooq"` (fallback)

### Test with valid GoldAPI key:
1. Set valid `GOLDAPI_KEY` in `.env.local`
2. Start server
3. Check `/api/marketSnapshot` - should return `goldSpot` with `source: "GoldAPI"` (primary)

## Critical Rules Maintained ✅

1. ✅ **GoldAPI is primary** - Always tries GoldAPI first
2. ✅ **Never throws** - All functions return error objects, never throw
3. ✅ **Never derives spot from Egypt prices** - Only uses external APIs
4. ✅ **Explicit source labeling** - Every spot price has a `source` field
5. ✅ **No manual entry** - All data from APIs
6. ✅ **Works without GoldAPI key** - Falls back to Stooq if GoldAPI unavailable
7. ✅ **Always returns HTTP 200** - Even if spot unavailable, errors in `errors[]` array
8. ✅ **Detailed error messages** - Includes raw response snippets (200 chars)


