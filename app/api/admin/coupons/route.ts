/**
 * Admin Coupons API
 * 
 * GET /api/admin/coupons?limit=100
 * POST /api/admin/coupons/create
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/isAdmin';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Check admin
    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
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
      console.error('[API /admin/coupons] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch coupons' },
        { status: 500 }
      );
    }

    return NextResponse.json({ coupons: data || [] });
  } catch (error) {
    console.error('[API /admin/coupons] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin
    const admin = await isAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      code,
      active = true,
      max_redemptions,
      starts_at,
      ends_at,
      note,
      effect = {},
    } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Coupon code is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServerClient();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        code: code.toUpperCase().trim(),
        active,
        max_redemptions: max_redemptions || null,
        starts_at: starts_at || null,
        ends_at: ends_at || null,
        note: note || null,
        effect,
      })
      .select()
      .single();

    if (error) {
      console.error('[API /admin/coupons] Error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create coupon' },
        { status: 400 }
      );
    }

    return NextResponse.json({ coupon: data });
  } catch (error) {
    console.error('[API /admin/coupons] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

