# Egypt Sources Fix Summary

## Files Changed

1. **lib/egypt-sources.ts** - Major updates
2. **app/api/debug/sources/route.ts** - Enhanced diagnostics
3. **components/SourceAuditPanel.tsx** - Added third source display
4. **app/api/marketSnapshot/route.ts** - Added third source to list

## Changes Made

### 1. Improved Diagnostics ✅

**lib/egypt-sources.ts**:
- Added `ParseResult` interface with `url`, `httpStatus` fields
- Updated `SourceStatus` interface to include `url` and `httpStatus`
- All parse functions now return URL and HTTP status code
- Error messages include stack traces (first 200 chars)

**app/api/debug/sources/route.ts**:
- Added `url` and `httpStatus` to all Egypt source responses
- Changed `statusCode` to `httpStatus` for consistency
- Added `ta3weemDahabMasr` to debug output
- Response snippets limited to 800 chars (was 1000)

### 2. Added Third Source: Ta3weem DahabMasr ✅

**lib/egypt-sources.ts**:
- New function: `parseTa3weemDahabMasr()`
- URL: `https://www.ta3weem.com/dahab-masr`
- HTML parsing with robust regex patterns
- Validates at least market21Buy and market21Sell
- Added to `getAllEgyptSources()` sources list

**app/api/marketSnapshot/route.ts**:
- Added `'ta3weem_dahabmasr'` to `egyptSourcesList`

**components/SourceAuditPanel.tsx**:
- Added `ta3weemDahabMasr` interface
- Added UI section showing URL, HTTP status, prices, errors, raw response

### 3. Hardened Existing Sources ✅

**lib/egypt-sources.ts**:
- Added `getBrowserHeaders()` function with:
  - User-Agent (Chrome-like)
  - Accept headers
  - Accept-Language
  - Referer (set to site root)
- Applied headers to all Egypt source fetches
- Timeout already 10s, retry already 2 (no change needed)
- Enhanced error messages with HTTP status codes

**GoldBillion**:
- Uses `getBrowserHeaders('https://goldbillion.com')`
- Returns URL and HTTP status in ParseResult
- Validates prices with `validatePrices()` function

**DahabMasr**:
- Uses `getBrowserHeaders('https://dahabmasr.com')`
- Returns URL and HTTP status in ParseResult
- Validates prices with `validatePrices()` function

### 4. Status OK Only When Valid Numbers Exist ✅

**lib/egypt-sources.ts**:
- New function: `validatePrices()` - checks that market21Buy and market21Sell are:
  - Not null
  - Finite numbers
  - Greater than 0
- `fetchSource()` only returns status 'OK' if `validatePrices()` returns true
- All parse functions check validation before returning success

### 5. Critical Rules Maintained ✅

- ✅ No manual entry UI
- ✅ No silent fallbacks - Shows "REFERENCE UNAVAILABLE"
- ✅ Never derive Egypt market from ounce/spot
- ✅ If no active Egypt source: referenceUnavailable=true, implied FX remains null
- ✅ Always show source attribution

## Expected Results

After these changes:

1. **/api/marketSnapshot** should show:
   - `activeSourceCount >= 1` (at least one of goldbillion, dahabmasr, ta3weem_dahabmasr)
   - `median.market21Buy` around 6000-6050 EGP
   - `median.market24Buy` around 6850-6900 EGP
   - `pricing.usdEgpGold` becomes non-null when market data available

2. **/api/debug/sources** shows:
   - For each Egypt source: url, httpStatus, rawResponse (800 chars), error, parsed values
   - Clear indication of which sources are OK vs DOWN
   - HTTP status codes to identify 403/Cloudflare issues

3. **Source Audit UI** shows:
   - All three sources with their status
   - URL and HTTP status for each
   - Parsed prices (21k/24k buy/sell)
   - Error messages if parsing fails
   - Raw HTML snippets (800 chars) for debugging

## Testing Checklist

- [ ] Check `/api/debug/sources` shows url and httpStatus for each source
- [ ] Check `/api/marketSnapshot` shows activeSourceCount >= 1
- [ ] Check median.market21Buy is around 6000-6050
- [ ] Check median.market24Buy is around 6850-6900
- [ ] Check Source Audit UI shows all three sources
- [ ] Check at least one source shows status OK
- [ ] Check implied FX is computed when market data available



