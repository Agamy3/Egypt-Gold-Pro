/**
 * Coupon Redemption Logic
 * 
 * Handles coupon redemption and applying effects to user profiles
 */

import 'server-only';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';
import { createServerClient as createAdminClient } from '@/lib/supabase/server';

export interface CouponEffect {
  setPremium?: boolean;
  adFree?: boolean;
  entitlements?: Record<string, boolean>;
  days?: number;
}

export interface CouponRedemptionResult {
  success: boolean;
  message: string;
  effect?: CouponEffect;
}

/**
 * Redeem a coupon code for the current user
 */
export async function redeemCoupon(code: string): Promise<CouponRedemptionResult> {
  try {
    const user = await getServerUser();
    if (!user) {
      return {
        success: false,
        message: 'Must be logged in to redeem coupons',
      };
    }

    const supabase = await createServerSupabaseClient();
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabaseAdmin = createServerClient();

    // Find coupon
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single();

    if (couponError || !coupon) {
      return {
        success: false,
        message: 'Invalid coupon code',
      };
    }

    // Validate coupon is active
    if (!coupon.active) {
      return {
        success: false,
        message: 'This coupon is no longer active',
      };
    }

    // Check date range
    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at) > now) {
      return {
        success: false,
        message: 'This coupon is not yet valid',
      };
    }
    if (coupon.ends_at && new Date(coupon.ends_at) < now) {
      return {
        success: false,
        message: 'This coupon has expired',
      };
    }

    // Check max redemptions
    if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) {
      return {
        success: false,
        message: 'This coupon has reached its redemption limit',
      };
    }

    // Check if user already redeemed this coupon
    const { data: existingRedemption } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('user_id', user.id)
      .single();

    if (existingRedemption) {
      return {
        success: false,
        message: 'You have already redeemed this coupon',
      };
    }

    // Get effect
    const effect = (coupon.effect as CouponEffect) || {};

    // Apply effect to user profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('is_premium, entitlements, premium_expires_at')
      .eq('id', user.id)
      .single();

    const currentEntitlements = (profile?.entitlements as Record<string, any>) || {};
    const newEntitlements = { ...currentEntitlements };

    // Apply entitlements from effect
    if (effect.entitlements) {
      Object.assign(newEntitlements, effect.entitlements);
    }

    // Apply adFree
    if (effect.adFree) {
      newEntitlements.ad_free = true;
    }

    // Calculate premium expiration
    let premiumExpiresAt = profile?.premium_expires_at 
      ? new Date(profile.premium_expires_at)
      : null;

    if (effect.days) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + effect.days);
      
      // Extend if already in future, otherwise set new
      if (premiumExpiresAt && premiumExpiresAt > new Date()) {
        premiumExpiresAt = new Date(Math.max(premiumExpiresAt.getTime(), expiryDate.getTime()));
      } else {
        premiumExpiresAt = expiryDate;
      }
    }

    // Update user profile
    const updates: any = {
      entitlements: newEntitlements,
    };

    if (effect.setPremium) {
      updates.is_premium = true;
    }

    if (premiumExpiresAt) {
      updates.premium_expires_at = premiumExpiresAt.toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      console.error('[redeemCoupon] Error updating profile:', updateError);
      return {
        success: false,
        message: 'Failed to apply coupon',
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
      console.error('[redeemCoupon] Error recording redemption:', redemptionError);
      // Don't fail if redemption record fails, but log it
    }

    // Increment redemption count atomically
    try {
      await supabaseAdmin.rpc('increment_coupon_redemption', {
        coupon_id_param: coupon.id,
      });
    } catch (rpcError) {
      // Fallback if function doesn't exist - increment directly
      await supabaseAdmin
        .from('coupons')
        .update({ redemption_count: coupon.redemption_count + 1 })
        .eq('id', coupon.id);
    }

    return {
      success: true,
      message: 'Coupon redeemed successfully',
      effect,
    };
  } catch (error) {
    console.error('[redeemCoupon] Error:', error);
    return {
      success: false,
      message: 'An error occurred while redeeming the coupon',
    };
  }
}

