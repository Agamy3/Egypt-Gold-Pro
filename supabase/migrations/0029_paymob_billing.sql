-- Migration: Paymob Billing (Orders + Webhook Events)
-- Idempotent SQL script for Supabase

-- ============================================
-- 1) paymob_orders
-- ============================================
CREATE TABLE IF NOT EXISTS public.paymob_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('premium_monthly', 'premium_yearly')),
  amount_egp NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','pending','paid','failed','canceled')),
  paymob_order_id TEXT NULL,
  paymob_payment_key TEXT NULL, -- store server-side only; never return or log
  merchant_order_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_order_id)
);

CREATE INDEX IF NOT EXISTS idx_paymob_orders_user_created_at ON public.paymob_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paymob_orders_status_created_at ON public.paymob_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paymob_orders_paymob_order_id ON public.paymob_orders(paymob_order_id);

-- updated_at trigger (uses existing function update_updated_at_column())
DROP TRIGGER IF EXISTS update_paymob_orders_updated_at ON public.paymob_orders;
CREATE TRIGGER update_paymob_orders_updated_at
  BEFORE UPDATE ON public.paymob_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.paymob_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
DROP POLICY IF EXISTS "Users can view own paymob_orders" ON public.paymob_orders;
CREATE POLICY "Users can view own paymob_orders"
  ON public.paymob_orders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all orders
DROP POLICY IF EXISTS "Admins can view all paymob_orders" ON public.paymob_orders;
CREATE POLICY "Admins can view all paymob_orders"
  ON public.paymob_orders
  FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Service role can insert/update (cron/webhook). Service role bypasses RLS; keep explicit policies for clarity.
DROP POLICY IF EXISTS "Service role can insert paymob_orders" ON public.paymob_orders;
CREATE POLICY "Service role can insert paymob_orders"
  ON public.paymob_orders
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update paymob_orders" ON public.paymob_orders;
CREATE POLICY "Service role can update paymob_orders"
  ON public.paymob_orders
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2) paymob_webhook_events (idempotency + audit)
-- ============================================
CREATE TABLE IF NOT EXISTS public.paymob_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL DEFAULT 'transaction',
  paymob_transaction_id TEXT NULL,
  paymob_order_id TEXT NULL,
  merchant_order_id TEXT NULL,
  raw JSONB NOT NULL,
  verified_hmac BOOLEAN NOT NULL DEFAULT false,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique transaction id when present
CREATE UNIQUE INDEX IF NOT EXISTS ux_paymob_webhook_events_transaction_id
  ON public.paymob_webhook_events(paymob_transaction_id)
  WHERE paymob_transaction_id IS NOT NULL;

-- Fallback unique tuple (merchant_order_id + paymob_order_id) when both present
CREATE UNIQUE INDEX IF NOT EXISTS ux_paymob_webhook_events_order_tuple
  ON public.paymob_webhook_events(merchant_order_id, paymob_order_id)
  WHERE merchant_order_id IS NOT NULL AND paymob_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paymob_webhook_events_created_at ON public.paymob_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paymob_webhook_events_verified_processed ON public.paymob_webhook_events(verified_hmac, processed);

ALTER TABLE public.paymob_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admins can view webhook events
DROP POLICY IF EXISTS "Admins can view paymob_webhook_events" ON public.paymob_webhook_events;
CREATE POLICY "Admins can view paymob_webhook_events"
  ON public.paymob_webhook_events
  FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Service role can insert/update webhook events
DROP POLICY IF EXISTS "Service role can insert paymob_webhook_events" ON public.paymob_webhook_events;
CREATE POLICY "Service role can insert paymob_webhook_events"
  ON public.paymob_webhook_events
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update paymob_webhook_events" ON public.paymob_webhook_events;
CREATE POLICY "Service role can update paymob_webhook_events"
  ON public.paymob_webhook_events
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

