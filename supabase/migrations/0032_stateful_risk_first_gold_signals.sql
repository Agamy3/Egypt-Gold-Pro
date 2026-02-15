-- Migration: Stateful risk-first gold signals (raw + final) + gold_signal_state table
-- Idempotent SQL for Supabase

-- 1) Extend gold_signals with raw + final fields (non-breaking)
ALTER TABLE public.gold_signals
  ADD COLUMN IF NOT EXISTS raw_action TEXT NULL CHECK (raw_action IN ('BUY','SELL','HOLD'));

ALTER TABLE public.gold_signals
  ADD COLUMN IF NOT EXISTS raw_confidence0to1 NUMERIC NULL CHECK (raw_confidence0to1 >= 0 AND raw_confidence0to1 <= 1);

ALTER TABLE public.gold_signals
  ADD COLUMN IF NOT EXISTS final_action TEXT NOT NULL DEFAULT 'HOLD' CHECK (final_action IN ('BUY','SELL','HOLD'));

ALTER TABLE public.gold_signals
  ADD COLUMN IF NOT EXISTS final_confidence0to1 NUMERIC NOT NULL DEFAULT 0 CHECK (final_confidence0to1 >= 0 AND final_confidence0to1 <= 1);

ALTER TABLE public.gold_signals
  ADD COLUMN IF NOT EXISTS final_changed_at TIMESTAMPTZ NULL;

ALTER TABLE public.gold_signals
  ADD COLUMN IF NOT EXISTS final_change_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_gold_signals_final_action_created_at
  ON public.gold_signals(final_action, created_at DESC);

-- 2) Current state table for final signal (public read)
CREATE TABLE IF NOT EXISTS public.gold_signal_state (
  id BIGSERIAL PRIMARY KEY,
  country TEXT NOT NULL CHECK (country IN ('GLOBAL','EG')),
  asset TEXT NOT NULL DEFAULT 'XAUUSD',
  final_action TEXT NOT NULL CHECK (final_action IN ('BUY','SELL','HOLD')),
  final_confidence0to1 NUMERIC NOT NULL CHECK (final_confidence0to1 >= 0 AND final_confidence0to1 <= 1),
  final_changed_at TIMESTAMPTZ NOT NULL,
  last_cycle_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(country, asset)
);

CREATE INDEX IF NOT EXISTS idx_gold_signal_state_country_asset
  ON public.gold_signal_state(country, asset);

ALTER TABLE public.gold_signal_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read gold_signal_state" ON public.gold_signal_state;
CREATE POLICY "Public can read gold_signal_state"
  ON public.gold_signal_state
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can write gold_signal_state" ON public.gold_signal_state;
CREATE POLICY "Service role can write gold_signal_state"
  ON public.gold_signal_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

