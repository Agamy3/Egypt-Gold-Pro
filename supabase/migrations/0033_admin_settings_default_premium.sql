-- Migration: Admin settings for default premium on new signups
-- Idempotent SQL script for Supabase

-- Create admin_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON public.admin_settings(key);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_admin_settings_updated_at ON public.admin_settings;
CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view settings
DROP POLICY IF EXISTS "Admins can view admin_settings" ON public.admin_settings;
CREATE POLICY "Admins can view admin_settings"
  ON public.admin_settings
  FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Only admins can update settings
DROP POLICY IF EXISTS "Admins can update admin_settings" ON public.admin_settings;
CREATE POLICY "Admins can update admin_settings"
  ON public.admin_settings
  FOR UPDATE
  USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Service role can insert/update (for server-side operations)
DROP POLICY IF EXISTS "Service role can manage admin_settings" ON public.admin_settings;
CREATE POLICY "Service role can manage admin_settings"
  ON public.admin_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default setting: default_new_users_premium = false
INSERT INTO public.admin_settings (key, value, description, updated_at)
VALUES (
  'default_new_users_premium',
  'false'::jsonb,
  'If true, all new user registrations will automatically receive premium status',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.admin_settings IS 'Admin-configurable application settings';
COMMENT ON COLUMN public.admin_settings.key IS 'Unique setting key (e.g., default_new_users_premium)';
COMMENT ON COLUMN public.admin_settings.value IS 'Setting value as JSONB (can be boolean, string, number, object, array)';
COMMENT ON COLUMN public.admin_settings.updated_by_user_id IS 'User ID of admin who last updated this setting';
