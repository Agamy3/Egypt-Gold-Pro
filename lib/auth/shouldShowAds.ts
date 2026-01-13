/**
 * Ad Visibility Logic
 * 
 * Determines if ads should be shown based on user profile and consent
 */

import 'server-only';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';
import { cookies } from 'next/headers';

export interface AdVisibilityResult {
  shouldShow: boolean;
  reason?: string;
}

/**
 * Check if ads should be shown for the current user
 * 
 * Rules:
 * - SHOW if: NOT logged in OR (logged in AND is_premium === false AND is_ad_free === false)
 * - HIDE if: is_premium === true OR is_ad_free === true
 * - Also check cookie consent (marketing cookies must be accepted)
 */
export async function shouldShowAds(): Promise<AdVisibilityResult> {
  try {
    // Check cookie consent first
    const cookieStore = await cookies();
    const consentCookie = cookieStore.get('cookie_consent')?.value;
    const hasConsent = consentCookie === 'accepted';

    if (!hasConsent) {
      return {
        shouldShow: false,
        reason: 'Cookie consent not given',
      };
    }

    // Check if user is logged in
    const user = await getServerUser();

    // ANON: Not logged in - show ads
    if (!user) {
      return {
        shouldShow: true,
      };
    }

    // User is logged in - check profile
    const supabase = await createServerSupabaseClient();
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('is_premium, is_ad_free')
      .eq('id', user.id)
      .single();

    // If profile doesn't exist, treat as free user (show ads)
    if (error || !profile) {
      return {
        shouldShow: true,
      };
    }

    const isPremium = profile.is_premium ?? false;
    const isAdFree = profile.is_ad_free ?? false;

    // HIDE if premium or ad-free
    if (isPremium || isAdFree) {
      return {
        shouldShow: false,
        reason: isPremium ? 'Premium user' : 'Ad-free user',
      };
    }

    // FREE: logged in, not premium, not ad-free - show ads
    return {
      shouldShow: true,
    };
  } catch (error) {
    console.error('[shouldShowAds] Error:', error);
    // On error, default to not showing ads (safe fallback)
    return {
      shouldShow: false,
      reason: 'Error checking ad visibility',
    };
  }
}

