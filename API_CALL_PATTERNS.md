# API Call Patterns: Per User vs Per Minute

## Two Types of API Calls

### 1. **Server-Side Cron Job** (Every Minute - NOT Per User)

**Route:** `/api/cron/ingest`

- **Frequency:** Runs **once per minute** automatically via Vercel Cron
- **Trigger:** Vercel's cron scheduler (not user-initiated)
- **Purpose:** Data ingestion - fetches gold prices from web sources and stores in Supabase
- **Per User?** ❌ **NO** - This runs once per minute globally, regardless of how many users are on the site
- **Cost:** 1 call per minute = ~1,440 calls/day = ~43,200 calls/month (fixed cost, not per user)

**Configuration:**
```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/ingest",
    "schedule": "* * * * *"  // Every minute
  }]
}
```

---

### 2. **Client-Side API Calls** (Per User - Every 30 Seconds)

**Routes:**
- `/api/marketSnapshot`
- `/api/forecast`
- `/api/forecast/series`

- **Frequency:** Every **30 seconds** while user has page open
- **Trigger:** User's browser (client-side polling)
- **Purpose:** Display current market data, forecasts, and charts to users
- **Per User?** ✅ **YES** - Each user's browser makes these calls independently
- **Cost:** Per user, per session

**Code:**
```typescript
// app/page.tsx
useEffect(() => {
  fetchSnapshot();      // /api/marketSnapshot
  fetchForecast();      // /api/forecast
  const interval = setInterval(() => {
    fetchSnapshot();    // Every 30 seconds
    fetchForecast();    // Every 30 seconds
  }, 30000);
}, []);

// components/ForecastCard.tsx
useEffect(() => {
  fetchSeries();        // /api/forecast/series
  const interval = setInterval(() => {
    fetchSeries();      // Every 30 seconds
  }, 30000);
}, [timeRange, scope]);
```

---

## Call Frequency Breakdown

### Server-Side (Global - Not Per User)
| Time Period | Calls | Notes |
|------------|-------|-------|
| Per minute | 1 | Fixed - runs automatically |
| Per hour | 60 | Fixed - regardless of users |
| Per day | 1,440 | Fixed - regardless of users |
| Per month | ~43,200 | Fixed - regardless of users |

### Client-Side (Per User)
| Session Duration | API Calls Per User | Calculation |
|-----------------|-------------------|-------------|
| 1 minute | 6 calls | 3 initial + 3 (1 poll) |
| 5 minutes | 33 calls | 3 initial + 30 (10 polls) |
| 15 minutes | 93 calls | 3 initial + 90 (30 polls) |
| 30 minutes | 183 calls | 3 initial + 180 (60 polls) |
| 1 hour | 363 calls | 3 initial + 360 (120 polls) |

**Per user, per month (10 sessions of 15 min each): ~930 calls**

---

## Total API Calls

### Example Scenario:
- **10 active users** viewing the site
- Each user has a **15-minute session**
- **1 server-side cron** running every minute

**Total calls in that 15-minute period:**
- Server-side cron: 15 calls (1 per minute)
- Client-side: 10 users × 93 calls = 930 calls
- **Total: 945 API calls**

**Per month (assuming 10 users, 10 sessions each):**
- Server-side cron: ~43,200 calls/month (fixed)
- Client-side: 10 users × 930 calls = 9,300 calls/month
- **Total: ~52,500 API calls/month**

---

## Key Takeaways

1. **Cron Job (`/api/cron/ingest`):**
   - ✅ Runs **once per minute** globally
   - ❌ **NOT per user** - fixed cost regardless of traffic
   - Purpose: Keep database updated with latest gold prices

2. **User-Facing APIs (`/api/marketSnapshot`, `/api/forecast`, `/api/forecast/series`):**
   - ✅ Called **per user** every 30 seconds
   - ✅ Scales with number of active users
   - Purpose: Display real-time data to users

3. **Cost Scaling:**
   - Server-side cron: **Fixed cost** (~43K calls/month)
   - Client-side APIs: **Variable cost** (scales with users)
   - At 10 users: ~52K total calls/month
   - At 100 users: ~136K total calls/month
   - At 1,000 users: ~973K total calls/month

---

## Optimization Opportunities

1. **Reduce Client-Side Polling:**
   - Increase interval from 30s to 60s (halves client-side calls)
   - Use WebSockets for real-time updates (eliminates polling)

2. **Add Caching:**
   - Cache forecast data (changes slowly)
   - Use HTTP cache headers for static-ish data

3. **Server-Side Cron:**
   - Already optimal - runs once per minute regardless of users
   - Consider reducing frequency if data doesn't change that fast


