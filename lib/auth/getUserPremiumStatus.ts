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
    let isAdFree = entitlements.ad_free === true || isPremium;
    
    // Check if premium has expired
    const premiumExpired = profile.premium_expires_at 
      ? new Date(profile.premium_expires_at) < new Date()
      : false;
    
    let effectivePremium = isPremium && !premiumExpired;
    let premiumExpiresAt: string | null = profile.premium_expires_at || null;

    // If `user_entitlements` exists, merge it with legacy `user_profiles` (max expiry wins; lifetime wins).
    const { data: entRow } = await supabase
      .from('user_entitlements')
      .select('is_premium, premium_until')
      .eq('user_id', user.id)
      .maybeSingle();

    const now = new Date();
    const legacyLifetime = Boolean(profile.is_premium) && profile.premium_expires_at === null;

    if (legacyLifetime) {
      effectivePremium = true;
      premiumExpiresAt = null;
    }

    if (entRow) {
      const entIsPremium = Boolean((entRow as any).is_premium);
      const entUntil = ((entRow as any).premium_until ?? null) as string | null;
      const entLifetime = entIsPremium && entUntil === null;

      if (entLifetime) {
        effectivePremium = true;
        premiumExpiresAt = null;
      } else if (entIsPremium && entUntil) {
        const entMs = Date.parse(entUntil);
        const legacyMs = profile.premium_expires_at ? Date.parse(String(profile.premium_expires_at)) : NaN;
        const maxMs = Math.max(Number.isFinite(entMs) ? entMs : -Infinity, Number.isFinite(legacyMs) ? legacyMs : -Infinity);
        if (Number.isFinite(maxMs) && maxMs > now.getTime()) {
          effectivePremium = true;
          // Pick the corresponding source string to preserve timezone/format.
          premiumExpiresAt = maxMs === entMs ? entUntil : (profile.premium_expires_at || null);
        }
      }
    }

    // Recompute ad-free after final premium resolution.
    isAdFree = entitlements.ad_free === true || effectivePremium;

    return {
      isPremium: effectivePremium,
      isAdFree,
      entitlements,
      premiumExpiresAt,
    };
  } catch (error) {
    console.error('[getUserPremiumStatus] Error:', error);
    return null;
  }
}

