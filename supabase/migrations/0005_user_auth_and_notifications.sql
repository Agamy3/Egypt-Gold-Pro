-- Migration: User Auth, Profiles, and Notifications
-- Idempotent SQL script for Supabase
-- Run in Supabase SQL Editor

-- ============================================
-- USER PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  preferred_country TEXT CHECK (preferred_country IN ('EG', 'AE', 'SA', 'US')),
  preferred_currency TEXT CHECK (preferred_currency IN ('EGP', 'USD', 'AED', 'SAR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.user_profiles;
CREATE POLICY "Users can delete own profile"
  ON public.user_profiles
  FOR DELETE
  USING (auth.uid() = id);

-- ============================================
-- USER NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country TEXT NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  rule_type TEXT NOT NULL DEFAULT 'price_threshold' CHECK (rule_type = 'price_threshold'),
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold_value NUMERIC NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('EGP', 'USD', 'AED', 'SAR')),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'push')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_enabled ON public.user_notifications(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_notifications_country_karat ON public.user_notifications(country, karat);

-- Updated_at trigger
CREATE TRIGGER update_user_notifications_updated_at
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
  ON public.user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.user_notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.user_notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- NOTIFICATION DELIVERIES TABLE (OPTIONAL)
-- ============================================

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  last_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id ON public.notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON public.notification_deliveries(status);

-- Updated_at trigger
CREATE TRIGGER update_notification_deliveries_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification_deliveries (users can view deliveries for their notifications)
DROP POLICY IF EXISTS "Users can view deliveries for own notifications" ON public.notification_deliveries;
CREATE POLICY "Users can view deliveries for own notifications"
  ON public.notification_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_notifications
      WHERE user_notifications.id = notification_deliveries.notification_id
      AND user_notifications.user_id = auth.uid()
    )
  );

-- Service role can insert/update deliveries (for cron jobs)
DROP POLICY IF EXISTS "Service role can manage deliveries" ON public.notification_deliveries;
CREATE POLICY "Service role can manage deliveries"
  ON public.notification_deliveries
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

