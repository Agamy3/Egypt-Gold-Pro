-- Step 1: Find your actual user ID
-- Run this query first to get your real user ID

SELECT 
  id, 
  email, 
  created_at,
  last_sign_in_at
FROM auth.users 
ORDER BY last_sign_in_at DESC 
LIMIT 5;

-- This will show you the most recently signed-in users
-- Your user ID will be in the "id" column (looks like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
