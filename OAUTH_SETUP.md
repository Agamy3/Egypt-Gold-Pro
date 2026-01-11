# Google OAuth Redirect URI Setup Guide

## The Problem
You're getting `Error 400: redirect_uri_mismatch` because the redirect URI in your Google OAuth configuration doesn't match what Supabase is sending.

## Solution

### Step 1: Find Your Supabase Redirect URI
When using Supabase OAuth, Supabase acts as the OAuth provider. The redirect URI should point to Supabase's callback URL, not your app's callback URL.

Your Supabase redirect URI format is:
```
https://[your-project-ref].supabase.co/auth/v1/callback
```

To find your project ref:
1. Go to your Supabase Dashboard
2. Go to Settings → API
3. Look for your "Project URL" - it will be something like `https://xxxxx.supabase.co`
4. Your redirect URI is: `https://xxxxx.supabase.co/auth/v1/callback`

### Step 2: Configure Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Go to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID (the one with client ID: `126904796212-hh4kob82jueg05spgg9lh93m4bd43dgi.apps.googleusercontent.com`)
5. Click **Edit** (pencil icon)
6. Under **Authorized redirect URIs**, add:
   ```
   https://[your-project-ref].supabase.co/auth/v1/callback
   ```
   Replace `[your-project-ref]` with your actual Supabase project reference.

7. If you're testing locally, also add:
   ```
   http://localhost:54321/auth/v1/callback
   ```
   (This is for Supabase local development)

8. Click **Save**

### Step 3: Configure Supabase
1. Go to Supabase Dashboard → **Authentication** → **Providers**
2. Find **Google** and enable it
3. Enter:
   - **Client ID (for OAuth)**: `126904796212-hh4kob82jueg05spgg9lh93m4bd43dgi.apps.googleusercontent.com`
   - **Client Secret (for OAuth)**: (Get this from Google Cloud Console)
4. Under **Redirect URL**, you'll see what Supabase expects - make sure this matches what you added to Google Cloud Console
5. Click **Save**

### Step 4: Verify Site URL in Supabase
1. Go to Supabase Dashboard → **Authentication** → **URL Configuration**
2. Make sure **Site URL** is set to: `https://egyptgoldpro.com`
3. Add to **Redirect URLs**:
   - `https://egyptgoldpro.com/**`
   - `http://localhost:3000/**` (for local dev)

### Step 5: Redeploy
After making changes:
1. Redeploy your Vercel application
2. Test the OAuth flow

## Important Notes

- **Supabase handles the OAuth callback**, not your Next.js app directly
- The `redirectTo` parameter in your code tells Supabase where to redirect AFTER it handles the OAuth callback
- Google OAuth redirect_uri must match **Supabase's callback URL**, not your app's callback URL
- The flow is: User → Google → Supabase callback → Your app callback (`/api/auth/callback`)

## Testing

1. Try signing in with Google on your production site
2. You should be redirected to Google for authorization
3. After approving, you'll be redirected back to your app

If you still get errors, check:
- Vercel logs for detailed error messages
- Supabase logs (Dashboard → Logs → Auth Logs)
- Google Cloud Console → OAuth consent screen settings

