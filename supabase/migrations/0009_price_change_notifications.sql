-- Migration: Price Change Notifications System
-- Creates tables for push subscriptions, price change state, user watchlists, and delivery logs

-- ============================================
-- 1. Push Subscriptions Table
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'push_subscriptions'
  ) THEN
    CREATE TABLE public.push_subscriptions (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      content_encoding text DEFAULT 'aes128gcm',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
    CREATE INDEX idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);
  END IF;
END $$;

-- ============================================
-- 2. Price Change State Table
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'price_change_state'
  ) THEN
    CREATE TABLE public.price_change_state (
      country text NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      karat int NOT NULL CHECK (karat IN (14, 18, 21, 22, 24)),
      last_price numeric NOT NULL,
      last_notified_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (country, karat)
    );

    CREATE INDEX idx_price_change_state_country ON public.price_change_state(country);
    CREATE INDEX idx_price_change_state_updated ON public.price_change_state(updated_at DESC);
  END IF;
END $$;

-- ============================================
-- 3. User Country Watchlist Table
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_country_watchlist'
  ) THEN
    CREATE TABLE public.user_country_watchlist (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      country text NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, country)
    );

    CREATE INDEX idx_user_country_watchlist_user_id ON public.user_country_watchlist(user_id);
    CREATE INDEX idx_user_country_watchlist_country ON public.user_country_watchlist(country);
    CREATE INDEX idx_user_country_watchlist_enabled ON public.user_country_watchlist(user_id, enabled) WHERE enabled = true;
  END IF;
END $$;

-- ============================================
-- 4. Notification Deliveries Log Table
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_deliveries_log'
  ) THEN
    CREATE TABLE public.notification_deliveries_log (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      country text NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      karat int NOT NULL CHECK (karat IN (14, 18, 21, 22, 24)),
      channel text NOT NULL CHECK (channel IN ('email', 'push')),
      status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
      price_change_pct numeric NOT NULL,
      old_price numeric NOT NULL,
      new_price numeric NOT NULL,
      direction text NOT NULL CHECK (direction IN ('UP', 'DOWN')),
      payload jsonb,
      error text,
      sent_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_notification_deliveries_log_user_id ON public.notification_deliveries_log(user_id);
    CREATE INDEX idx_notification_deliveries_log_country_karat ON public.notification_deliveries_log(country, karat);
    CREATE INDEX idx_notification_deliveries_log_sent_at ON public.notification_deliveries_log(sent_at DESC);
    CREATE INDEX idx_notification_deliveries_log_status ON public.notification_deliveries_log(status);
  END IF;
END $$;

-- ============================================
-- 5. Updated_at Trigger Function (if not exists)
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $set_updated_at$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $set_updated_at$ LANGUAGE plpgsql;
  END IF;
END $$;

-- ============================================
-- 6. Updated_at Triggers
-- ============================================
DO $$ 
BEGIN
  -- push_subscriptions
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_push_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER trigger_push_subscriptions_updated_at
      BEFORE UPDATE ON public.push_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  -- price_change_state
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_price_change_state_updated_at'
  ) THEN
    CREATE TRIGGER trigger_price_change_state_updated_at
      BEFORE UPDATE ON public.price_change_state
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  -- user_country_watchlist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_user_country_watchlist_updated_at'
  ) THEN
    CREATE TRIGGER trigger_user_country_watchlist_updated_at
      BEFORE UPDATE ON public.user_country_watchlist
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================
-- 7. RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_country_watchlist ENABLE ROW LEVEL SECURITY;

-- push_subscriptions policies
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
  DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
  DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;

  -- Create policies
  CREATE POLICY "Users can view their own push subscriptions"
    ON public.push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert their own push subscriptions"
    ON public.push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own push subscriptions"
    ON public.push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);
END $$;

-- user_country_watchlist policies
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view their own watchlist" ON public.user_country_watchlist;
  DROP POLICY IF EXISTS "Users can manage their own watchlist" ON public.user_country_watchlist;

  -- Create policies
  CREATE POLICY "Users can view their own watchlist"
    ON public.user_country_watchlist FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can manage their own watchlist"
    ON public.user_country_watchlist FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;

-- price_change_state and notification_deliveries_log are service-role only (no RLS)
-- They are managed by cron jobs using service role key

