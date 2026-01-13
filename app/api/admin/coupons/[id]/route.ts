/**
 * Admin Coupon Management API
 * 
 * PATCH /api/admin/coupons/:id
 * GET /api/admin/coupons/:id/redemptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserStatus } from '@/lib/auth/getUserStatus';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const status = await getUserStatus();
    if (!status.isAdmin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'Invalid coupon ID' }, { status: 400 });
    }

    const body = await request.json();
    const updates: any = {};

    if ('is_active' in body) updates.is_active = body.is_active;
    if ('description' in body) updates.description = body.description || null;
    if ('max_redemptions' in body) updates.max_redemptions = body.max_redemptions || null;
    if ('starts_at' in body) updates.starts_at = body.starts_at || null;
    if ('expires_at' in body) updates.expires_at = body.expires_at || null;
    if ('grants_premium' in body) updates.grants_premium = body.grants_premium;
    if ('premium_days' in body) updates.premium_days = body.premium_days || null;
    if ('unlock_features' in body) updates.unlock_features = body.unlock_features || null;

    const supabaseAdmin = createServerClient();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API /admin/coupons/:id PATCH] Error:', error);
      return NextResponse.json({ ok: false, error: error.message || 'Failed to update coupon' }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: 'Coupon not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error('[API /admin/coupons/:id PATCH] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const status = await getUserStatus();
    if (!status.isAdmin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'Invalid coupon ID' }, { status: 400 });
    }

    const supabaseAdmin = createServerClient();

    // Get coupon
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('id', id)
      .single();

    if (couponError || !coupon) {
      return NextResponse.json({ ok: false, error: 'Coupon not found' }, { status: 404 });
    }

    // Get redemptions
    const { data: redemptions, error: redemptionsError } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('*, user_profiles(email, display_name)')
      .eq('coupon_id', id)
      .order('redeemed_at', { ascending: false });

    if (redemptionsError) {
      console.error('[API /admin/coupons/:id GET] Error fetching redemptions:', redemptionsError);
    }

    return NextResponse.json({
      ok: true,
      data: {
        coupon,
        redemptions: redemptions || [],
      },
    });
  } catch (error) {
    console.error('[API /admin/coupons/:id GET] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
