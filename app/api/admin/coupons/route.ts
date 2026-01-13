/**
 * Admin Coupons API
 * 
 * GET /api/admin/coupons
 * POST /api/admin/coupons
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserStatus } from '@/lib/auth/getUserStatus';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const status = await getUserStatus();
    if (!status.isAdmin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const supabaseAdmin = createServerClient();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[API /admin/coupons GET] Error:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch coupons' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error) {
    console.error('[API /admin/coupons GET] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const status = await getUserStatus();
    if (!status.isAdmin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      code,
      description,
      is_active = true,
      max_redemptions,
      starts_at,
      expires_at,
      grants_premium = true,
      premium_days,
      unlock_features,
      notes,
    } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ ok: false, error: 'Coupon code is required' }, { status: 400 });
    }

    const supabaseAdmin = createServerClient();
    const normalizedCode = code.toUpperCase().trim();

    // Check if code already exists
    const { data: existing } = await supabaseAdmin
      .from('coupons')
      .select('id')
      .eq('code', normalizedCode)
      .single();

    if (existing) {
      return NextResponse.json({ ok: false, error: 'Coupon code already exists' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        code: normalizedCode,
        description: description || null,
        is_active,
        max_redemptions: max_redemptions || null,
        starts_at: starts_at || null,
        expires_at: expires_at || null,
        grants_premium,
        premium_days: premium_days || null,
        unlock_features: unlock_features || null,
        notes: notes || null,
        redeemed_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[API /admin/coupons POST] Error:', error);
      return NextResponse.json({ ok: false, error: error.message || 'Failed to create coupon' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error('[API /admin/coupons POST] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
