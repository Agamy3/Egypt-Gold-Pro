-- Migration: Geidea billing support (minimal extension of Paymob tables)
-- Idempotent SQL script for Supabase

-- ============================================
-- 1) paymob_orders: add provider + geidea identifiers
-- ============================================
ALTER TABLE public.paymob_orders
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paymob' CHECK (provider IN ('paymob','geidea'));

ALTER TABLE public.paymob_orders
  ADD COLUMN IF NOT EXISTS geidea_session_id TEXT NULL;

ALTER TABLE public.paymob_orders
  ADD COLUMN IF NOT EXISTS geidea_order_id TEXT NULL;

ALTER TABLE public.paymob_orders
  ADD COLUMN IF NOT EXISTS geidea_status TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_paymob_orders_provider_created_at
  ON public.paymob_orders(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paymob_orders_geidea_session_id
  ON public.paymob_orders(geidea_session_id)
  WHERE geidea_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paymob_orders_geidea_order_id
  ON public.paymob_orders(geidea_order_id)
  WHERE geidea_order_id IS NOT NULL;

-- ============================================
-- 2) paymob_webhook_events: add provider + geidea identifiers
-- ============================================
ALTER TABLE public.paymob_webhook_events
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paymob' CHECK (provider IN ('paymob','geidea'));

ALTER TABLE public.paymob_webhook_events
  ADD COLUMN IF NOT EXISTS geidea_order_id TEXT NULL;

ALTER TABLE public.paymob_webhook_events
  ADD COLUMN IF NOT EXISTS geidea_status TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_paymob_webhook_events_provider_created_at
  ON public.paymob_webhook_events(provider, created_at DESC);

-- Idempotency: one callback per Geidea order id (best-effort)
CREATE UNIQUE INDEX IF NOT EXISTS ux_paymob_webhook_events_geidea_order_id
  ON public.paymob_webhook_events(geidea_order_id)
  WHERE provider = 'geidea' AND geidea_order_id IS NOT NULL;
