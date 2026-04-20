-- Admin Access Setup Script
-- Run this in your Supabase SQL Editor to fix the "Unauthorized" error

-- Step 1: Find your user ID
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 10;

-- Step 2: Check if user_profiles entry exists
SELECT id, email, is_admin 
FROM public.user_profiles 
WHERE email = 'your-email@example.com';

-- Step 3: Update your user to be admin (replace YOUR_USER_ID with actual ID from Step 1)
UPDATE public.user_profiles 
SET is_admin = true 
WHERE id = 'YOUR_USER_ID';

-- Alternative: If no user_profiles entry exists, create one
INSERT INTO public.user_profiles (id, email, is_admin)
VALUES ('YOUR_USER_ID', 'your-email@example.com', true);

-- Step 4: Verify the admin access
SELECT 
  u.id,
  u.email,
  up.is_admin,
  CASE 
    WHEN up.is_admin = true THEN 'ADMIN ACCESS GRANTED'
    ELSE 'NO ADMIN ACCESS'
  END as status
FROM auth.users u
LEFT JOIN public.user_profiles up ON u.id = up.id
WHERE u.email = 'your-email@example.com';

-- Step 5: Test the admin check (optional)
-- This should return true if admin access is working
SELECT EXISTS (
  SELECT 1 FROM public.user_profiles 
  WHERE id = 'YOUR_USER_ID' AND is_admin = true
) as is_admin_check;
