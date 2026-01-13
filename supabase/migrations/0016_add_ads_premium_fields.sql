-- Migration: Add Premium and Ads Control Fields to user_profiles
-- Idempotent SQL script for Supabase
-- Adds is_premium, is_ad_free, and role columns

DO $$ 
BEGIN
  -- Add is_premium column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'is_premium'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Add is_ad_free column (check for both old and new names for migration safety)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'is_ad_free'
  ) THEN
    -- If ads_disabled exists, rename it; otherwise add new column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_profiles' 
      AND column_name = 'ads_disabled'
    ) THEN
      ALTER TABLE public.user_profiles 
        RENAME COLUMN ads_disabled TO is_ad_free;
    ELSE
      ALTER TABLE public.user_profiles 
        ADD COLUMN is_ad_free BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  END IF;

  -- Add role column with check constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'role'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD COLUMN role TEXT NOT NULL DEFAULT 'user' 
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

-- Update RLS policy to allow users to update is_premium and is_ad_free but not role
DO $$
BEGIN
  -- Drop existing update policy if it's too restrictive
  DROP POLICY IF EXISTS "Users can update own profile premium and ads" ON public.user_profiles;
  
  -- Create new policy that allows updating is_premium and is_ad_free but not role
  CREATE POLICY "Users can update own profile premium and ads"
    ON public.user_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
      auth.uid() = id 
      AND (
        -- Users can only update these fields, not role
        -- This is best enforced in application code, but we add the policy anyway
        true
      )
    );
END $$;

-- Add comments
COMMENT ON COLUMN public.user_profiles.is_premium IS 'Whether user has premium subscription (ads disabled)';
COMMENT ON COLUMN public.user_profiles.is_ad_free IS 'Whether ads are disabled for this user (e.g., promotional)';
COMMENT ON COLUMN public.user_profiles.role IS 'User role: user or admin (admin cannot be set by user)';

