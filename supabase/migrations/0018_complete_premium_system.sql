-- Migration: Complete Premium System
-- Idempotent SQL script for Supabase
-- Adds premium/admin columns, coupons, premium requests, news, macro cache

DO $$ 
BEGIN
  -- Add is_premium column to user_profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'is_premium'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE;
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

  -- Add is_admin column to user_profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Add premium_features column to user_profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'premium_features'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN premium_features JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create coupons table (drop old one if exists with different schema)
DROP TABLE IF EXISTS public.coupon_redemptions CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;

CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  max_redemptions INT NULL,
  redeemed_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grants_premium BOOLEAN NOT NULL DEFAULT TRUE,
  premium_days INT NULL,
  unlock_features JSONB NULL,
  notes JSONB NULL
);

-- Create coupon_redemptions table
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  coupon_id BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(coupon_id, user_id)
);

-- Create premium_requests table
CREATE TABLE IF NOT EXISTS public.premium_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  country TEXT NULL,
  message TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create news_items table
CREATE TABLE IF NOT EXISTS public.news_items (
  id BIGSERIAL PRIMARY KEY,
  country TEXT NOT NULL CHECK (country IN ('EG','AE','SA','US','GLOBAL')),
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  summary TEXT NULL,
  image_url TEXT NULL,
  tags TEXT[] NULL,
  provider TEXT NOT NULL DEFAULT 'gdelt' CHECK (provider IN ('gdelt','rss')),
  provider_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create macro_series_cache table
CREATE TABLE IF NOT EXISTS public.macro_series_cache (
  id BIGSERIAL PRIMARY KEY,
  series_id TEXT NOT NULL,
  value NUMERIC NOT NULL,
  observation_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(series_id, observation_date)
);

-- Create indexes for coupons
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON public.coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user_id ON public.coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_id ON public.coupon_redemptions(coupon_id);

-- Create indexes for premium_requests
CREATE INDEX IF NOT EXISTS idx_premium_requests_user_id ON public.premium_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_premium_requests_email ON public.premium_requests(email);
CREATE INDEX IF NOT EXISTS idx_premium_requests_status ON public.premium_requests(status);

-- Create indexes for news_items
CREATE INDEX IF NOT EXISTS idx_news_items_country_published_at ON public.news_items(country, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_created_at ON public.news_items(created_at DESC);

-- Create indexes for macro_series_cache
CREATE INDEX IF NOT EXISTS idx_macro_series_cache_series_id_date ON public.macro_series_cache(series_id, observation_date DESC);

-- Create updated_at trigger function for premium_requests
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for premium_requests
DROP TRIGGER IF EXISTS set_premium_requests_updated_at ON public.premium_requests;
CREATE TRIGGER set_premium_requests_updated_at
  BEFORE UPDATE ON public.premium_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_series_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coupons (admin-only SELECT, admin-only INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Coupons admin SELECT" ON public.coupons;
CREATE POLICY "Coupons admin SELECT"
  ON public.coupons
  FOR SELECT
  USING (false); -- Only service role via admin APIs

DROP POLICY IF EXISTS "Coupons admin INSERT" ON public.coupons;
CREATE POLICY "Coupons admin INSERT"
  ON public.coupons
  FOR INSERT
  WITH CHECK (false); -- Only service role

DROP POLICY IF EXISTS "Coupons admin UPDATE" ON public.coupons;
CREATE POLICY "Coupons admin UPDATE"
  ON public.coupons
  FOR UPDATE
  USING (false) -- Only service role
  WITH CHECK (false);

DROP POLICY IF EXISTS "Coupons admin DELETE" ON public.coupons;
CREATE POLICY "Coupons admin DELETE"
  ON public.coupons
  FOR DELETE
  USING (false); -- Only service role

-- RLS Policies for coupon_redemptions (users can SELECT their own)
DROP POLICY IF EXISTS "Users can read own redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users can read own redemptions"
  ON public.coupon_redemptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for premium_requests
DROP POLICY IF EXISTS "Users can insert own requests" ON public.premium_requests;
CREATE POLICY "Users can insert own requests"
  ON public.premium_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can read own requests" ON public.premium_requests;
CREATE POLICY "Users can read own requests"
  ON public.premium_requests
  FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- RLS Policies for news_items (public SELECT, service role INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "News items public SELECT" ON public.news_items;
CREATE POLICY "News items public SELECT"
  ON public.news_items
  FOR SELECT
  USING (true);

-- RLS Policies for macro_series_cache (public SELECT, service role INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Macro cache public SELECT" ON public.macro_series_cache;
CREATE POLICY "Macro cache public SELECT"
  ON public.macro_series_cache
  FOR SELECT
  USING (true);

-- Add comments
COMMENT ON COLUMN public.user_profiles.is_premium IS 'Premium subscription status';
COMMENT ON COLUMN public.user_profiles.premium_expires_at IS 'When premium subscription expires (NULL = lifetime)';
COMMENT ON COLUMN public.user_profiles.is_admin IS 'Admin user flag';
COMMENT ON COLUMN public.user_profiles.premium_features IS 'JSONB array of premium feature flags';
COMMENT ON TABLE public.coupons IS 'Coupon codes for premium subscriptions';
COMMENT ON TABLE public.coupon_redemptions IS 'Tracks coupon redemptions by users';
COMMENT ON TABLE public.premium_requests IS 'User requests for premium access';
COMMENT ON TABLE public.news_items IS 'Gold and economic news items';
COMMENT ON TABLE public.macro_series_cache IS 'Cached FRED macro economic data';

-- Optional: Set admin user (update email as needed)
-- UPDATE public.user_profiles SET is_admin=true WHERE email='admin@egyptgoldpro.com';

