# Run Instructions & Verification Checklist

## Setup Steps

### 1. Install Dependencies

```bash
cd /Users/agamy/egyptgold-pro
npm install
```

### 2. Configure Environment Variables

Create `.env.local` file in the project root:

```bash
cat > .env.local << EOF
GOLDAPI_KEY=your_goldapi_key_here
DATABASE_PATH=./db/egyptgold.db
GOLDAPI_CACHE_TTL=45
EGYPT_SOURCES_CACHE_TTL=180
EOF
```

**Important**: Replace `your_goldapi_key_here` with your actual GoldAPI.io API key.

You can get a GoldAPI key by:
1. Signing up at https://www.goldapi.io
2. Getting your API key from the dashboard

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Verification Checklist

After starting the server, verify the following:

### ✅ 1. GoldAPI Spot Price

**Endpoint**: `http://localhost:3000/api/marketSnapshot`

**Expected Response**:
- `goldSpot.xauSpotUsdOz` should be a number around **2600-2700** (current gold spot price)
- `goldSpot.stale` should be `false` (or `true` if using cached data)
- `goldSpot.timestamp` should be recent

**Verification Command**:
```bash
curl http://localhost:3000/api/marketSnapshot | jq '.goldSpot'
```

**Expected Output**:
```json
{
  "xauSpotUsdOz": 2682.67,
  "timestamp": 1234567890,
  "stale": false
}
```

### ✅ 2. Egypt Market Sources

**Expected Response**:
- At least one Egypt source (`goldbillion` or `dahabmasr`) should return:
  - `status: "OK"` (or `"DOWN"` if source is unavailable)
  - `market21Buy` around **6000-6050 EGP**
  - `market24Buy` around **6850-7000 EGP**

**Verification Command**:
```bash
curl http://localhost:3000/api/marketSnapshot | jq '.egyptMarket'
```

**Expected Output**:
```json
{
  "median": {
    "market21Buy": 6025,
    "market21Sell": 6010,
    "market24Buy": 6880,
    "market24Sell": 6865
  },
  "sources": [
    {
      "source": "goldbillion",
      "status": "OK",
      "fetchedAt": 1234567890
    },
    {
      "source": "dahabmasr",
      "status": "OK",
      "fetchedAt": 1234567890
    }
  ],
  "activeSourceCount": 2
}
```

### ✅ 3. Implied Gold FX

**Expected Response**:
- `pricing.usdEgpGold` should be computed if `market21Buy` exists
- Should be around **79-81** (based on xauSpotUsdOz ≈ 2682.67 and market21Buy ≈ 6025)

**Verification Command**:
```bash
curl http://localhost:3000/api/marketSnapshot | jq '.pricing.usdEgpGold'
```

**Expected Output**:
```json
79.8
```

### ✅ 4. Source Audit Panel

1. Open `http://localhost:3000` in your browser
2. Click "Show Source Audit" button
3. Verify the Source Audit Panel shows:
   - **GoldAPI**: Price displayed, status OK/ERROR, error message if any
   - **Dahab Masr**: Parsed 21k/24k prices, status OK/DOWN, error if any
   - **GoldBillion**: Parsed 21k/24k prices, status OK/DOWN, error if any
   - Raw HTML/JSON responses are visible in expandable sections

### ✅ 5. Debug Endpoint

**Endpoint**: `http://localhost:3000/api/debug/sources`

**Verification Command**:
```bash
curl http://localhost:3000/api/debug/sources | jq '.'
```

**Expected Response**:
```json
{
  "timestamp": 1234567890,
  "goldApi": {
    "status": "OK",
    "price": 2682.67,
    "rawResponse": "...",
    "error": null,
    "statusCode": null
  },
  "dahabMasr": {
    "status": "OK",
    "prices": {
      "market21Buy": 6025,
      "market21Sell": 6010,
      "market24Buy": 6880,
      "market24Sell": 6865
    },
    "rawResponse": "...",
    "error": null,
    "statusCode": null
  },
  "goldBillion": {
    "status": "OK",
    "prices": {
      "market21Buy": 6025,
      "market21Sell": 6010,
      "market24Buy": 6880,
      "market24Sell": 6865
    },
    "rawResponse": "...",
    "error": null,
    "statusCode": null
  }
}
```

### ✅ 6. Error Handling

