-- Migration: User Gold Holdings / Portfolio
-- Idempotent SQL script for Supabase
-- Run in Supabase SQL Editor

-- ============================================
-- USER GOLD HOLDINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_gold_holdings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country TEXT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  grams NUMERIC NOT NULL CHECK (grams > 0),
  purchase_price_per_gram NUMERIC NOT NULL CHECK (purchase_price_per_gram > 0),
  purchase_currency TEXT NOT NULL CHECK (purchase_currency IN ('EGP', 'USD', 'AED', 'SAR')),
  purchased_at DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_gold_holdings_user_id_karat ON public.user_gold_holdings(user_id, karat);
CREATE INDEX IF NOT EXISTS idx_user_gold_holdings_user_id_created_at ON public.user_gold_holdings(user_id, created_at DESC);

-- Updated_at trigger function (reuse existing if available, otherwise create)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_user_gold_holdings_updated_at ON public.user_gold_holdings;
CREATE TRIGGER update_user_gold_holdings_updated_at
  BEFORE UPDATE ON public.user_gold_holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.user_gold_holdings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can view own holdings"
  ON public.user_gold_holdings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can insert own holdings"
  ON public.user_gold_holdings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can update own holdings"
  ON public.user_gold_holdings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can delete own holdings"
  ON public.user_gold_holdings
  FOR DELETE
  USING (auth.uid() = user_id);

