# Multi-Country + Multi-Currency Implementation Summary

## SQL Migration Script

Run this in Supabase SQL Editor:

```sql
-- Migration: Multi-Country + Multi-Currency Support
-- Creates normalized schema for market snapshots supporting multiple countries
-- Does NOT drop existing market_snapshots table (keeps wide schema for backward compatibility)

-- Create normalized market snapshots table
CREATE TABLE IF NOT EXISTS public.market_snapshots_norm (
  id BIGSERIAL PRIMARY KEY,
  country TEXT NOT NULL CHECK (country IN ('EG','AE','SA','US')),
  market TEXT NOT NULL DEFAULT 'local',
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('EGP','USD','AED','SAR')),
  source TEXT NOT NULL,
  trusted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_hash TEXT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_market_snapshots_norm_country_karat_created_at 
  ON public.market_snapshots_norm(country, karat, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_norm_country_created_at 
  ON public.market_snapshots_norm(country, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_norm_raw_hash 
  ON public.market_snapshots_norm(raw_hash) 
  WHERE raw_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_snapshots_norm_source 
  ON public.market_snapshots_norm(source, created_at DESC);

-- Update source_staleness table to support country (keep existing if possible, add country if missing)
-- Check if country column exists, if not add it
DO $$ 
BEGIN
  -- Check if country column exists in source_staleness
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'country'
  ) THEN
    -- Add country column if it doesn't exist
    ALTER TABLE public.source_staleness 
    ADD COLUMN country TEXT NOT NULL DEFAULT 'EG' CHECK (country IN ('EG','AE','SA','US'));
    
    -- Update unique constraint to include country
    -- First drop existing unique constraint if it exists
    ALTER TABLE public.source_staleness 
    DROP CONSTRAINT IF EXISTS source_staleness_source_karat_key;
    
    -- Add new unique constraint with country
    ALTER TABLE public.source_staleness
    ADD CONSTRAINT source_staleness_country_source_karat_key 
    UNIQUE (country, source, karat);
    
    -- Add index for country
    CREATE INDEX IF NOT EXISTS idx_source_staleness_country 
    ON public.source_staleness(country, source, karat);
  ELSE
    -- Country column exists, just ensure constraint is correct
    ALTER TABLE public.source_staleness
    DROP CONSTRAINT IF EXISTS source_staleness_source_karat_key;
    
    ALTER TABLE public.source_staleness
    ADD CONSTRAINT source_staleness_country_source_karat_key 
    UNIQUE (country, source, karat);
  END IF;
END $$;

-- Ensure source_staleness has correct structure
DO $$
BEGIN
  -- Rename lastOkTimestamp to last_ok_timestamp if it exists with wrong name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'lastOkTimestamp'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'last_ok_timestamp'
  ) THEN
    ALTER TABLE public.source_staleness 
    RENAME COLUMN "lastOkTimestamp" TO last_ok_timestamp;
  END IF;
  
  -- Rename lastOkBuy to last_ok_price if it exists with wrong name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'lastOkBuy'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'last_ok_price'
  ) THEN
    ALTER TABLE public.source_staleness 
    RENAME COLUMN "lastOkBuy" TO last_ok_price;
  END IF;
  
  -- Ensure last_ok_timestamp is timestamptz
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'last_ok_timestamp'
    AND data_type != 'timestamp with time zone'
  ) THEN
    -- Convert bigint to timestamptz if needed
    ALTER TABLE public.source_staleness 
    ALTER COLUMN last_ok_timestamp TYPE TIMESTAMPTZ 
    USING CASE 
      WHEN last_ok_timestamp::text ~ '^[0-9]+$' 
      THEN to_timestamp(last_ok_timestamp::bigint / 1000) 
      ELSE last_ok_timestamp::timestamptz 
    END;
  END IF;
END $$;

-- Ensure source_staleness table structure matches expected schema
DO $$
BEGIN
  -- Create source_staleness if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness'
  ) THEN
    CREATE TABLE public.source_staleness (
      id BIGSERIAL PRIMARY KEY,
      country TEXT NOT NULL DEFAULT 'EG' CHECK (country IN ('EG','AE','SA','US')),
      source TEXT NOT NULL,
      karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
      last_ok_timestamp TIMESTAMPTZ NOT NULL,
      last_ok_price NUMERIC NOT NULL,
      CONSTRAINT source_staleness_country_source_karat_key UNIQUE (country, source, karat)
    );
    
    CREATE INDEX IF NOT EXISTS idx_source_staleness_country 
    ON public.source_staleness(country, source, karat);
  END IF;
END $$;
```

