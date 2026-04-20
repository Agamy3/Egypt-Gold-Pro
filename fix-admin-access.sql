-- Fix Admin Access for User ID: 927adf9c-897d-411d-918f-2ec41910eb64

-- Step 1: Check current admin status
SELECT id, email, is_admin 
FROM public.user_profiles 
WHERE id = '927adf9c-897d-411d-918f-2ec41910eb64';

-- Step 2: Update existing entry to be admin
UPDATE public.user_profiles 
SET is_admin = true 
WHERE id = '927adf9c-897d-411d-918f-2ec41910eb64';

-- Step 3: Verify the update worked
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
WHERE u.id = '927adf9c-897d-411d-918f-2ec41910eb64';
