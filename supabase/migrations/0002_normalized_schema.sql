-- Migration: Create normalized market_snapshots schema
-- Run this in Supabase Dashboard → SQL Editor

-- Step A: Rename existing table to legacy (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'market_snapshots') THEN
    ALTER TABLE public.market_snapshots RENAME TO market_snapshots_legacy;
    RAISE NOTICE 'Renamed existing market_snapshots to market_snapshots_legacy';
  ELSE
    RAISE NOTICE 'No existing market_snapshots table found, skipping rename';
  END IF;
END $$;

-- Step B: Create NEW normalized market_snapshots table
CREATE TABLE IF NOT EXISTS public.market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  price_egp NUMERIC NOT NULL,
  source TEXT NOT NULL,
  trusted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_hash TEXT
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_karat_created_at 
  ON public.market_snapshots(market, karat, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_created_at 
  ON public.market_snapshots(market, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_source_created_at 
  ON public.market_snapshots(source, created_at DESC);

-- Optional: Unique index to reduce duplicates (only when raw_hash is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_snapshots_unique_hash 
  ON public.market_snapshots(market, karat, source, created_at, raw_hash) 
  WHERE raw_hash IS NOT NULL;

-- Step C: Create source_staleness table
CREATE TABLE IF NOT EXISTS public.source_staleness (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  karat INTEGER NOT NULL,
  last_ok_timestamp TIMESTAMPTZ NOT NULL,
  last_ok_buy NUMERIC NOT NULL,
  UNIQUE(source, karat)
);

-- Create index for source_staleness
CREATE INDEX IF NOT EXISTS idx_source_staleness_source_karat 
  ON public.source_staleness(source, karat);

-- Step D: Create gold_spot table (for caching global gold spot prices)
CREATE TABLE IF NOT EXISTS public.gold_spot (
  id BIGSERIAL PRIMARY KEY,
  xau_spot_usd_oz NUMERIC NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create indexes for gold_spot
CREATE INDEX IF NOT EXISTS idx_gold_spot_fetched_at 
  ON public.gold_spot(fetched_at DESC);

