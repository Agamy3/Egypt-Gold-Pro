/**
 * Ad Visibility Logic
 * 
 * Determines if ads should be shown based on user profile and consent
 */

import 'server-only';
import { getUserAdStatus } from './getUserAdStatus';
import { cookies } from 'next/headers';

export interface AdVisibilityResult {
  shouldShow: boolean;
  reason?: string;
  isLoggedIn?: boolean;
  isPremium?: boolean;
}

/**
 * Check if ads should be shown for the current user
 * 
 * Rules:
 * - SHOW if: NOT logged in (guest) OR (logged in AND NOT premium)
 * - HIDE if: is_premium === true
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

    // Get user status
    const userStatus = await getUserAdStatus();

    return {
      shouldShow: userStatus.shouldShowAds,
      reason: userStatus.isPremium ? 'Premium user' : undefined,
      isLoggedIn: userStatus.isLoggedIn,
      isPremium: userStatus.isPremium,
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