**Test with missing GOLDAPI_KEY**:
```bash
# Temporarily rename .env.local
mv .env.local .env.local.bak

# Restart server and test
curl http://localhost:3000/api/marketSnapshot | jq '.errors'

# Should return:
# [
#   {
#     "source": "Configuration",
#     "message": "Missing GOLDAPI_KEY environment variable"
#   }
# ]

# Restore .env.local
mv .env.local.bak .env.local
```

**Expected Behavior**:
- Endpoint returns HTTP 200 (never 500)
- `errors[]` array contains error details
- `goldSpot` is `null` when GOLDAPI_KEY is missing
- Other data (Egypt sources) can still be fetched

### ✅ 7. Unit Tests

**Run Tests**:
```bash
npm test
```

**Expected Output**:
```
PASS  lib/pricing.test.ts
  Pricing Engine
    ✓ Acceptance test: xau=2682.67, market21=6025 → usdEgp_gold ≈ 79-81
    ✓ All other tests pass
```

## Troubleshooting

### Issue: GoldAPI returns null

**Check**:
1. Is `GOLDAPI_KEY` set in `.env.local`?
2. Is the API key valid?
3. Check browser console or server logs for error messages
4. Use Source Audit Panel to see detailed error messages

**Solution**:
- Verify API key at https://www.goldapi.io
- Ensure `.env.local` is in the project root
- Restart the dev server after changing `.env.local`

### Issue: Egypt sources return DOWN status

**Check**:
1. Use Source Audit Panel to see raw HTML responses
2. Check for Cloudflare protection (HTTP 403)
3. Verify HTML parsing patterns match the website structure

**Solution**:
- HTML structure may have changed - check raw responses in debug endpoint
- Update parsing patterns in `lib/egypt-sources.ts` if needed
- Check if websites are accessible from your network

### Issue: Implied Gold FX is null

**Check**:
1. Is `goldSpot.xauSpotUsdOz` not null?
2. Is `egyptMarket.median.market21Buy` not null?

**Expected**:
- `usdEgpGold` requires both goldSpot and market21Buy
- If either is null, `usdEgpGold` will be null (by design)

## Quick Verification Script

Save this as `verify.sh`:

```bash
#!/bin/bash

echo "🔍 Verifying EgyptGold Pro..."

echo ""
echo "1. Checking GoldAPI spot price..."
GOLDSPOT=$(curl -s http://localhost:3000/api/marketSnapshot | jq -r '.goldSpot.xauSpotUsdOz // "null"')
if [ "$GOLDSPOT" != "null" ] && (( $(echo "$GOLDSPOT > 2500 && $GOLDSPOT < 3000" | bc -l) )); then
  echo "✅ GoldAPI spot: $GOLDSPOT (expected: 2500-3000)"
else
  echo "❌ GoldAPI spot: $GOLDSPOT (expected: 2500-3000)"
fi

echo ""
echo "2. Checking Egypt market 21k..."
MARKET21=$(curl -s http://localhost:3000/api/marketSnapshot | jq -r '.egyptMarket.median.market21Buy // "null"')
if [ "$MARKET21" != "null" ] && (( $(echo "$MARKET21 > 5900 && $MARKET21 < 6100" | bc -l) )); then
  echo "✅ Market 21k buy: $MARKET21 EGP (expected: 5900-6100)"
else
  echo "❌ Market 21k buy: $MARKET21 EGP (expected: 5900-6100)"
fi

echo ""
echo "3. Checking Implied Gold FX..."
GOLDFX=$(curl -s http://localhost:3000/api/marketSnapshot | jq -r '.pricing.usdEgpGold // "null"')
if [ "$GOLDFX" != "null" ] && (( $(echo "$GOLDFX > 75 && $GOLDFX < 85" | bc -l) )); then
  echo "✅ Implied Gold FX: $GOLDFX (expected: 75-85)"
else
  echo "❌ Implied Gold FX: $GOLDFX (expected: 75-85)"
fi

echo ""
echo "✅ Verification complete!"
```

Run with:
```bash
chmod +x verify.sh
./verify.sh
```

## Production Deployment

For production:

```bash
npm run build
npm start
```

Or with Docker:

```bash
docker-compose up --build
```

Make sure to set environment variables in production:
- `GOLDAPI_KEY`
- `DATABASE_PATH`
- Cache TTL settings (optional)


