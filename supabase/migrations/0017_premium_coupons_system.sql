-- Migration: Premium Features + Coupons System
-- Idempotent SQL script for Supabase
-- Adds entitlements, premium_expires_at to user_profiles
-- Creates coupons and coupon_redemptions tables

DO $$ 
BEGIN
  -- Add entitlements column to user_profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'entitlements'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN entitlements JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Add premium_expires_at column to user_profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'premium_expires_at'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN premium_expires_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- Create coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_redemptions INT NULL,
  redemption_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT NULL,
  effect JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Create coupon_redemptions table
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  coupon_id BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(coupon_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(active);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user_id ON public.coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_id ON public.coupon_redemptions(coupon_id);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coupons (no public read, admin-only via service role)
DROP POLICY IF EXISTS "Coupons are admin-only" ON public.coupons;
CREATE POLICY "Coupons are admin-only"
  ON public.coupons
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- RLS Policies for coupon_redemptions (users can read their own, admin via service role)
DROP POLICY IF EXISTS "Users can read own redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users can read own redemptions"
  ON public.coupon_redemptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add comments
COMMENT ON COLUMN public.user_profiles.entitlements IS 'JSONB object with premium feature flags (ad_free, premium_macro_explanations, etc.)';
COMMENT ON COLUMN public.user_profiles.premium_expires_at IS 'When premium subscription expires (NULL = no expiration)';
COMMENT ON TABLE public.coupons IS 'Coupon codes for premium subscriptions and entitlements';
COMMENT ON TABLE public.coupon_redemptions IS 'Tracks which users redeemed which coupons';

