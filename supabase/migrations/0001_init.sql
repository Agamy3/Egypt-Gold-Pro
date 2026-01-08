-- Supabase Migration: Initialize EgyptGold Pro Tables
-- This migration creates the core tables matching SQLite schema

-- Enable UUID extension (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: gold_spot
-- Stores global gold spot prices (XAU/USD)
CREATE TABLE IF NOT EXISTS public.gold_spot (
  id BIGSERIAL PRIMARY KEY,
  xau_spot_usd_oz DOUBLE PRECISION NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  stale BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'GoldAPI',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for gold_spot
CREATE INDEX IF NOT EXISTS idx_gold_spot_fetched_at ON public.gold_spot(fetched_at);

-- Table: source_staleness
-- Tracks staleness per source and karat
CREATE TABLE IF NOT EXISTS public.source_staleness (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  karat INTEGER NOT NULL,
  last_ok_timestamp TIMESTAMPTZ NOT NULL,
  last_ok_buy DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, karat)
);

-- Table: market_snapshots
-- Main table for Egypt market price snapshots (normalized schema: one row per source/karat)
CREATE TABLE IF NOT EXISTS public.market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'EG',
  karat INTEGER NOT NULL,
  price_egp DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL,
  trusted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  raw_hash TEXT
);

-- Add CHECK constraint for market_snapshots.source and karat
ALTER TABLE public.market_snapshots 
ADD CONSTRAINT check_market_snapshots_source 
CHECK (source IN (
  'isagha', 
  'goldbillion', 
  'goldbullioneg', 
  'egypt_web_aggregate',
  'banklive',
  'gold_era',
  'dokangold',
  'livepriceofgold',
  'goldrate24',
  'rapidapi_egypt_gold_data'
));

ALTER TABLE public.market_snapshots
ADD CONSTRAINT check_market_snapshots_karat
CHECK (karat IN (14, 18, 21, 24));

-- Indexes for market_snapshots
CREATE INDEX IF NOT EXISTS idx_market_snapshots_source_created_at ON public.market_snapshots(source, created_at);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_karat_created_at ON public.market_snapshots(market, karat, created_at);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_created_at ON public.market_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_trusted ON public.market_snapshots(trusted);

-- Table: egypt_market (legacy)
-- Legacy table for Egypt market data
CREATE TABLE IF NOT EXISTS public.egypt_market (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  market_21_buy DOUBLE PRECISION,
  market_21_sell DOUBLE PRECISION,
  market_24_buy DOUBLE PRECISION,
  market_24_sell DOUBLE PRECISION,
  fetched_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  raw_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for egypt_market
CREATE INDEX IF NOT EXISTS idx_egypt_market_source_fetched_at ON public.egypt_market(source, fetched_at);

-- Add CHECK constraint for market_snapshots.source (matching SQLite)
ALTER TABLE public.market_snapshots 
ADD CONSTRAINT check_market_snapshots_source 
CHECK (source IN (
  'isagha', 
  'goldbillion', 
  'goldbullioneg', 
  'egypt_web_aggregate',
  'banklive',
  'gold_era',
  'dokangold',
  'livepriceofgold',
  'goldrate24',
  'rapidapi_egypt_gold_data'
));

