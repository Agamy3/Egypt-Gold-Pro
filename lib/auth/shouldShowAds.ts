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
 * - Note: Cookie consent is NOT required (ads show regardless of consent)
 */
export async function shouldShowAds(): Promise<AdVisibilityResult> {
  try {
    // Get user status (premium / no-ads check)
    const userStatus = await getUserAdStatus();

    return {
      shouldShow: userStatus.shouldShowAds,
      reason: userStatus.isPremium ? 'Premium user' : undefined,
      isLoggedIn: userStatus.isLoggedIn,
      isPremium: userStatus.isPremium,
    };
  } catch (error) {
    console.error('[shouldShowAds] Error:', error);
    // On error, default to showing ads (since we removed consent requirement)
    return {
      shouldShow: true,
      reason: 'Error checking ad visibility, defaulting to show',
    };
  }
}

