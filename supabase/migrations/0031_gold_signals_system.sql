-- Migration: Gold Signals System (BUY/SELL/HOLD) + AI reviews
-- Idempotent SQL script for Supabase

-- ============================================
-- 1) gold_signals (one per country per cycle)
-- ============================================
CREATE TABLE IF NOT EXISTS public.gold_signals (
  id BIGSERIAL PRIMARY KEY,
  cycle_key TEXT NOT NULL, -- e.g. "2026-02-12T12:35:00Z" (floored cycle start)
  cycle_started_at TIMESTAMPTZ NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('GLOBAL','EG')),

  action TEXT NOT NULL CHECK (action IN ('BUY','SELL','HOLD')),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- Inputs (stored for audit + AI prompt)
  xau_usd DOUBLE PRECISION NOT NULL,
  xau_timestamp_ms BIGINT NULL,
  pct_change_5m DOUBLE PRECISION NOT NULL DEFAULT 0,
  volatility_proxy DOUBLE PRECISION NOT NULL DEFAULT 0,
  asia_session BOOLEAN NOT NULL DEFAULT false,
  variance_pct DOUBLE PRECISION NULL, -- only for EG

  -- Outcome tracking (accuracy)
  horizon_minutes INT NOT NULL DEFAULT 30,
  due_at TIMESTAMPTZ NOT NULL,
  validated_at TIMESTAMPTZ NULL,
  xau_usd_exit DOUBLE PRECISION NULL,
  outcome TEXT NULL CHECK (outcome IN ('true','false','tie','na')),
  pnl_bp DOUBLE PRECISION NULL, -- basis points for simple scoring

  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (cycle_key, country)
);

CREATE INDEX IF NOT EXISTS idx_gold_signals_country_cycle_desc
  ON public.gold_signals(country, cycle_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gold_signals_due_at_unvalidated
  ON public.gold_signals(due_at)
  WHERE validated_at IS NULL;

-- updated_at trigger (uses existing function update_updated_at_column())
DROP TRIGGER IF EXISTS update_gold_signals_updated_at ON public.gold_signals;
CREATE TRIGGER update_gold_signals_updated_at
  BEFORE UPDATE ON public.gold_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.gold_signals ENABLE ROW LEVEL SECURITY;

-- Public read: signals are not user-specific
DROP POLICY IF EXISTS "Public can read gold_signals" ON public.gold_signals;
CREATE POLICY "Public can read gold_signals"
  ON public.gold_signals
  FOR SELECT
  USING (true);

-- Service role writes (service role bypasses RLS; keep explicit policies for clarity)
DROP POLICY IF EXISTS "Service role can write gold_signals" ON public.gold_signals;
CREATE POLICY "Service role can write gold_signals"
  ON public.gold_signals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2) gold_signal_ai_reviews (cached per country+cycle)
-- ============================================
CREATE TABLE IF NOT EXISTS public.gold_signal_ai_reviews (
  id BIGSERIAL PRIMARY KEY,
  cycle_key TEXT NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('GLOBAL','EG')),

  algo_action TEXT NOT NULL CHECK (algo_action IN ('BUY','SELL','HOLD')),
  algo_confidence DOUBLE PRECISION NOT NULL CHECK (algo_confidence >= 0 AND algo_confidence <= 1),

  ai_action TEXT NOT NULL CHECK (ai_action IN ('BUY','SELL','HOLD')),
  ai_confidence0to1 DOUBLE PRECISION NOT NULL CHECK (ai_confidence0to1 >= 0 AND ai_confidence0to1 <= 1),
  ai_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  risk_regime TEXT NOT NULL CHECK (risk_regime IN ('calm','elevated','volatile','crisis')),

  decision TEXT NOT NULL CHECK (decision IN ('approved','downgraded_to_hold','overridden','fallback_algo')),
  requested_count INT NOT NULL DEFAULT 1,
  requested_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  raw_prompt JSONB NULL,
  raw_response JSONB NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (cycle_key, country)
);

CREATE INDEX IF NOT EXISTS idx_gold_signal_ai_reviews_created_at_desc
  ON public.gold_signal_ai_reviews(created_at DESC);

DROP TRIGGER IF EXISTS update_gold_signal_ai_reviews_updated_at ON public.gold_signal_ai_reviews;
CREATE TRIGGER update_gold_signal_ai_reviews_updated_at
  BEFORE UPDATE ON public.gold_signal_ai_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.gold_signal_ai_reviews ENABLE ROW LEVEL SECURITY;

-- Admins can read AI reviews
DROP POLICY IF EXISTS "Admins can read gold_signal_ai_reviews" ON public.gold_signal_ai_reviews;
CREATE POLICY "Admins can read gold_signal_ai_reviews"
  ON public.gold_signal_ai_reviews
  FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Service role can insert/update AI reviews
DROP POLICY IF EXISTS "Service role can write gold_signal_ai_reviews" ON public.gold_signal_ai_reviews;
CREATE POLICY "Service role can write gold_signal_ai_reviews"
  ON public.gold_signal_ai_reviews
  FOR ALL
  USING (true)
  WITH CHECK (true);

