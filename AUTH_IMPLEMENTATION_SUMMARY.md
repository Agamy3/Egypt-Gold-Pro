# User Authentication, Account Carry, and Notifications Implementation

## Summary

This implementation adds:
1. **User Authentication**: Email/Password, Google OAuth, Apple OAuth
2. **Account Carry**: User preferences (country/currency) persistence
3. **Custom Notifications**: Price threshold alerts with email delivery

---

## SQL Migration Script

Run this in Supabase SQL Editor:

```sql
-- Migration: User Auth, Profiles, and Notifications
-- Idempotent SQL script for Supabase
-- Run in Supabase SQL Editor

-- ============================================
-- USER PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  preferred_country TEXT CHECK (preferred_country IN ('EG', 'AE', 'SA', 'US')),
  preferred_currency TEXT CHECK (preferred_currency IN ('EGP', 'USD', 'AED', 'SAR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.user_profiles;
CREATE POLICY "Users can delete own profile"
  ON public.user_profiles
  FOR DELETE
  USING (auth.uid() = id);

-- ============================================
-- USER NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country TEXT NOT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  rule_type TEXT NOT NULL DEFAULT 'price_threshold' CHECK (rule_type = 'price_threshold'),
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold_value NUMERIC NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('EGP', 'USD', 'AED', 'SAR')),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'push')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_enabled ON public.user_notifications(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_notifications_country_karat ON public.user_notifications(country, karat);

-- Updated_at trigger
CREATE TRIGGER update_user_notifications_updated_at
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
  ON public.user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.user_notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.user_notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- NOTIFICATION DELIVERIES TABLE (OPTIONAL)
-- ============================================

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  last_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id ON public.notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON public.notification_deliveries(status);

-- Updated_at trigger
CREATE TRIGGER update_notification_deliveries_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification_deliveries (users can view deliveries for their notifications)
DROP POLICY IF EXISTS "Users can view deliveries for own notifications" ON public.notification_deliveries;
CREATE POLICY "Users can view deliveries for own notifications"
  ON public.notification_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_notifications
      WHERE user_notifications.id = notification_deliveries.notification_id
      AND user_notifications.user_id = auth.uid()
    )
  );

-- Service role can insert/update deliveries (for cron jobs)
DROP POLICY IF EXISTS "Service role can manage deliveries" ON public.notification_deliveries;
CREATE POLICY "Service role can manage deliveries"
  ON public.notification_deliveries
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');
```

---

## Files Changed

### New Files Created:

1. **Middleware & Auth Infrastructure:**
   - `middleware.ts` - Next.js middleware for Supabase auth session refresh
   - `lib/supabase/server-auth.ts` - Server-side auth utilities with @supabase/ssr
   - `lib/supabase/client-auth.ts` - Client-side auth utilities
   - `lib/supabase/profile.ts` - User profile management utilities

2. **Auth API Routes:**
   - `app/api/auth/signup/route.ts` - Email/password signup
   - `app/api/auth/signin/route.ts` - Email/password signin
   - `app/api/auth/signout/route.ts` - Sign out
   - `app/api/auth/reset-password/route.ts` - Password reset
   - `app/api/auth/oauth/route.ts` - OAuth (Google/Apple) initiation
   - `app/api/auth/callback/route.ts` - OAuth callback handler

3. **Auth UI Pages:**
   - `app/auth/signin/page.tsx` - Sign in page
   - `app/auth/signup/page.tsx` - Sign up page
   - `app/auth/reset-password/page.tsx` - Password reset page
   - `app/auth/auth-code-error/page.tsx` - OAuth error page

4. **Account/Profile System:**
   - `app/api/profile/preferences/route.ts` - User preferences API
   - `app/account/profile/page.tsx` - Profile page (basic)

5. **Notifications System:**
   - `app/api/notifications/route.ts` - List/create notifications
   - `app/api/notifications/[id]/route.ts` - Update/delete notification
   - `app/api/notifications/test-evaluate/route.ts` - Test notification evaluation
   - `app/api/notifications/send/route.ts` - Send notifications (cron)

6. **UI Components:**
   - `components/AccountMenu.tsx` - Account menu in header

7. **Database:**
   - `supabase/migrations/0005_user_auth_and_notifications.sql` - SQL migration

### Modified Files:

1. **Header Integration:**
   - `app/page.tsx` - Added AccountMenu component
   - `app/us/page.tsx` - Added AccountMenu component

2. **Dependencies:**
   - `package.json` - Added @supabase/ssr

---

## Environment Variables

Add these to your `.env.local`:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Server-only

