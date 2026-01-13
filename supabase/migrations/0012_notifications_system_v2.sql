-- Migration: Complete Notifications System v2
-- Idempotent SQL script for Supabase
-- Run in Supabase SQL Editor

-- ============================================
-- 1. USER PROFILES (extend if exists)
-- ============================================
DO $$ 
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'push_notifications_enabled') THEN
    ALTER TABLE public.user_profiles ADD COLUMN push_notifications_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'email_notifications_enabled') THEN
    ALTER TABLE public.user_profiles ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ============================================
-- 2. USER COUNTRY WATCHLIST
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_country_watchlist'
  ) THEN
    CREATE TABLE public.user_country_watchlist (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      country TEXT NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, country)
    );

    CREATE INDEX idx_user_country_watchlist_user_id ON public.user_country_watchlist(user_id);
    CREATE INDEX idx_user_country_watchlist_country ON public.user_country_watchlist(country);
    CREATE INDEX idx_user_country_watchlist_enabled ON public.user_country_watchlist(user_id, enabled) WHERE enabled = true;

    ALTER TABLE public.user_country_watchlist ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    DROP POLICY IF EXISTS "Users can view own watchlist" ON public.user_country_watchlist;
    CREATE POLICY "Users can view own watchlist"
      ON public.user_country_watchlist FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own watchlist" ON public.user_country_watchlist;
    CREATE POLICY "Users can insert own watchlist"
      ON public.user_country_watchlist FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own watchlist" ON public.user_country_watchlist;
    CREATE POLICY "Users can update own watchlist"
      ON public.user_country_watchlist FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can delete own watchlist" ON public.user_country_watchlist;
    CREATE POLICY "Users can delete own watchlist"
      ON public.user_country_watchlist FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. PUSH SUBSCRIPTIONS
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'push_subscriptions'
  ) THEN
    CREATE TABLE public.push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      content_encoding TEXT DEFAULT 'aes128gcm',
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
    CREATE INDEX idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

    ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
    CREATE POLICY "Users can view own push subscriptions"
      ON public.push_subscriptions FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
    CREATE POLICY "Users can insert own push subscriptions"
      ON public.push_subscriptions FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
    CREATE POLICY "Users can update own push subscriptions"
      ON public.push_subscriptions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
    CREATE POLICY "Users can delete own push subscriptions"
      ON public.push_subscriptions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 4. NOTIFICATION RULES
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_rules'
  ) THEN
    CREATE TABLE public.notification_rules (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('price_move_pct', 'price_threshold_cross', 'portfolio_pl_pct', 'daily_summary', 'weekly_outlook', 'macro_event')),
      country TEXT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      karat INTEGER NULL CHECK (karat IN (14, 18, 21, 24)),
      direction TEXT NULL CHECK (direction IN ('up', 'down', 'above', 'below')),
      threshold_value NUMERIC NULL,
      pct_threshold NUMERIC NULL,
      one_time BOOLEAN NOT NULL DEFAULT false,
      enabled BOOLEAN NOT NULL DEFAULT true,
      channel_inapp BOOLEAN NOT NULL DEFAULT true,
      channel_push BOOLEAN NOT NULL DEFAULT false,
      channel_email BOOLEAN NOT NULL DEFAULT false,
      schedule_cron TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_notification_rules_user_id_enabled ON public.notification_rules(user_id, enabled);
    CREATE INDEX idx_notification_rules_type_enabled ON public.notification_rules(type, enabled);
    CREATE INDEX idx_notification_rules_country_karat_enabled ON public.notification_rules(country, karat, enabled);

    -- Updated_at trigger
    DROP TRIGGER IF EXISTS update_notification_rules_updated_at ON public.notification_rules;
    CREATE TRIGGER update_notification_rules_updated_at
      BEFORE UPDATE ON public.notification_rules
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    DROP POLICY IF EXISTS "Users can view own notification rules" ON public.notification_rules;
    CREATE POLICY "Users can view own notification rules"
      ON public.notification_rules FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own notification rules" ON public.notification_rules;
    CREATE POLICY "Users can insert own notification rules"
      ON public.notification_rules FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own notification rules" ON public.notification_rules;
    CREATE POLICY "Users can update own notification rules"
      ON public.notification_rules FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can delete own notification rules" ON public.notification_rules;
    CREATE POLICY "Users can delete own notification rules"
      ON public.notification_rules FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 5. IN-APP NOTIFICATIONS
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'in_app_notifications'
  ) THEN
    CREATE TABLE public.in_app_notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      country TEXT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT NULL,
      kind TEXT NOT NULL DEFAULT 'alert' CHECK (kind IN ('alert', 'summary', 'macro')),
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_in_app_notifications_user_id_created_at ON public.in_app_notifications(user_id, created_at DESC);
    CREATE INDEX idx_in_app_notifications_user_id_read ON public.in_app_notifications(user_id, read);

    ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    DROP POLICY IF EXISTS "Users can view own in-app notifications" ON public.in_app_notifications;
    CREATE POLICY "Users can view own in-app notifications"
      ON public.in_app_notifications FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own in-app notifications" ON public.in_app_notifications;
    CREATE POLICY "Users can update own in-app notifications"
      ON public.in_app_notifications FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    -- Service role can insert (for cron jobs)
    DROP POLICY IF EXISTS "Service role can insert in-app notifications" ON public.in_app_notifications;
    CREATE POLICY "Service role can insert in-app notifications"
      ON public.in_app_notifications FOR INSERT
      WITH CHECK (true); -- Service role bypasses RLS
  END IF;
