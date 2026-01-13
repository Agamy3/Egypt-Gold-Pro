/**
 * Admin Coupon Management API
 * 
 * PATCH /api/admin/coupons/:id
 * GET /api/admin/coupons/:id/redemptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/isAdmin';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin
    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid coupon ID' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const updates: any = {};

    if ('active' in body) updates.active = body.active;
    if ('max_redemptions' in body) updates.max_redemptions = body.max_redemptions || null;
    if ('starts_at' in body) updates.starts_at = body.starts_at || null;
    if ('ends_at' in body) updates.ends_at = body.ends_at || null;
    if ('note' in body) updates.note = body.note || null;
    if ('effect' in body) updates.effect = body.effect || {};

    const supabaseAdmin = createServerClient();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API /admin/coupons/:id] Error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update coupon' },
        { status: 400 }
      );
    }

    return NextResponse.json({ coupon: data });
  } catch (error) {
    console.error('[API /admin/coupons/:id] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin
    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid coupon ID' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServerClient();
    const { data, error } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('*, user_profiles(email, display_name)')
      .eq('coupon_id', id)
      .order('redeemed_at', { ascending: false });

    if (error) {
      console.error('[API /admin/coupons/:id/redemptions] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch redemptions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ redemptions: data || [] });
  } catch (error) {
    console.error('[API /admin/coupons/:id/redemptions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

