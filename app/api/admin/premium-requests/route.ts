/**
 * Admin Premium Requests API
 * 
 * GET /api/admin/premium-requests
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
    const statusFilter = searchParams.get('status'); // pending, approved, rejected

    const supabaseAdmin = createServerClient();
    let query = supabaseAdmin
      .from('premium_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[API /admin/premium-requests GET] Error:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch requests' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error) {
    console.error('[API /admin/premium-requests GET] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