## Files Changed

1. **`supabase/migrations/0004_multicountry_normalized_schema.sql`** (NEW)
   - SQL migration script for normalized multi-country schema
   - Creates `market_snapshots_norm` table
   - Updates `source_staleness` to support country

2. **`lib/fx-multi.ts`** (NEW)
   - Multi-currency FX fetching from open.er-api.com
   - Currency conversion helper using USD as pivot
   - Country-to-currency mapping

3. **`components/CountryCurrencySelector.tsx`** (NEW)
   - Country and currency dropdowns
   - URL params synchronization
   - RTL support

4. **`app/page.tsx`** (MODIFIED)
   - Added CountryCurrencySelector to header
   - URL params handling for country/currency
   - Updated fetchSnapshot to include params
   - Added Suspense wrapper for useSearchParams

5. **`lib/supabase/writeMarketSnapshotNorm.ts`** (NEW)
   - Write function for normalized schema
   - One row per karat with country/currency

6. **`lib/supabase/queries-norm.ts`** (NEW)
   - Query helpers for normalized schema
   - Country-aware queries
   - Median calculation per country

7. **`lib/supabase/sourceStaleness.ts`** (MODIFIED)
   - Added country parameter to all functions
   - Updated to use `last_ok_timestamp` (timestamptz) and `last_ok_price`
   - Unique constraint now includes country

8. **`lib/gold-ingestion-engine.ts`** (MODIFIED)
   - Writes to both wide and normalized schemas (backward compatibility)
   - Only writes for EG (Egypt) currently - other countries stubbed
   - Updated staleness tracking with country parameter

9. **`app/api/marketSnapshot/route.ts`** (MODIFIED)
   - Accepts `country` and `currency` query params
   - Uses normalized queries
   - Currency conversion (canonical to requested)
   - Returns both canonical and converted prices

## Verification Commands

```bash
# Health check
curl http://localhost:3000/api/supabase/health

# Debug count (check normalized table)
curl http://localhost:3000/api/supabase/debug-count

# Market snapshot for Egypt (EGP)
curl "http://localhost:3000/api/marketSnapshot?country=EG&currency=EGP"

# Market snapshot for Egypt (USD)
curl "http://localhost:3000/api/marketSnapshot?country=EG&currency=USD"

# Market snapshot for UAE (AED)
curl "http://localhost:3000/api/marketSnapshot?country=AE&currency=AED"

# Market snapshot for UAE (USD)
curl "http://localhost:3000/api/marketSnapshot?country=AE&currency=USD"

# Market snapshot for Saudi (SAR)
curl "http://localhost:3000/api/marketSnapshot?country=SA&currency=SAR"

# Market snapshot for USA (USD)
curl "http://localhost:3000/api/marketSnapshot?country=US&currency=USD"
```

## Testing Checklist

- [ ] Run SQL migration in Supabase
- [ ] Verify `market_snapshots_norm` table exists
- [ ] Verify `source_staleness` has country column
- [ ] Test ingestion writes to normalized table (EG only)
- [ ] Test API with different country/currency combinations
- [ ] Verify currency conversion works (e.g., EG in USD)
- [ ] Verify UI dropdowns update URL params
- [ ] Verify data refreshes when country/currency changes
- [ ] Verify backward compatibility (wide schema still works)

## Notes

- **Backward Compatibility**: Both wide and normalized schemas are written during ingestion
- **Current Limitation**: Only Egypt (EG) has actual data ingestion - other countries return empty data
- **Currency Conversion**: Uses USD as pivot currency (EGP↔USD↔AED↔SAR)
- **Canonical Currency**: Each country has a canonical currency (EG→EGP, AE→AED, SA→SAR, US→USD)
- **UI Labels**: Still shows "Egypt Market" in some places - can be updated to use selected country