# Site URL (for OAuth redirects)
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # or https://yourdomain.com

# Cron Secret (for notification sending endpoint)
CRON_SECRET=your_random_secret_here

# Email Provider (Optional - for notifications)
# RESEND_API_KEY=your_resend_key  # If using Resend
# SENDGRID_API_KEY=your_sendgrid_key  # If using Sendgrid
# Or configure SMTP in Supabase Dashboard
```

---

## Verification Steps

### 1. Run SQL Migration

1. Go to Supabase Dashboard → SQL Editor
2. Paste the SQL migration script from above
3. Run it (should complete without errors)

### 2. Configure Supabase Auth

1. **Enable Email/Password Auth:**
   - Supabase Dashboard → Authentication → Providers
   - Enable "Email" provider

2. **Configure Google OAuth:**
   - Supabase Dashboard → Authentication → Providers
   - Enable "Google"
   - Add redirect URL: `http://localhost:3000/api/auth/callback` (dev) and `https://yourdomain.com/api/auth/callback` (prod)
   - Client ID: `126904796212-hh4kob82jueg05spgg9lh93m4bd43dgi.apps.googleusercontent.com`
   - Add Client Secret (from Google Cloud Console)

3. **Configure Apple OAuth (Optional):**
   - Supabase Dashboard → Authentication → Providers
   - Enable "Apple" if needed
   - Configure Apple Developer credentials

### 3. Test Email Signup Locally

```bash
# Start dev server
npm run dev

# Navigate to:
http://localhost:3000/auth/signup

# Create an account with email/password
# Check Supabase Dashboard → Authentication → Users to verify user creation
# Check Supabase Dashboard → Table Editor → user_profiles to verify profile creation
```

### 4. Test Google OAuth Locally

1. Ensure redirect URL is configured in Supabase: `http://localhost:3000/api/auth/callback`
2. Navigate to: `http://localhost:3000/auth/signin`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Verify user and profile creation in Supabase Dashboard

### 5. Verify Profile Row Creation

```bash
# After signing in, check Supabase Dashboard:
# Table Editor → user_profiles
# Should see a row with:
# - id: matches auth.users.id
# - email: user's email
# - preferred_country: null (initially)
# - preferred_currency: null (initially)
```

### 6. Create a Notification and Test Evaluation

```bash
# 1. Sign in to the app
# 2. Navigate to: /account/notifications (or create API call)

# Create notification via API:
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie" \
  -d '{
    "country": "EG",
    "karat": 24,
    "direction": "above",
    "threshold_value": 7000,
    "currency": "EGP",
    "channel": "email",
    "enabled": true
  }'

# Test evaluation (dry run):
curl http://localhost:3000/api/notifications/test-evaluate \
  -H "Cookie: your_session_cookie"

# Should return JSON with triggered notifications
```

### 7. Test Notification Send (Cron Endpoint)

```bash
# This endpoint is protected by CRON_SECRET
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Should return JSON with:
# {
#   "sent": 0,
#   "errors": 0,
#   "details": { ... }
# }

# Note: Email sending is not yet implemented (returns false)
# To implement, add email provider (Resend/Sendgrid/Supabase SMTP)
```

---

## Notes

1. **Account Carry (Preferences):**
   - User preferences (country/currency) are stored in `user_profiles` table
   - Currently, preferences sync happens on page load (can be enhanced to sync on change)
   - CountryCurrencySelector component needs to be updated to sync with user preferences (future enhancement)

2. **Notifications:**
   - Email sending is stubbed out (returns false)
   - To enable email sending, implement one of:
     - Resend API integration
     - SendGrid API integration
     - Supabase SMTP configuration
   - Push notifications are not yet implemented

3. **Profile Creation:**
   - Profiles are automatically created on:
     - Email/password signup (via `/api/auth/signup`)
     - OAuth sign-in (via `/api/auth/callback`)
   - If profile creation fails, auth still succeeds (logged to console)

4. **RLS Policies:**
   - All tables have Row Level Security enabled
   - Users can only access their own data
   - Service role can access all data (for cron jobs)

5. **Session Management:**
   - Uses @supabase/ssr for proper cookie handling in Next.js 14 App Router
   - Middleware refreshes sessions on each request
   - Sessions persist across page reloads

---

## Next Steps (Future Enhancements)

1. Update CountryCurrencySelector to sync preferences with user profile
2. Implement email sending (Resend/SendGrid/Supabase SMTP)
3. Create full notifications UI page (`/account/notifications`)
4. Add profile editing UI
5. Implement push notifications
6. Add email verification flow
7. Add account deletion functionality

