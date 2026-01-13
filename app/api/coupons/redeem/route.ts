/**
 * Coupon Redemption API
 * 
 * POST /api/coupons/redeem
 * Body: { code: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { redeemCoupon } from '@/lib/coupons/redeem';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Coupon code is required' },
        { status: 400 }
      );
    }

    // Redeem coupon
    const result = await redeemCoupon(code);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      effect: result.effect,
    });
  } catch (error) {
    console.error('[API /coupons/redeem] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

