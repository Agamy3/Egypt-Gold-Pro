-- Migration: Add 'aggregated' source to market_snapshots check constraint
-- This allows writing aggregated weighted average snapshots

-- First, drop the existing constraint
ALTER TABLE public.market_snapshots 
DROP CONSTRAINT IF EXISTS market_snapshots_source_chk;

-- Recreate the constraint with 'aggregated' added
ALTER TABLE public.market_snapshots
ADD CONSTRAINT market_snapshots_source_chk 
CHECK (source IN (
  'banklive',
  'dokangold',
  'gold_era',
  'goldbillion',
  'goldbullioneg',
  'goldrate24',
  'isagha',
  'livepriceofgold',
  'aggregated'
));

