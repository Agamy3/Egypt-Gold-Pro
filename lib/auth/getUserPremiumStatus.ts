/**
 * Get User Premium Status
 * 
 * Server-side helper to check premium status and entitlements
 */

import 'server-only';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export interface UserPremiumStatus {
  isPremium: boolean;
  isAdFree: boolean;
  entitlements: Record<string, any>;
  premiumExpiresAt: string | null;
}

/**
 * Get user premium status and entitlements
 */
export async function getUserPremiumStatus(): Promise<UserPremiumStatus | null> {
  try {
    const user = await getServerUser();
    if (!user) return null;

    const supabase = await createServerSupabaseClient();
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('is_premium, entitlements, premium_expires_at')
      .eq('id', user.id)
      .single();

    if (error || !profile) return null;

    const entitlements = (profile.entitlements as Record<string, any>) || {};
    const isPremium = profile.is_premium ?? false;
    const isAdFree = entitlements.ad_free === true || isPremium;
    
    // Check if premium has expired
    const premiumExpired = profile.premium_expires_at 
      ? new Date(profile.premium_expires_at) < new Date()
      : false;
    
    const effectivePremium = isPremium && !premiumExpired;

    return {
      isPremium: effectivePremium,
      isAdFree,
      entitlements,
      premiumExpiresAt: profile.premium_expires_at || null,
    };
  } catch (error) {
    console.error('[getUserPremiumStatus] Error:', error);
    return null;
  }
}

