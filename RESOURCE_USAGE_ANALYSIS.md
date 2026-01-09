# Resource Usage Analysis

## API Calls Per User Session

### Initial Page Load
- `/api/marketSnapshot` - 1 call
- `/api/forecast` - 1 call  
- `/api/forecast/series` - 1 call (with default daily range)

**Initial Load: 3 API calls**

### Polling Frequency
- All endpoints poll every **30 seconds** while user has page open
- Each poll cycle: 3 API calls (marketSnapshot + forecast + forecast/series)

### Per Session Estimates

| Session Duration | API Calls | Calculation |
|-----------------|-----------|-------------|
| 1 minute | 6 calls | 3 initial + 1 poll cycle (3 calls) |
| 5 minutes | 33 calls | 3 initial + 10 poll cycles (30 calls) |
| 15 minutes | 93 calls | 3 initial + 30 poll cycles (90 calls) |
| 30 minutes | 183 calls | 3 initial + 60 poll cycles (180 calls) |
| 1 hour | 363 calls | 3 initial + 120 poll cycles (360 calls) |

**Average Session (15 minutes): ~93 API calls**

### Per Month Estimates

Assuming:
- Average session: 15 minutes
- Average user visits: 10 sessions/month
- Total: 10 sessions × 93 calls = **930 API calls/month per user**

**Conservative estimate: ~1,000 API calls/month per user**

---

## Data Transfer Per User Session

### Response Sizes (Estimated)

#### `/api/marketSnapshot`
- Contains: pricing data, medians, sources array, warnings, errors
- Estimated size: **~3-5 KB** (JSON, uncompressed)
- With gzip: **~1-2 KB**

#### `/api/forecast`
- Contains: forecast direction, confidence, reasons, components, score
- Estimated size: **~1-2 KB** (JSON, uncompressed)
- With gzip: **~0.5-1 KB**

#### `/api/forecast/series`
- Contains: time series points array
- Size varies by range:
  - Daily (7 days): ~145 points × ~50 bytes = **~7 KB** (uncompressed)
  - Weekly (7 days): ~145 points × ~50 bytes = **~7 KB** (uncompressed)
  - Monthly (30 days): ~4,320 points × ~50 bytes = **~216 KB** (uncompressed)
  - Year-over-year (365 days): ~52,560 points × ~50 bytes = **~2.6 MB** (uncompressed)
- With gzip: Daily/Weekly ~2-3 KB, Monthly ~50-70 KB, YOY ~500-800 KB

**Default (daily range): ~2-3 KB with gzip**

### Per Session Estimates

**Initial Load:**
- marketSnapshot: ~2 KB
- forecast: ~1 KB
- forecast/series (daily): ~3 KB
- **Total: ~6 KB**

**Per Poll Cycle (every 30 seconds):**
- marketSnapshot: ~2 KB
- forecast: ~1 KB
- forecast/series (daily): ~3 KB
- **Total: ~6 KB per poll**

| Session Duration | Data Transfer | Calculation |
|-----------------|---------------|-------------|
| 1 minute | ~12 KB | 6 KB initial + 6 KB (1 poll) |
| 5 minutes | ~66 KB | 6 KB initial + 60 KB (10 polls) |
| 15 minutes | ~186 KB | 6 KB initial + 180 KB (30 polls) |
| 30 minutes | ~366 KB | 6 KB initial + 360 KB (60 polls) |
| 1 hour | ~726 KB | 6 KB initial + 720 KB (120 polls) |

**Average Session (15 minutes): ~186 KB (~0.19 MB)**

### Per Month Estimates

Assuming:
- Average session: 15 minutes
- Average user visits: 10 sessions/month
- Total: 10 sessions × 0.19 MB = **~1.9 MB/month per user**

**Conservative estimate: ~2-5 MB/month per user**

### Edge Cases

If user changes time range to "Year-over-year":
- Each forecast/series call: ~500-800 KB (gzipped)
- Per poll cycle: ~800 KB
- 15-minute session: ~24 MB
- **This would significantly increase monthly usage**

---

## Summary

### API Calls
- **Per Session (15 min avg): ~93 calls**
- **Per Month (10 sessions): ~1,000 calls**

### Data Transfer
- **Per Session (15 min, daily range): ~0.19 MB**
- **Per Month (10 sessions, daily range): ~2-5 MB**

### Notes
- All responses use `cache: 'no-store'` (no browser caching)
- Data is gzipped by Vercel automatically
- Forecast series size varies significantly by time range selection
- Most users likely use "daily" range (default), keeping data transfer low
- Users exploring historical data (monthly/yoy) will use more bandwidth

