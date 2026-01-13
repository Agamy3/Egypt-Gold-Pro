/**
 * Coupon Redemption Logic (v2 - new schema)
 * 
 * Handles coupon redemption with new coupon schema
 */

import 'server-only';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerClient } from '@/lib/supabase/server';

export interface CouponRedemptionResult {
  ok: boolean;
  error?: string;
  applied?: {
    is_premium: boolean;
    premium_expires_at: string | null;
    premium_features: string[];
  };
  coupon?: {
    code: string;
    description: string | null;
  };
}

/**
 * Redeem a coupon code for the current user
 */
export async function redeemCouponV2(code: string): Promise<CouponRedemptionResult> {
  try {
    const user = await getServerUser();
    if (!user) {
      return {
        ok: false,
        error: 'Must be logged in to redeem coupons',
      };
    }

    const supabaseAdmin = createServerClient();

    // Find coupon
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single();

    if (couponError || !coupon) {
      return {
        ok: false,
        error: 'Invalid coupon code',
      };
    }

    if (!coupon.is_active) {
      return {
        ok: false,
        error: 'This coupon is no longer active',
      };
    }

    // Check date range
    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at) > now) {
      return {
        ok: false,
        error: 'This coupon is not yet valid',
      };
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
      return {
        ok: false,
        error: 'This coupon has expired',
      };
    }

    // Check max redemptions
    if (coupon.max_redemptions !== null && coupon.redeemed_count >= coupon.max_redemptions) {
      return {
        ok: false,
        error: 'This coupon has reached its maximum redemption limit',
      };
    }

    // Check if user has already redeemed this coupon
    const { data: existingRedemption } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('user_id', user.id)
      .single();

    if (existingRedemption) {
      return {
        ok: false,
        error: 'You have already redeemed this coupon',
      };
    }

    // Get current user profile
    const { data: currentProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('is_premium, premium_expires_at, premium_features')
      .eq('id', user.id)
      .single();

    const currentPremiumFeatures = (currentProfile?.premium_features as string[]) || [];
    const appliedFeatures = coupon.unlock_features ? [...new Set([...currentPremiumFeatures, ...(coupon.unlock_features as string[])])] : currentPremiumFeatures;

    // Apply effects
    let premiumExpiresAt: Date | null = null;
    if (coupon.grants_premium) {
      if (coupon.premium_days) {
        const currentExpiry = currentProfile?.premium_expires_at ? new Date(currentProfile.premium_expires_at) : now;
        premiumExpiresAt = new Date(Math.max(currentExpiry.getTime(), now.getTime()));
        premiumExpiresAt.setDate(premiumExpiresAt.getDate() + coupon.premium_days);
      } else {
        premiumExpiresAt = null; // Lifetime
      }
    }

    // Update user profile
    const updates: any = {
      is_premium: coupon.grants_premium || currentProfile?.is_premium || false,
      premium_features: appliedFeatures,
    };

    if (premiumExpiresAt) {
      updates.premium_expires_at = premiumExpiresAt.toISOString();
    } else if (coupon.grants_premium && !coupon.premium_days) {
      updates.premium_expires_at = null; // Lifetime
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      console.error('[redeemCouponV2] Error updating profile:', updateError);
      return {
        ok: false,
        error: 'Failed to apply coupon',
      };
    }

    // Record redemption
    const { error: redemptionError } = await supabaseAdmin
      .from('coupon_redemptions')
      .insert({
        coupon_id: coupon.id,
        user_id: user.id,
      });

    if (redemptionError) {
      console.error('[redeemCouponV2] Error recording redemption:', redemptionError);
    }

    // Increment redemption count
    await supabaseAdmin
      .from('coupons')
      .update({ redeemed_count: coupon.redeemed_count + 1 })
      .eq('id', coupon.id);

    return {
      ok: true,
      applied: {
        is_premium: updates.is_premium,
        premium_expires_at: updates.premium_expires_at || null,
        premium_features: appliedFeatures,
      },
      coupon: {
        code: coupon.code,
        description: coupon.description,
      },
    };
  } catch (error) {
    console.error('[redeemCouponV2] Error:', error);
    return {
      ok: false,
      error: 'An error occurred while redeeming the coupon',
    };
  }
}

