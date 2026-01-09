# Stooq Parsing Fix

## Summary

Fixed Stooq CSV parsing to handle both single-line and multi-line formats, with proper handling of trailing commas and CRLF line endings.

## Changes Made

### Updated `lib/spot-fetch.ts` - `fetchStooq()` function

**New Parsing Logic**:

1. **Normalize line endings**: Convert CRLF (`\r\n`) and CR (`\r`) to LF (`\n`)

2. **Filter empty lines**: Split and filter out empty lines after trimming

3. **Handle two formats**:
   - **Format 1 (2+ lines)**: Treat first line as header, second line as data
     - Parse header to find "Close" column index
     - Extract Close value from data line at that index
   - **Format 2 (1 line)**: Treat as single data row
     - Use known order: `Symbol,Date,Time,Open,High,Low,Close,Volume`
     - Extract Close from index 6 (7th value)

4. **Handle trailing commas**: 
   - Split by comma and trim all fields
   - Don't filter out fields prematurely (handles trailing empty fields)

5. **Error handling**:
   - All errors include raw data line (first 200 chars) for debugging
   - Validates price is numeric, > 0, and in range (2000-3000)

## Implementation Details

```typescript
// Normalize line endings
const normalizedText = responseText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

// Split and filter empty lines
const lines = normalizedText.split('\n').filter(line => line.trim().length > 0);

if (lines.length >= 2) {
  // Format 1: Header + data
  const headerLine = lines[0];
  const dataLine = lines[1];
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
  const closeIndex = headers.indexOf('close');
  const dataFields = dataLine.split(',').map(f => f.trim());
  closePrice = parseFloat(dataFields[closeIndex]);
} else {
  // Format 2: Single data line
  const dataLine = lines[0];
  const dataFields = dataLine.split(',').map(f => f.trim());
  closePrice = parseFloat(dataFields[6]); // Close is 7th column (index 6)
}
```

## Example Formats Handled

**Format 1 (with header)**:
```
Symbol,Date,Time,Open,High,Low,Close,Volume
XAUUSD,2024-01-15,23:59:59,2682.50,2685.00,2680.00,2683.25,0
```

**Format 2 (single line)**:
```
XAUUSD,2024-01-15,23:59:59,2682.50,2685.00,2680.00,2683.25,0
```

**With trailing comma**:
```
XAUUSD,2024-01-15,23:59:59,2682.50,2685.00,2680.00,2683.25,0,
```

**With CRLF**:
```
Symbol,Date,Time,Open,High,Low,Close,Volume\r\nXAUUSD,2024-01-15,23:59:59,2682.50,2685.00,2680.00,2683.25,0
```

## Error Messages

All errors include the raw data line (first 200 chars) for debugging:

- `Stooq response is empty. Response: ...`
- `Stooq data line has insufficient fields (expected 7+, got 3). Raw line: ...`
- `Stooq Close price is invalid or missing: "NaN". Raw line: ...`
- `Stooq price out of range: 1500 (expected 2000-3000). Raw line: ...`

## API Response

When Stooq succeeds, `/api/marketSnapshot` returns:

```json
{
  "goldSpot": {
    "xauSpotUsdOz": 2683.25,
    "source": "Stooq",
    "timestamp": 1234567890,
    "stale": false
  }
}
```

## Critical Rules Maintained ✅

1. ✅ **Never throws** - All errors return error strings
2. ✅ **Never derives spot from Egypt prices** - Only uses Stooq API
3. ✅ **Explicit source labeling** - `source: "Stooq"` when Stooq is used
4. ✅ **No manual entry** - All data from APIs
5. ✅ **Always returns HTTP 200** - Even if Stooq fails, errors in `errors[]` array
6. ✅ **Detailed error messages** - Includes raw data line (200 chars)



