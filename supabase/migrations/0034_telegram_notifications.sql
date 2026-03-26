-- Migration: Telegram notifications (linking + channel support)
-- Idempotent for Supabase SQL

-- 1) notification_rules: add channel_telegram toggle
ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS channel_telegram BOOLEAN NOT NULL DEFAULT false;

-- 2) user_telegram_connections: one active row per user
CREATE TABLE IF NOT EXISTS public.user_telegram_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_telegram_connections_user_id
  ON public.user_telegram_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_telegram_connections_enabled
  ON public.user_telegram_connections(is_enabled);

ALTER TABLE public.user_telegram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram connection" ON public.user_telegram_connections;
CREATE POLICY "Users can view own telegram connection"
  ON public.user_telegram_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram connection" ON public.user_telegram_connections;
CREATE POLICY "Users can update own telegram connection"
  ON public.user_telegram_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram connection" ON public.user_telegram_connections;
CREATE POLICY "Users can delete own telegram connection"
  ON public.user_telegram_connections FOR DELETE
  USING (auth.uid() = user_id);

-- service role writes/reads for webhook + cron
DROP POLICY IF EXISTS "Service role can manage telegram connections" ON public.user_telegram_connections;
CREATE POLICY "Service role can manage telegram connections"
  ON public.user_telegram_connections FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3) telegram_link_tokens: single-use + expiring
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id
  ON public.telegram_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_at
  ON public.telegram_link_tokens(expires_at);

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram link tokens" ON public.telegram_link_tokens;
CREATE POLICY "Users can view own telegram link tokens"
  ON public.telegram_link_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram link tokens" ON public.telegram_link_tokens;
CREATE POLICY "Users can insert own telegram link tokens"
  ON public.telegram_link_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own telegram link tokens" ON public.telegram_link_tokens;
CREATE POLICY "Users can delete own telegram link tokens"
  ON public.telegram_link_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- service role writes/reads for webhook verify
DROP POLICY IF EXISTS "Service role can manage telegram link tokens" ON public.telegram_link_tokens;
CREATE POLICY "Service role can manage telegram link tokens"
  ON public.telegram_link_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4) delivery log: allow telegram channel in existing CHECK
ALTER TABLE public.notification_deliveries_log
  DROP CONSTRAINT IF EXISTS notification_deliveries_log_channel_check;

ALTER TABLE public.notification_deliveries_log
  ADD CONSTRAINT notification_deliveries_log_channel_check
  CHECK (channel IN ('inapp', 'push', 'email', 'telegram'));
