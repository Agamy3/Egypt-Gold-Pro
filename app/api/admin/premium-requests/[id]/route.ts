/**
 * Admin Premium Request Management API
 * 
 * PATCH /api/admin/premium-requests/:id
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
      return NextResponse.json({ ok: false, error: 'Invalid request ID' }, { status: 400 });
    }

    const body = await request.json();
    const { action, premium_days = 30, admin_note } = body;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ ok: false, error: 'Invalid action. Must be "approve" or "reject"' }, { status: 400 });
    }

    const supabaseAdmin = createServerClient();

    // Get the request
    const { data: requestData, error: requestError } = await supabaseAdmin
      .from('premium_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
    }

    const updates: any = {
      status: action === 'approve' ? 'approved' : 'rejected',
      admin_note: admin_note || null,
    };

    // Update request status
    const { error: updateError } = await supabaseAdmin
      .from('premium_requests')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      console.error('[API /admin/premium-requests/:id PATCH] Error updating request:', updateError);
      return NextResponse.json({ ok: false, error: 'Failed to update request' }, { status: 500 });
    }

    // If approved and user_id exists, apply premium
    if (action === 'approve' && requestData.user_id) {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + premium_days);

      const { error: premiumError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          is_premium: true,
          premium_expires_at: expiresAt.toISOString(),
        })
        .eq('id', requestData.user_id);

      if (premiumError) {
        console.error('[API /admin/premium-requests/:id PATCH] Error applying premium:', premiumError);
        // Don't fail the request update, but log the error
      }
    }

    return NextResponse.json({ ok: true, data: { ...requestData, ...updates } });
  } catch (error) {
    console.error('[API /admin/premium-requests/:id PATCH] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

