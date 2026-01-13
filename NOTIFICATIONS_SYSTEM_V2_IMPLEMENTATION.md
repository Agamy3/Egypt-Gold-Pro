# Notifications System v2 - Implementation Summary

## ✅ COMPLETED

### 1. Database Schema (SQL Migration)
**File:** `supabase/migrations/0012_notifications_system_v2.sql`

Complete idempotent SQL migration creating:
- `user_profiles` extensions (push_notifications_enabled, email_notifications_enabled)
- `user_country_watchlist` - User country watchlist management
- `push_subscriptions` - Web push subscription storage
- `notification_rules` - All notification rule types (Q1-Q6)
- `in_app_notifications` - In-app notification storage
- `notification_deliveries_log` - Delivery audit log
- `notification_state` - Cooldown/crossing state tracking
- `user_activity` - Offline detection (last_seen_at)
- `country_news_sources` - News source configuration
- `country_news_items` - News items storage
- `macro_events` - Economic events placeholder

All tables include RLS policies and proper indexes.

### 2. Backend API Routes

**Push Notifications:**
- `POST /api/notifications/push/subscribe` - Subscribe to push
- `POST /api/notifications/push/unsubscribe` - Unsubscribe from push

**In-App Notifications:**
- `GET /api/notifications/inapp?limit=50` - List notifications
- `POST /api/notifications/inapp/mark-read` - Mark as read (ids or all)

**Rules Management:**
- `GET /api/notifications/rules` - List user rules
- `POST /api/notifications/rules` - Create rule
- `PATCH /api/notifications/rules/:id` - Update rule
- `DELETE /api/notifications/rules/:id` - Delete rule

**Activity Tracking:**
- `POST /api/activity/ping` - Update last_seen_at (call every 60s)

**Cron Jobs:**
- `GET /api/cron/notify?secret=CRON_SECRET` - Main notification cron (Q1-Q6)
- `GET /api/cron/news-ingest?secret=CRON_SECRET` - News ingestion cron

### 3. Notification Triggers (Q1-Q6)

**Q1: Price Move >= 0.5%**
- Checks all user watchlist countries
- Cooldown: 30 minutes per (user, country, karat, direction)
- Tracks last price and direction in notification_state

**Q2: Custom Threshold Crossing**
- One-time rule (auto-disables after firing)
- Supports "above" and "below" directions
- Tracks crossing state

**Q3: Portfolio P/L >= 5%**
- One-time rule (auto-disables after firing)
- Calculates aggregate P/L from user_gold_holdings
- Compares to live market prices

**Q4: Daily Summary**
- Runs at 12:00 AM Egypt time
- Only 21k and 24k
- Sends summary of current prices

**Q5: Weekly Outlook**
- Runs at 12:00 AM Egypt time each Friday
- Only 21k and 24k
- Sends weekly price summary

**Q6: Macro Events**
- Checks upcoming events in next 24 hours
- Supports country-specific or global events

### 4. Delivery Logic

- **In-app notifications:** Always created when rule triggers
- **Push notifications:** Only sent if user is offline (last_seen_at > 5 minutes ago)
- **Email notifications:** Only sent if user enabled email globally AND rule has email enabled

### 5. Libraries

- `lib/push.ts` - Web push utilities (VAPID)
- `lib/email/resend.ts` - Already exists, compatible
- `public/sw.js` - Service worker for push notifications

### 6. Vercel Cron Configuration

Updated `vercel.json`:
- `/api/cron/notify` - Every 5 minutes
- `/api/cron/news-ingest` - Every 6 hours

## 📋 REMAINING WORK

### 1. Notifications Settings UI Page
**File:** `app/account/notifications/page.tsx` (TO BE CREATED)

Required sections:
- Global toggles: Email notifications, Push notifications
- Country watchlist checkboxes (EG/AE/SA/US)
- Rules manager:
  - Create rule form (type, country, karat, threshold, channels)
  - List existing rules with enable/disable/delete
- Push subscription status and "Enable push" button
- In-app notifications inbox with mark read

### 2. News Section
**Files:** 
- `app/api/news/route.ts` - GET news by country
- Dashboard news block component
- Optional: `/news` page

### 3. Arabic Routing (/ar routes)
**Approach:** Use Next.js route groups
- `app/(en)/page.tsx` - English dashboard
- `app/(ar)/page.tsx` - Arabic dashboard
- `app/(en)/account/notifications/page.tsx`
- `app/(ar)/account/notifications/page.tsx`
- etc.

