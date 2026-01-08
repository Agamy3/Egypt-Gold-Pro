# iSagha Parsing Fix

## Summary

Fixed the iSagha adapter parsing to robustly extract prices from HTML with improved regex patterns and debugging support.

## Changes Made

### 1. Improved Parsing Logic

**File**: `lib/ingestion-adapters.ts`

- **Block-based parsing**: Instead of searching the entire HTML, the adapter now:
  1. Finds blocks containing "عيار 21" and "عيار 24" (up to 500 chars after each)
  2. Within each block, finds the nearest numeric value after "شراء" (buy)
  3. Within each block, finds the nearest numeric value after "بيع" (sell)

- **Better regex patterns**:
  - `عيار\s*21[\s\S]{0,500}` - Captures block containing "عيار 21"
  - `شراء[^0-9]*?([0-9]+(?:[\.\s,][0-9]+)*)` - Finds number after "شراء"
  - `بيع[^0-9]*?([0-9]+(?:[\.\s,][0-9]+)*)` - Finds number after "بيع"
  - Same patterns for "عيار 24"

- **Enhanced cleaning**:
  - `cleanPriceText()`: Removes "ج", "ج.م", "EGP", commas, extra spaces
  - `extractNumber()`: Extracts numeric value from cleaned text
  - Arabic digits are normalized before cleaning (via `normalizeDigits()`)

### 2. Validation

- **OK status only if**: Both `market21Buy` and `market21Sell` are finite numbers
- Price ranges: 21k (5000-8000 EGP), 24k (5500-8500 EGP)

### 3. Debug Support

**File**: `app/api/debug/sources/route.ts`

The `/api/debug/sources` endpoint now includes iSagha debug info:

- `httpStatus`: HTTP status code from the fetch
- `rawHtmlSnippet`: First 2000 chars of HTML response
- `regexMatches`: Array of regex matches showing:
  - Which patterns matched
  - What was extracted
  - Validation results (valid/invalid)

Example response:
```json
{
  "isagha": {
    "status": "OK",
    "lastIngested": 1234567890,
    "prices": { ... },
    "httpStatus": 200,
    "rawHtmlSnippet": "<html>...",
    "regexMatches": [
      { "pattern": "عيار 21 block", "match": "..." },
      { "pattern": "21k buy (شراء)", "match": "Found: 6025 from raw: \"6,025\" -> cleaned: \"6025\"" },
      { "pattern": "21k sell (بيع)", "match": "Found: 6000 from raw: \"6,000\" -> cleaned: \"6000\"" }
    ]
  }
}
```

### 4. Interface Updates

**File**: `lib/ingestion-adapters.ts`

- Added `httpStatus?: number` to `IngestionResult`
- Added `regexMatches?: Array<{ pattern: string; match: string }>` to `IngestionResult`
- Updated `rawResponse` to include first 2000 chars (was 1000)

## Testing

To test the improved parsing:

1. **Check debug endpoint**:
   ```bash
   curl http://localhost:3000/api/debug/sources | jq '.isagha'
   ```

2. **Verify regex matches**: Look at `regexMatches` array to see:
   - Which patterns found matches
   - What raw values were extracted
   - What cleaned values were computed
   - Final parsed prices

3. **Check raw HTML**: Review `rawHtmlSnippet` to see the actual HTML structure

4. **Manual test adapter**:
   ```typescript
   import { fetchIsagha } from '@/lib/ingestion-adapters';
   const result = await fetchIsagha();
   console.log(result.regexMatches);
   console.log(result.rawResponse.substring(0, 500));
   ```

## Expected Behavior

After these changes:

- ✅ iSagha adapter extracts prices more reliably
- ✅ Debug endpoint shows detailed parsing information
- ✅ Validation ensures only valid 21k buy/sell pairs are accepted
- ✅ Regex matches provide visibility into parsing process
- ✅ Raw HTML snippet helps diagnose parsing issues


