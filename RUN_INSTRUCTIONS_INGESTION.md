# Run Instructions - Ingestion Pipeline

## Environment Variables Required

Create a `.env.local` file in the project root:

```bash
# Required: Secret for cron endpoint authentication
CRON_SECRET=your-random-secret-key-here

# Optional: Custom GoldBillion URL (default: https://goldbillion.com)
GOLDBILLION_URL=https://goldbillion.com
```

**Generate a secure CRON_SECRET**:
```bash
# On macOS/Linux
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Database

The database table will be created automatically on first run. The database file will be created at:
- Default: `./db/egyptgold.db`
- Or set `DATABASE_PATH` environment variable

### 3. Run Development Server

```bash
npm run dev
```

The app will start at `http://localhost:3000`

### 4. Manually Trigger Ingestion (for testing)

```bash
# Test the cron endpoint manually
curl -H "x-cron-secret: your-secret-key-here" http://localhost:3000/api/cron/ingest

# Or with query parameter
curl "http://localhost:3000/api/cron/ingest?secret=your-secret-key-here"
```

Expected response:
```json
{
  "inserted": 2,
  "errors": [],
  "timestamp": 1234567890
}
```

### 5. Verify Data in Database

```bash
# View latest snapshots
sqlite3 db/egyptgold.db "SELECT source, createdAt, market21Buy, market21Sell, error FROM market_snapshots ORDER BY createdAt DESC LIMIT 10;"

# Count snapshots per source
sqlite3 db/egyptgold.db "SELECT source, COUNT(*) as count FROM market_snapshots GROUP BY source;"

# Check for errors
sqlite3 db/egyptgold.db "SELECT source, createdAt, error FROM market_snapshots WHERE error IS NOT NULL ORDER BY createdAt DESC LIMIT 20;"
```

### 6. Test Market Snapshot API

```bash
# Should read from database (not scrape live)
curl http://localhost:3000/api/marketSnapshot

# Check debug sources
curl http://localhost:3000/api/debug/sources
```

## Production Deployment (Vercel)

### 1. Deploy to Vercel

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel
```

### 2. Set Environment Variables

```bash
# Set CRON_SECRET in Vercel
vercel env add CRON_SECRET

# When prompted, paste your secret key and select:
# - Environment: Production, Preview, Development (all)
```

Or via Vercel Dashboard:
1. Go to your project
2. Settings → Environment Variables
3. Add `CRON_SECRET` with your secret value
4. Select all environments (Production, Preview, Development)

### 3. Verify Cron Job Configuration

Check that `vercel.json` is committed:

```bash
cat vercel.json
```

Should contain:
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "* * * * *"
    }
  ]
}
```

### 4. Verify Cron Job in Vercel Dashboard

1. Go to Vercel Dashboard → Your Project
2. Navigate to **Settings** → **Cron Jobs**
3. You should see a cron job:
   - **Path**: `/api/cron/ingest`
   - **Schedule**: Every minute (`* * * * *`)

### 5. Test Production Endpoint

```bash
# Replace with your production URL
curl -H "x-cron-secret: your-secret-key-here" https://your-app.vercel.app/api/cron/ingest
```

### 6. Monitor Cron Job Execution

1. Go to Vercel Dashboard → Your Project
2. Navigate to **Deployments**
3. Click on latest deployment
4. Check **Functions** tab for cron execution logs
5. Or check **Runtime Logs** for errors

## Verification Checklist

After setup, verify:

- [ ] Database table `market_snapshots` exists
- [ ] Cron endpoint returns 200 with `inserted: 2` (when both sources succeed)
- [ ] Data appears in database after cron runs
- [ ] `/api/marketSnapshot` returns data from DB (not live scraping)
- [ ] `/api/debug/sources` shows `lastIngested` timestamps
- [ ] Vercel Cron job is scheduled (in production)
- [ ] Cron job runs successfully (check logs)

## Troubleshooting

### Cron Endpoint Returns 401

- Check that `CRON_SECRET` is set correctly
- Verify the secret in the request header/query matches the env var
- For Vercel Cron: The endpoint should accept Vercel's authentication automatically

### No Data in Database

1. Check cron endpoint logs:
   ```bash
   vercel logs
   ```

2. Test adapters manually (in Node.js REPL or script):
   ```javascript
   import { fetchIsagha, fetchGoldBillion } from './lib/ingestion-adapters';
   const result = await fetchIsagha();
   console.log(result);
   ```

3. Check for parsing errors:
   ```bash
   sqlite3 db/egyptgold.db "SELECT source, error FROM market_snapshots WHERE error IS NOT NULL ORDER BY createdAt DESC LIMIT 10;"
   ```

### Stale Data Warning

If `referenceUnavailable=true`:
- Check last ingestion time: Should be < 10 minutes ago
- Verify cron job is running
- Check for errors in latest snapshots

### Deduplication Issues

If you see duplicate snapshots with same data:
- Check `rawHash` field values
- Verify hash generation is working correctly
- Adjust duplicate window (currently 5 minutes) if needed

## Notes

- **Database**: SQLite is used by default. For production with high traffic, consider PostgreSQL.
- **Cron Frequency**: Currently set to every 1 minute. Adjust in `vercel.json` if needed.
- **Deduplication**: Snapshots with the same `rawHash` within 5 minutes are skipped.
- **Error Handling**: Failed fetches are still recorded in DB with error messages for debugging.



