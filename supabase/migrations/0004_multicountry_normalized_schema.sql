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
DECLARE
  col_exists BOOLEAN;
  current_type TEXT;
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
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'source_staleness' 
    AND column_name = 'last_ok_timestamp'
  ) INTO col_exists;
  
  IF col_exists THEN
    -- Get current data type
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'source_staleness'
    AND column_name = 'last_ok_timestamp';
    
    -- Convert bigint (epoch ms) to timestamptz if needed
    IF current_type = 'bigint' THEN
      ALTER TABLE public.source_staleness 
      ALTER COLUMN last_ok_timestamp TYPE TIMESTAMPTZ 
      USING to_timestamp(last_ok_timestamp::numeric / 1000.0);
    ELSIF current_type != 'timestamp with time zone' THEN
      -- For other types (text, timestamp without time zone, etc.), try to convert
      BEGIN
        ALTER TABLE public.source_staleness 
        ALTER COLUMN last_ok_timestamp TYPE TIMESTAMPTZ 
        USING last_ok_timestamp::timestamptz;
      EXCEPTION
        WHEN OTHERS THEN
          -- If conversion fails, log but don't fail migration
          RAISE NOTICE 'Could not convert last_ok_timestamp from % to timestamptz: %', current_type, SQLERRM;
      END;
    END IF;
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

