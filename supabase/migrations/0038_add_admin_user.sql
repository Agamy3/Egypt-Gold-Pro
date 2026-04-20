-- Add current user as admin
-- Run this manually to grant admin access

-- Replace 'YOUR_USER_ID' with actual user ID from auth.users table
INSERT INTO public.admin_users (user_id) 
VALUES ('YOUR_USER_ID');

-- Alternative: Set is_admin flag in user_profiles
-- UPDATE public.user_profiles 
-- SET is_admin = true 
-- WHERE id = 'YOUR_USER_ID';
