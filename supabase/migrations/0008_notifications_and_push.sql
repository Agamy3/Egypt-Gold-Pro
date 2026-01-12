-- Migration: Notification Rules, Deliveries, and Web Push Subscriptions
-- Idempotent SQL script for Supabase

-- ============================================
-- USER NOTIFICATION RULES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_notification_rules (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country TEXT NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  side TEXT NOT NULL DEFAULT 'buy' CHECK (side IN ('buy', 'sell')),
  currency TEXT NOT NULL CHECK (currency IN ('EGP', 'USD', 'AED', 'SAR')),
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold NUMERIC NOT NULL,
  cooldown_minutes INTEGER NOT NULL DEFAULT 180,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for notification rules
CREATE INDEX IF NOT EXISTS idx_user_notification_rules_user_id ON public.user_notification_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_rules_enabled ON public.user_notification_rules(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_notification_rules_country_karat ON public.user_notification_rules(country, karat);
CREATE INDEX IF NOT EXISTS idx_user_notification_rules_created_at ON public.user_notification_rules(created_at DESC);

-- Updated_at trigger for notification rules
DROP TRIGGER IF EXISTS update_user_notification_rules_updated_at ON public.user_notification_rules;
CREATE TRIGGER update_user_notification_rules_updated_at
  BEFORE UPDATE ON public.user_notification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_notification_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification rules
DROP POLICY IF EXISTS "Users can view own notification rules" ON public.user_notification_rules;
CREATE POLICY "Users can view own notification rules"
  ON public.user_notification_rules
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification rules" ON public.user_notification_rules;
CREATE POLICY "Users can insert own notification rules"
  ON public.user_notification_rules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification rules" ON public.user_notification_rules;
CREATE POLICY "Users can update own notification rules"
  ON public.user_notification_rules
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notification rules" ON public.user_notification_rules;
CREATE POLICY "Users can delete own notification rules"
  ON public.user_notification_rules
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- NOTIFICATION DELIVERIES TABLE
-- ============================================

-- Check if table exists, if not create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_deliveries'
  ) THEN
    CREATE TABLE public.notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      rule_id BIGINT NOT NULL REFERENCES public.user_notification_rules(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      error TEXT NULL,
      dedupe_key TEXT NOT NULL,
      UNIQUE(rule_id, dedupe_key)
    );
  END IF;
END $$;

-- Add columns if they don't exist (for existing table)
DO $$
BEGIN
  -- Check and add rule_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_deliveries' 
    AND column_name = 'rule_id'
  ) THEN
    ALTER TABLE public.notification_deliveries ADD COLUMN rule_id BIGINT REFERENCES public.user_notification_rules(id) ON DELETE CASCADE;
  END IF;

  -- Check and add dedupe_key if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_deliveries' 
    AND column_name = 'dedupe_key'
  ) THEN
    ALTER TABLE public.notification_deliveries ADD COLUMN dedupe_key TEXT;
    -- Add unique constraint if not exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'notification_deliveries_rule_id_dedupe_key_key'
    ) THEN
      ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_rule_id_dedupe_key_key UNIQUE(rule_id, dedupe_key);
    END IF;
  END IF;
END $$;

-- Indexes for notification deliveries
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_rule_id ON public.notification_deliveries(rule_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_id ON public.notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_sent_at ON public.notification_deliveries(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dedupe_key ON public.notification_deliveries(dedupe_key);

-- Enable RLS
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification deliveries
DROP POLICY IF EXISTS "Users can view deliveries for own notifications" ON public.notification_deliveries;
CREATE POLICY "Users can view deliveries for own notifications"
  ON public.notification_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_notification_rules
      WHERE user_notification_rules.id = notification_deliveries.rule_id
      AND user_notification_rules.user_id = auth.uid()
    )
  );

-- Service role can insert/update deliveries (for cron jobs)
DROP POLICY IF EXISTS "Service role can manage deliveries" ON public.notification_deliveries;
CREATE POLICY "Service role can manage deliveries"
  ON public.notification_deliveries
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- WEB PUSH SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for web push subscriptions
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON public.web_push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_endpoint ON public.web_push_subscriptions(endpoint);

-- Enable RLS
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for web push subscriptions
DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.web_push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.web_push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON public.web_push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

