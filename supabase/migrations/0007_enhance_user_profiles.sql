-- Migration: Enhance User Profiles
-- Extends user_profiles table with preferences and notification settings
-- Idempotent SQL script for Supabase

-- Add new columns to user_profiles if they don't exist
DO $$ 
BEGIN
  -- Display Name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN display_name TEXT;
  END IF;

  -- Preferred Country
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'preferred_country'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN preferred_country TEXT 
      CHECK (preferred_country IS NULL OR preferred_country IN ('EG', 'AE', 'SA', 'US'));
  END IF;

  -- Preferred Currency
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'preferred_currency'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN preferred_currency TEXT 
      CHECK (preferred_currency IS NULL OR preferred_currency IN ('EGP', 'USD', 'AED', 'SAR'));
  END IF;

  -- Preferred Language
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN preferred_language TEXT 
      CHECK (preferred_language IS NULL OR preferred_language IN ('EN', 'AR'));
  END IF;

  -- Email Notifications Enabled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'email_notifications_enabled'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  -- App Notifications Enabled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'app_notifications_enabled'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN app_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Update RLS policies if needed (check if update policy exists)
DO $$
BEGIN
  -- Check if update policy exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_profiles' 
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.user_profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