Language toggle should navigate between `/en` and `/ar` while preserving query params.

### 4. Fixes
- **Cookie Consent:** Already exists (`components/CookieConsentBanner.tsx`) - verify it works
- **Tooltips:** Fix info icon tooltips (check `components/ui/HoverTip.tsx`)
- **Privacy Policy:** Create `/privacy` and `/ar/privacy` pages

## 🔧 OUTSIDE OF CURSOR ACTIONS REQUIRED

### 1. Resend Setup

1. **Sign up/Login to Resend:**
   - Go to https://resend.com
   - Create account or login

2. **Add Domain:**
   - Go to Domains section
   - Add `egyptgoldpro.com` (or your domain)
   - Follow DNS verification steps

3. **DNS Records (Add to your domain DNS):**
   ```
   SPF Record:
   Type: TXT
   Name: @
   Value: v=spf1 include:resend.com ~all
   
   DKIM Records:
   (Resend will provide these - add all provided TXT records)
   
   DMARC Record:
   Type: TXT
   Name: _dmarc
   Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@egyptgoldpro.com
   ```

4. **Verify Domain:**
   - Wait for DNS propagation (can take up to 48 hours)
   - Click "Verify" in Resend dashboard
   - Ensure all checks pass (SPF, DKIM, DMARC)

5. **Get API Key:**
   - Go to API Keys section
   - Create new API key
   - Copy the key

6. **Vercel Environment Variables:**
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   NOTIF_FROM_EMAIL=notification@egyptgoldpro.com
   NOTIF_FROM_NAME=EgyptGold Pro
   ```

### 2. VAPID Keys for Push Notifications

1. **Generate VAPID Keys:**
   ```bash
   npm install -g web-push
   web-push generate-vapid-keys
   ```

2. **Vercel Environment Variables:**
   ```
   VAPID_PUBLIC_KEY=xxxxxxxxxxxxx
   VAPID_PRIVATE_KEY=xxxxxxxxxxxxx
   VAPID_SUBJECT=mailto:no-reply@egyptgoldpro.com
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=xxxxxxxxxxxxx (same as VAPID_PUBLIC_KEY)
   ```

### 3. CRON_SECRET

1. **Generate Secret:**
   ```bash
   openssl rand -base64 32
   ```

2. **Vercel Environment Variable:**
   ```
   CRON_SECRET=your_generated_secret_here
   ```

### 4. Supabase Migration

1. **Run SQL Migration:**
   - Go to Supabase Dashboard → SQL Editor
   - Copy contents of `supabase/migrations/0012_notifications_system_v2.sql`
   - Paste and run
   - Verify all tables created successfully

### 5. Test Endpoints

```bash
# Health check
curl https://your-domain.com/api/supabase/health

# List rules (requires auth)
curl -H "Cookie: your-session-cookie" https://your-domain.com/api/notifications/rules

# Test cron (with secret)
curl "https://your-domain.com/api/cron/notify?secret=YOUR_CRON_SECRET"

# Test news ingestion
curl "https://your-domain.com/api/cron/news-ingest?secret=YOUR_CRON_SECRET"
```

## 📁 FILES CHANGED/CREATED

### Created:
- `supabase/migrations/0012_notifications_system_v2.sql`
- `app/api/notifications/push/subscribe/route.ts`
- `app/api/notifications/push/unsubscribe/route.ts`
- `app/api/notifications/inapp/route.ts`
- `app/api/notifications/rules/route.ts`
- `app/api/notifications/rules/[id]/route.ts`
- `app/api/activity/ping/route.ts`
- `app/api/cron/notify/route.ts`
- `app/api/cron/news-ingest/route.ts`
- `lib/push.ts`
- `public/sw.js`

### Modified:
- `vercel.json` - Added cron schedules
- `components/AccountMenu.tsx` - Added notifications link
- `package.json` - Added web-push dependency

### To Be Created:
- `app/account/notifications/page.tsx` - Notifications settings UI
- `app/api/news/route.ts` - News API endpoint
- News component for dashboard
- Arabic route pages (`app/(ar)/...`)
- Privacy policy pages

## 🎯 NEXT STEPS

1. **Complete UI Pages:**
   - Create notifications settings page
   - Create news section
   - Implement Arabic routing

2. **Testing:**
   - Test push subscription flow
   - Test notification triggers
   - Test email delivery
   - Test offline detection

3. **Deployment:**
   - Run SQL migration in Supabase
   - Set environment variables in Vercel
   - Configure Resend domain
   - Generate and set VAPID keys
   - Test cron jobs

