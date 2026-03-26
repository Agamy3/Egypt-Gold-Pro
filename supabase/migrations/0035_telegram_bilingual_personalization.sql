-- Migration: Telegram bilingual + personalization preferences
-- Idempotent SQL

ALTER TABLE public.user_telegram_connections
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'ar'));

ALTER TABLE public.user_telegram_connections
  ADD COLUMN IF NOT EXISTS preferred_karat TEXT NOT NULL DEFAULT '21'
  CHECK (preferred_karat IN ('21', '24', 'global'));

ALTER TABLE public.user_telegram_connections
  ADD COLUMN IF NOT EXISTS alert_signals_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_telegram_connections
  ADD COLUMN IF NOT EXISTS alert_price_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_user_telegram_connections_language
  ON public.user_telegram_connections(language);

CREATE INDEX IF NOT EXISTS idx_user_telegram_connections_alerts
  ON public.user_telegram_connections(is_enabled, alert_signals_enabled, alert_price_enabled);
