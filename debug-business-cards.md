# Business Cards Debug Guide

## Step 1: Check Database Migration
Run this SQL in your Supabase SQL editor to verify table exists:
```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'admin_business_cards';
```

If no results, run the migration manually:
```sql
-- Copy contents from supabase/migrations/0037_admin_business_cards.sql
```

## Step 2: Check Admin Permissions
Verify user has admin access by checking:
```sql
SELECT id, is_admin FROM public.user_profiles WHERE id = 'YOUR_USER_ID';
SELECT user_id FROM public.admin_users WHERE user_id = 'YOUR_USER_ID';
```

## Step 3: Test API Directly
Test the API endpoint with curl:
```bash
curl -X POST "https://your-domain.com/api/business-cards" \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "full_name": "Test Card",
    "role_title": "Developer"
  }'
```

## Step 4: Check Browser Console
Open browser dev tools and look for:
- Network tab: Failed API calls
- Console: JavaScript errors
- Response: Error messages

## Step 5: Common Issues

### Issue: "Full name is required"
- Ensure you're entering a name in the form
- Check if form validation is working

### Issue: "Unauthorized" 
- User is not in admin_users table
- User doesn't have is_admin = true in user_profiles

### Issue: "Slug is already taken"
- Try a different slug or leave empty for auto-generation
- Check existing slugs in database

### Issue: Database connection error
- Supabase connection issues
- RLS policies blocking access

## Step 6: Enable Debug Logging
Add this to BusinessCardsAdminPanel.tsx temporarily:
```javascript
const handleSave = async () => {
  console.log('Saving business card:', formData);
  // ... existing code
};
```

## Step 7: Check Server Logs
Look for these error patterns in server logs:
- `[API POST /business-cards] Error:`
- `[createBusinessCard] Error:`
- `[requireAdmin] Error:`
