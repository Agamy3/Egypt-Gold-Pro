-- Migration: Price Change Notifications System v2
-- Creates tables for push subscriptions, price change state, user watchlists, custom price alert rules, and delivery logs

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
      created_at timestamptz NOT NULL DEFAULT now()
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
      PRIMARY KEY (country, karat)
    );

    CREATE INDEX idx_price_change_state_country ON public.price_change_state(country);
    CREATE INDEX idx_price_change_state_updated ON public.price_change_state(last_notified_at DESC);
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
      UNIQUE(user_id, country)
    );

    CREATE INDEX idx_user_country_watchlist_user_id ON public.user_country_watchlist(user_id);
    CREATE INDEX idx_user_country_watchlist_country ON public.user_country_watchlist(country);
    CREATE INDEX idx_user_country_watchlist_enabled ON public.user_country_watchlist(user_id, enabled) WHERE enabled = true;
  END IF;
END $$;

-- ============================================
-- 4. User Price Alert Rules Table
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_price_alert_rules'
  ) THEN
    CREATE TABLE public.user_price_alert_rules (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      country text NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      karat int NOT NULL CHECK (karat IN (14, 18, 21, 22, 24)),
      direction text NOT NULL CHECK (direction IN ('above', 'below')),
      threshold_price numeric NOT NULL CHECK (threshold_price > 0),
      currency text NOT NULL CHECK (currency IN ('EGP', 'USD', 'AED', 'SAR')),
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_user_price_alert_rules_user_id ON public.user_price_alert_rules(user_id);
    CREATE INDEX idx_user_price_alert_rules_country_karat ON public.user_price_alert_rules(country, karat);
    CREATE INDEX idx_user_price_alert_rules_enabled ON public.user_price_alert_rules(user_id, enabled) WHERE enabled = true;
  END IF;
END $$;

-- ============================================
-- 5. User Rule State Table (for cooldown/reset tracking)
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_rule_state'
  ) THEN
    CREATE TABLE public.user_rule_state (
      rule_id bigint PRIMARY KEY REFERENCES public.user_price_alert_rules(id) ON DELETE CASCADE,
      last_triggered_at timestamptz NOT NULL DEFAULT now(),
      last_triggered_price numeric NOT NULL
    );

    CREATE INDEX idx_user_rule_state_rule_id ON public.user_rule_state(rule_id);
  END IF;
END $$;

-- ============================================
-- 6. Notification Deliveries Log Table
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
      created_at timestamptz NOT NULL DEFAULT now(),
      channel text NOT NULL CHECK (channel IN ('push', 'email')),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      country text NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      karat int NOT NULL CHECK (karat IN (14, 18, 21, 22, 24)),
      direction text NOT NULL CHECK (direction IN ('UP', 'DOWN')),
      pct_change numeric NOT NULL,
      price numeric NOT NULL,
      currency text NOT NULL CHECK (currency IN ('EGP', 'USD', 'AED', 'SAR')),
      payload jsonb,
      status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
      error text
    );

    CREATE INDEX idx_notification_deliveries_log_user_id ON public.notification_deliveries_log(user_id);
    CREATE INDEX idx_notification_deliveries_log_country_karat ON public.notification_deliveries_log(country, karat);
    CREATE INDEX idx_notification_deliveries_log_created_at ON public.notification_deliveries_log(created_at DESC);
    CREATE INDEX idx_notification_deliveries_log_status ON public.notification_deliveries_log(status);
  END IF;
END $$;

-- ============================================
-- 7. RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_country_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_price_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries_log ENABLE ROW LEVEL SECURITY;

-- push_subscriptions policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
  DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
  DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;

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
  DROP POLICY IF EXISTS "Users can view their own watchlist" ON public.user_country_watchlist;
  DROP POLICY IF EXISTS "Users can manage their own watchlist" ON public.user_country_watchlist;

  CREATE POLICY "Users can view their own watchlist"
    ON public.user_country_watchlist FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can manage their own watchlist"
    ON public.user_country_watchlist FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;

-- user_price_alert_rules policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own price alert rules" ON public.user_price_alert_rules;
  DROP POLICY IF EXISTS "Users can manage their own price alert rules" ON public.user_price_alert_rules;

  CREATE POLICY "Users can view their own price alert rules"
    ON public.user_price_alert_rules FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can manage their own price alert rules"
    ON public.user_price_alert_rules FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;

-- notification_deliveries_log policies (users can view their own)
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own delivery logs" ON public.notification_deliveries_log;

  CREATE POLICY "Users can view their own delivery logs"
    ON public.notification_deliveries_log FOR SELECT
    USING (auth.uid() = user_id);
END $$;

-- price_change_state and user_rule_state are service-role only (no RLS)
-- They are managed by cron jobs using service role key

