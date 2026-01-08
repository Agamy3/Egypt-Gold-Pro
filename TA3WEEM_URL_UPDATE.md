# Ta3weem URL Update Summary

## Changes Made

Updated the Ta3weem DahabMasr adapter to try multiple URLs until one returns HTTP 200, instead of using a single hardcoded URL that was returning 404.

### File Changed

**`lib/egypt-sources.ts`** - Updated `parseTa3weemDahabMasr()` function

### Implementation Details

1. **Multiple URL Candidates**: The function now tries these URLs in order:
   - `https://ta3weem.com/dahab-masr`
   - `https://www.ta3weem.com/dahab-masr/`
   - `https://ta3weem.com/en/dahab-masr`
   - `https://ta3weem.com/ar/dahab-masr`

2. **URL Selection Logic**:
   - Iterates through candidate URLs sequentially
   - Uses `fetchWithRetry()` for each URL (already has timeout and retry logic)
   - Stops at the first URL that returns `response.ok === true` (HTTP 200)
   - If all URLs fail, returns an error with the last error message

3. **Logging**:
   - Logs the chosen working URL using `console.log()`: `Ta3weem DahabMasr: Using working URL: ${workingUrl}`
   - This log appears in server console logs

4. **URL in Response**:
   - The `ParseResult` interface includes the `url` field
   - The working URL is returned in the `url` field of the result
   - This URL is exposed in `/api/debug/sources` response, so it's visible in the Source Audit UI

5. **Parsing Logic**:
   - Parsing logic remains unchanged after the correct page loads
   - Same regex patterns for extracting 21k/24k buy/sell prices
   - Same validation rules

### Benefits

- **Resilience**: No longer fails if one URL path changes
- **Flexibility**: Automatically adapts to different URL structures (www vs non-www, trailing slash, language paths)
- **Visibility**: Working URL is logged and visible in debug endpoints
- **Backward Compatibility**: Parsing logic unchanged, so no risk of breaking price extraction

### Testing

To verify:
1. Check server logs for: `Ta3weem DahabMasr: Using working URL: <url>`
2. Check `/api/debug/sources` response - `ta3weemDahabMasr.url` field should show the working URL
3. Check Source Audit UI - should display the working URL for Ta3weem DahabMasr
4. Verify prices are still parsed correctly from the working URL


