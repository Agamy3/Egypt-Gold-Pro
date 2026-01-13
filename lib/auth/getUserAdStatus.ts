/**
 * Get User Ad Status
 * 
 * Server-side helper to determine if user should see ads
 */

import 'server-only';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export interface UserAdStatus {
  isLoggedIn: boolean;
  isPremium: boolean;
  shouldShowAds: boolean;
}

/**
 * Get user ad status (guest/free/premium)
 * 
 * Rules:
 * - Guest (not logged in): shouldShowAds = true
 * - Free user (logged in, not premium): shouldShowAds = true
 * - Premium user: shouldShowAds = false
 */
export async function getUserAdStatus(): Promise<UserAdStatus> {
  try {
    const user = await getServerUser();
    
    // Guest: not logged in
    if (!user) {
      return {
        isLoggedIn: false,
        isPremium: false,
        shouldShowAds: true,
      };
    }

    // User is logged in - check profile
    const supabase = await createServerSupabaseClient();
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('is_premium, entitlements, premium_expires_at')
      .eq('id', user.id)
      .single();

    // If profile doesn't exist, treat as free user
    if (error || !profile) {
      return {
        isLoggedIn: true,
        isPremium: false,
        shouldShowAds: true,
      };
    }

    const isPremium = profile.is_premium ?? false;
    const entitlements = (profile.entitlements as Record<string, any>) || {};
    const isAdFree = entitlements.ad_free === true || isPremium;
    
    // Check if premium has expired
    const premiumExpired = profile.premium_expires_at 
      ? new Date(profile.premium_expires_at) < new Date()
      : false;
    
    const effectivePremium = isPremium && !premiumExpired;

    return {
      isLoggedIn: true,
      isPremium: effectivePremium,
      shouldShowAds: !isAdFree, // Show ads if not ad-free (via entitlements or premium)
    };
  } catch (error) {
    console.error('[getUserAdStatus] Error:', error);
    // On error, default to showing ads (safe fallback)
    return {
      isLoggedIn: false,
      isPremium: false,
      shouldShowAds: true,
    };
  }
}

