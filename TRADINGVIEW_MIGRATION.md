# TradingView Migration Summary

## Overview

Replaced Stooq with TradingView as the primary and only global ounce feed for Egypt Market Implied Ounce pricing.

## Changes Made

### 1. Removed All Stooq Logic ✅

- Removed `fetchStooqImpliedOunce()` function
- Removed all CSV parsing logic for Stooq
- Removed all Stooq references and comments

### 2. Added TradingView Adapter ✅

**File: `lib/implied-ounce.ts`**
- New function: `fetchTradingViewXAUUSD()`
- Fetches from TradingView's public quote API
- Endpoint: `https://scanner.tradingview.com/forex?instrument=XAUUSD`
- Returns: `{ price: number | null, timestamp: number | null, error: string | null, httpStatus?: number }`
- Supports multiple JSON response patterns:
  - Direct price field
  - Nested in data array
  - Nested in d array (common TradingView format)
  - Result object

### 3. Validation ✅

- **Price validation**: Must be between 3000 and 6000 USD
- **Timestamp validation**: Must be recent (≤ 2 minutes)
- Returns detailed error messages if validation fails

### 4. Caching ✅

**File: `lib/goldapi.ts`**
- Updated cache TTL to 30 seconds (was 45 seconds)
- Cache key format unchanged
- Source label updated to 'TradingView'

### 5. Error Handling ✅

- If TradingView fetch fails: returns `impliedOunce = null`
- Pushes detailed error to `errors[]` array
- **No fallback** to any other source (as required)
- Never throws - always returns structured response

### 6. Updated Type References ✅

**Files Updated:**
- `lib/implied-ounce.ts`: `ImpliedOunceResult.source` changed from `'Stooq'` to `'TradingView'`
- `lib/goldapi.ts`: `ImpliedOunceData.source` changed from `'Stooq'` to `'TradingView'`
- `app/api/marketSnapshot/route.ts`: Updated stale cache handling to use 'TradingView'
- `app/page.tsx`: Updated interface to use 'TradingView'
- `components/Dashboard.tsx`: Updated interface to use 'TradingView'
- `components/SourceAuditPanel.tsx`: Updated interface to use 'TradingView'

### 7. Debug Endpoint Updates ✅

**File: `app/api/debug/sources/route.ts`**
- Updated to show TradingView status
- Added HTTP status code display
- Shows parsed price
- Shows last error (if any)
- Calls `fetchTradingViewXAUUSD()` directly to get HTTP status

## Architecture Rules Maintained ✅

- ✅ No manual entry
- ✅ No silent fallback (returns null if TradingView fails)
- ✅ Never compute ounce from Egypt market prices
- ✅ Always show source attribution in API and UI

## Expected Results

After these changes:

1. **`/api/marketSnapshot`** shows:
   - `impliedOunce.source = "TradingView"`
   - `impliedOunce.impliedOunceUsd` ≈ live market value (3000-6000 USD range)

2. **`/api/debug/sources`** shows:
   - TradingView status (OK/ERROR)
   - HTTP status code
   - Parsed price
   - Last error (if any)

3. **UI Components** show:
   - Source badge: "TradingView" (replaces "Stooq")
   - Source Audit Panel: TradingView status and details

## Testing Checklist

- [ ] Check `/api/marketSnapshot` shows `impliedOunce.source = "TradingView"`
- [ ] Check `impliedOunce.impliedOunceUsd` is in 3000-6000 range
- [ ] Check `/api/debug/sources` shows TradingView HTTP status
- [ ] Check Source Audit UI shows TradingView (not Stooq)
- [ ] Check error handling when TradingView is unavailable (should return null, not fallback)
- [ ] Verify cache works correctly (30 second TTL)


