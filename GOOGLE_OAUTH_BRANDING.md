# Customizing Google OAuth Sign-In Screen

## Change "to continue to" Text

The "to continue to" text in Google sign-in shows your OAuth app's configuration. To change what users see:

### Step 1: Configure OAuth Consent Screen in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **OAuth consent screen**

### Step 2: Configure App Information

**App Information:**
- **App name**: `Egypt Gold Pro` (or your preferred name)
- **User support email**: Your email address
- **App logo**: Upload your logo (optional but recommended)
- **Application home page**: `https://egyptgoldpro.com`
- **Application privacy policy link**: `https://egyptgoldpro.com/privacy` (optional)
- **Application terms of service link**: `https://egyptgoldpro.com/terms` (optional)
- **Authorized domains**: Add `egyptgoldpro.com`

**Developer contact information:**
- Your email address

### Step 3: Configure Scopes

**Scopes:**
- `email`
- `profile`
- `openid`

These are typically added automatically by Supabase.

### Step 4: Test Users (if app is unverified)

If your app is "External" and unverified:
- Add test users who can sign in
- Test users' emails will bypass the verification requirement

### Step 5: Save and Wait

- Save your changes
- Wait 5-10 minutes for changes to propagate
- Changes may take up to 24 hours to fully reflect

## Important Notes

**What shows in Google sign-in:**
- The "Sign in with Google" text will show your **App name** (e.g., "Sign in with Egypt Gold Pro")
- The "to continue to" text typically shows the redirect URI domain (Supabase domain) OR your app's home page domain
- Since we're using Supabase OAuth, users will initially see the Supabase domain in "to continue to", but after approval, they'll be redirected to your app

**Custom Domain Display:**
Unfortunately, when using Supabase OAuth, the "to continue to" text will show your Supabase project domain (`xxxxx.supabase.co`) because that's where the OAuth redirect goes. This is expected behavior with Supabase's OAuth implementation.

**Workaround:**
The app name and branding you set in the OAuth consent screen will be more prominent than the "to continue to" text. Focus on:
- Setting a clear app name ("Egypt Gold Pro")
- Adding your logo
- Setting up proper support email and privacy links

This will make the sign-in experience more professional and trustworthy.

