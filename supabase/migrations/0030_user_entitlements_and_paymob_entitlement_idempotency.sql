-- Migration: User Entitlements + Paymob entitlement idempotency
-- Idempotent SQL script for Supabase

-- ============================================
-- 1) user_entitlements (source of truth for premium)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  premium_until TIMESTAMPTZ NULL, -- NULL can represent lifetime premium
  plan TEXT NULL CHECK (plan IN ('premium_monthly','premium_yearly')),
  last_merchant_order_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_premium_until ON public.user_entitlements(premium_until DESC);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_is_premium ON public.user_entitlements(is_premium);

-- updated_at trigger (uses existing function update_updated_at_column())
DROP TRIGGER IF EXISTS update_user_entitlements_updated_at ON public.user_entitlements;
CREATE TRIGGER update_user_entitlements_updated_at
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- Users can view their own entitlements
DROP POLICY IF EXISTS "Users can view own user_entitlements" ON public.user_entitlements;
CREATE POLICY "Users can view own user_entitlements"
  ON public.user_entitlements
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all entitlements
DROP POLICY IF EXISTS "Admins can view all user_entitlements" ON public.user_entitlements;
CREATE POLICY "Admins can view all user_entitlements"
  ON public.user_entitlements
  FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Service role insert/update (service role bypasses RLS; keep explicit policies for clarity)
DROP POLICY IF EXISTS "Service role can insert user_entitlements" ON public.user_entitlements;
CREATE POLICY "Service role can insert user_entitlements"
  ON public.user_entitlements
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update user_entitlements" ON public.user_entitlements;
CREATE POLICY "Service role can update user_entitlements"
  ON public.user_entitlements
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2) paymob_orders: idempotency for entitlement grant
-- ============================================
ALTER TABLE public.paymob_orders
  ADD COLUMN IF NOT EXISTS entitlement_applied_at TIMESTAMPTZ NULL;

ALTER TABLE public.paymob_orders
  ADD COLUMN IF NOT EXISTS entitlement_applied_until TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.paymob_orders.entitlement_applied_at IS 'When Premium entitlement was applied for this order (idempotency guard)';
COMMENT ON COLUMN public.paymob_orders.entitlement_applied_until IS 'Premium until computed/applied for this order (audit)';