END $$;

-- ============================================
-- 6. NOTIFICATION DELIVERIES LOG
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_deliveries_log'
  ) THEN
    CREATE TABLE public.notification_deliveries_log (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      rule_id BIGINT NULL REFERENCES public.notification_rules(id) ON DELETE SET NULL,
      channel TEXT NOT NULL CHECK (channel IN ('inapp', 'push', 'email')),
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
      payload JSONB NULL,
      error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_notification_deliveries_log_user_id ON public.notification_deliveries_log(user_id);
    CREATE INDEX idx_notification_deliveries_log_rule_id ON public.notification_deliveries_log(rule_id);
    CREATE INDEX idx_notification_deliveries_log_created_at ON public.notification_deliveries_log(created_at DESC);

    ALTER TABLE public.notification_deliveries_log ENABLE ROW LEVEL SECURITY;

    -- RLS Policies (users can read their own logs)
    DROP POLICY IF EXISTS "Users can view own delivery logs" ON public.notification_deliveries_log;
    CREATE POLICY "Users can view own delivery logs"
      ON public.notification_deliveries_log FOR SELECT
      USING (auth.uid() = user_id);

    -- Service role can insert
    DROP POLICY IF EXISTS "Service role can insert delivery logs" ON public.notification_deliveries_log;
    CREATE POLICY "Service role can insert delivery logs"
      ON public.notification_deliveries_log FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- 7. NOTIFICATION STATE (for cooldowns/crossing)
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_state'
  ) THEN
    CREATE TABLE public.notification_state (
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      rule_id BIGINT NOT NULL REFERENCES public.notification_rules(id) ON DELETE CASCADE,
      last_value NUMERIC NULL,
      last_sent_at TIMESTAMPTZ NULL,
      last_direction TEXT NULL,
      PRIMARY KEY (user_id, rule_id)
    );

    CREATE INDEX idx_notification_state_rule_id ON public.notification_state(rule_id);
  END IF;
END $$;

-- ============================================
-- 8. USER ACTIVITY (for offline detection)
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_activity'
  ) THEN
    CREATE TABLE public.user_activity (
      user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    DROP POLICY IF EXISTS "Users can view own activity" ON public.user_activity;
    CREATE POLICY "Users can view own activity"
      ON public.user_activity FOR SELECT
      USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can update own activity" ON public.user_activity;
    CREATE POLICY "Users can update own activity"
      ON public.user_activity FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can insert own activity" ON public.user_activity;
    CREATE POLICY "Users can insert own activity"
      ON public.user_activity FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 9. COUNTRY NEWS SOURCES
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'country_news_sources'
  ) THEN
    CREATE TABLE public.country_news_sources (
      id BIGSERIAL PRIMARY KEY,
      country TEXT NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      name TEXT NOT NULL,
      feed_url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_country_news_sources_country ON public.country_news_sources(country);
    CREATE INDEX idx_country_news_sources_enabled ON public.country_news_sources(enabled) WHERE enabled = true;
  END IF;
END $$;

-- ============================================
-- 10. COUNTRY NEWS ITEMS
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'country_news_items'
  ) THEN
    CREATE TABLE public.country_news_items (
      id BIGSERIAL PRIMARY KEY,
      country TEXT NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      source_id BIGINT NULL REFERENCES public.country_news_sources(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      published_at TIMESTAMPTZ NULL,
      summary TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_country_news_items_country_published_at ON public.country_news_items(country, published_at DESC);
    CREATE INDEX idx_country_news_items_url ON public.country_news_items(url);
  END IF;
END $$;

-- ============================================
-- 11. MACRO EVENTS (placeholder for MVP)
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'macro_events'
  ) THEN
    CREATE TABLE public.macro_events (
      id BIGSERIAL PRIMARY KEY,
      country TEXT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
      title TEXT NOT NULL,
      description TEXT NULL,
      event_date TIMESTAMPTZ NOT NULL,
      importance TEXT CHECK (importance IN ('low', 'medium', 'high')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_macro_events_country_event_date ON public.macro_events(country, event_date);
    CREATE INDEX idx_macro_events_event_date ON public.macro_events(event_date);
  END IF;
END $$;

