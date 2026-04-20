-- FIX PUBLIC BUSINESS CARDS RLS - Run this directly in Supabase SQL Editor
-- This will fix the public access issue immediately

-- Step 1: Drop the old problematic public policy
DROP POLICY IF EXISTS "Public business cards are viewable by all" ON public.admin_business_cards;

-- Step 2: Create a new simple public policy that only checks is_public flag
CREATE POLICY "Public business cards are viewable by all" ON public.admin_business_cards
  FOR SELECT USING (is_public = true);

-- Step 3: Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'admin_business_cards';

-- Step 4: Test the policy by trying to select a public card
SELECT 
  slug,
  is_public,
  full_name,
  CASE 
    WHEN is_public = true THEN 'PUBLIC - Should be visible to all'
    ELSE 'PRIVATE - Only visible to owner'
  END as visibility_status
FROM admin_business_cards 
WHERE slug = 'mohamed-agamy';

-- Step 5: Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'admin_business_cards';

-- This should show:
-- 1. The new policy in the policies list
-- 2. Your business card details with PUBLIC status
-- 3. RLS enabled on the table
-- After running this, the public business card page should work
