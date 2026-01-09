# Egypt Market Implied Ounce Migration

## Summary

Updated the application to use "Egypt Market Implied Ounce" instead of "Global Gold Spot". The system now uses Stooq as the sole source for implied ounce pricing (removed GoldAPI dependency).

## Changes Made

### 1. New Module: `lib/implied-ounce.ts`

- Created new module for Egypt Market Implied Ounce fetching
- Removed GoldAPI dependency completely
- Only uses Stooq as source
- Updated validation: accepts 3000-6000 USD range (instead of 2000-3000)
- Error messages updated to reference "Egypt Market Implied Ounce"

### 2. Updated `lib/goldapi.ts`

- Renamed to focus on implied ounce (kept filename for backward compatibility)
- Updated interface: `GoldSpotData` → `ImpliedOunceData`
- Field renamed: `xauSpotUsdOz` → `impliedOunceUsd`
- Source type: `'Stooq'` only (removed `'GoldAPI'`)
- Uses `fetchImpliedOunce()` from `implied-ounce.ts`

### 3. Updated `lib/pricing.ts`

- Renamed function: `spotToUsdPerGram24()` → `impliedOunceToUsdPerGram24()`
- Updated parameter: `xauSpotUsdOz` → `impliedOunceUsd`
- Updated `calculatePricing()` parameter interface

### 4. Updated `/api/marketSnapshot`

- Response field: `goldSpot` → `impliedOunce`
- Field name: `xauSpotUsdOz` → `impliedOunceUsd`
- Source: `'Stooq'` only
- Error source name: `'GlobalSpot'` → `'ImpliedOunce'`
- All references updated

### 5. Updated `/api/debug/sources`

- Response field: `globalSpot` → `impliedOunce`
- Added `ounceType: 'Egypt Market Implied'`
- Source: `'Stooq'` only
- Updated all references

### 6. Updated UI Components

**Dashboard.tsx**:
- Card title: "Global Gold Spot" → "Egypt Market Implied Ounce (USD)"
- Field: `goldSpot.xauSpotUsdOz` → `impliedOunce.impliedOunceUsd`
- Label: "XAU/USD per troy ounce" → "USD per troy ounce"
- Source badge: Shows "Stooq" (green badge)

**SourceAuditPanel.tsx**:
- Section title: "Global Gold Spot" → "Egypt Market Implied Ounce (USD)"
- Added "Ounce Type" field showing "Egypt Market Implied"
- Shows "Source: Stooq"
- Field: "XAU/USD" → "Value (USD)"

**page.tsx**:
- Updated TypeScript interface: `goldSpot` → `impliedOunce`
- Updated field names

### 7. Updated Unit Tests

**lib/pricing.test.ts**:
- Renamed test: `spotToUsdPerGram24` → `impliedOunceToUsdPerGram24`
- Updated test values: 4500 USD (Egypt Market Implied Ounce range)
- Updated acceptance test expectations

## API Response Format

**Before**:
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

**After**:
```json
{
  "impliedOunce": {
    "impliedOunceUsd": 4500.0,
    "source": "Stooq",
    "timestamp": 1234567890,
    "stale": false
  }
}
```

## Price Range Updates

- **Old**: 2000-3000 USD (rejected outside range)
- **New**: 3000-6000 USD (rejects < 3000 or > 6000)
- **Typical Egypt Market Implied Ounce**: ~4500 USD

## Critical Rules Maintained ✅

1. ✅ **No manual input** - All data from APIs
2. ✅ **No silent fallbacks** - Shows "REFERENCE UNAVAILABLE"
3. ✅ **Never derive Egypt prices from different ounce type** - Only uses Egypt Market Implied Ounce
4. ✅ **Always show source attribution** - Source: "Stooq" clearly displayed
5. ✅ **Never throws** - All errors return error objects
6. ✅ **Explicit labeling** - "Egypt Market Implied Ounce" clearly labeled

## Breaking Changes

- API response field renamed: `goldSpot` → `impliedOunce`
- Field renamed: `xauSpotUsdOz` → `impliedOunceUsd`
- Removed GoldAPI support (only Stooq now)
- Price validation range changed: 3000-6000 (was 2000-3000)
- All UI labels updated to "Egypt Market Implied Ounce"

## Migration Notes

- Existing database records in `gold_spot` table remain valid (reused)
- Frontend needs to update to use `impliedOunce` instead of `goldSpot`
- Source will always be "Stooq" going forward
- Price range expectations updated to 3000-6000 USD



