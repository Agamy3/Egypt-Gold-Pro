# Logo Setup Instructions

## Overview
The logo infrastructure is now fully wired and ready. You just need to upload the actual logo image files.

## What Has Been Done

✅ **Code Updates:**
- Updated `app/layout.tsx` with comprehensive metadata (icons, Open Graph, Twitter cards)
- Updated `app/page.tsx` header to display logo using Next.js Image component
- Added manifest.json for PWA support
- Added NEXT_PUBLIC_SITE_URL environment variable support

✅ **Directory Structure Created:**
- `/public/brand/` - Main logo assets
- `/public/icons/` - Icon assets for PWA and mobile

✅ **Files Wired (Placeholders Created):**
All file references are correctly wired. The placeholder files contain TODO instructions.

## Files You Need to Upload

### 1. Primary Logo
**File:** `/public/brand/logo.png`
- **Size:** 200x200px or larger (will be scaled in UI)
- **Format:** PNG with transparent background
- **Usage:** Displayed in header navigation (responsive: 48px on mobile, 56px on desktop)

### 2. Favicon
**File:** `/public/favicon.ico`
- **Format:** Multi-size ICO file (16x16, 32x32, 48x48)
- **Generation:** Use online converter or image tool to convert from logo PNG

### 3. PWA Icons
**Files:**
- `/public/icons/icon-192.png` (192x192px)
- `/public/icons/icon-512.png` (512x512px)
- `/public/icons/apple-touch-icon.png` (180x180px)

**Generation:** Resize your logo PNG to these sizes

### 4. Social Media Images
**Files:**
- `/public/og.png` (1200x630px) - Open Graph image for social sharing
- `/public/twitter.png` (1200x630px or 1200x600px) - Twitter card image

**Recommendation:** Place logo centered on dark blue background (#000000 or #1a1a2e) matching app theme

## Environment Variable

**File:** `.env.local` (or your deployment environment)

Add:
```
NEXT_PUBLIC_SITE_URL=https://egyptgoldpro.com
```

For local development, this will fallback to `http://localhost:3000` automatically.

## Testing After Upload

1. **Header Logo:**
   - Check that logo appears in header next to app title
   - Verify logo is clickable (links to home)
   - Test on mobile and desktop

2. **Favicon:**
   - Check browser tab shows favicon
   - Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) if needed

3. **PWA Icons:**
   - Check manifest.json loads correctly
   - Test "Add to Home Screen" on mobile

4. **Social Sharing:**
   - Test Open Graph preview using: https://www.opengraph.xyz/
   - Test Twitter card preview using: https://cards-dev.twitter.com/validator

## Notes

- All placeholder files currently contain text instructions (TODO notes)
- Replace them with actual image files before deploying to production
- The code is fully wired and will work once real images are uploaded
- Next.js Image component will handle optimization automatically

