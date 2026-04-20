-- COMPREHENSIVE RLS FIX - Run this in Supabase SQL Editor
-- This will completely reset and fix the RLS policies

-- Step 1: Disable RLS temporarily
ALTER TABLE public.admin_business_cards DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies
DROP POLICY IF EXISTS "Admins can view own business cards" ON public.admin_business_cards;
DROP POLICY IF EXISTS "Public business cards are viewable by all" ON public.admin_business_cards;
DROP POLICY IF EXISTS "Admins can insert own business cards" ON public.admin_business_cards;
DROP POLICY IF EXISTS "Admins can update own business cards" ON public.admin_business_cards;
DROP POLICY IF EXISTS "Admins can delete own business cards" ON public.admin_business_cards;

-- Step 3: Re-enable RLS
ALTER TABLE public.admin_business_cards ENABLE ROW LEVEL SECURITY;

-- Step 4: Create clean, simple policies
-- 4a. Admins can manage their own cards
CREATE POLICY "Admins can manage own business cards" ON public.admin_business_cards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.is_admin = true
    )
  );

-- 4b. Public cards can be viewed by anyone (no auth required)
CREATE POLICY "Public business cards are viewable by all" ON public.admin_business_cards
  FOR SELECT USING (is_public = true);

-- Step 5: Verify all policies are correctly set
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'admin_business_cards'
ORDER BY policyname;

-- Step 6: Test public access (this should work now)
SELECT 
  slug,
  is_public,
  full_name,
  'TEST - This query should work for public access' as test_result
FROM admin_business_cards 
WHERE slug = 'mohamed-agamy' AND is_public = true;

-- Step 7: Test RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'admin_business_cards';

-- This should show:
-- 1. Two clean policies: "Admins can manage own business cards" and "Public business cards are viewable by all"
-- 2. Your business card with test result
-- 3. RLS enabled on the table
-- After running this, the public business card page should work
