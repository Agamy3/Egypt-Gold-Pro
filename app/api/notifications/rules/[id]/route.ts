/**
 * Notification Rule by ID API
 * 
 * PATCH /api/notifications/rules/:id
 * DELETE /api/notifications/rules/:id
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id: idParam } = await params;
    const ruleId = parseInt(idParam, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json({ error: 'Invalid rule ID' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    // First verify the rule belongs to the user
    const { data: existing } = await supabase
      .from('notification_rules')
      .select('id')
      .eq('id', ruleId)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Update the rule
    const { data, error } = await supabase
      .from('notification_rules')
      .update(body)
      .eq('id', ruleId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[RULES] Error updating rule:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('[RULES] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: idParam } = await params;
    const ruleId = parseInt(idParam, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json({ error: 'Invalid rule ID' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    const { error } = await supabase
      .from('notification_rules')
      .delete()
      .eq('id', ruleId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[RULES] Error deleting rule:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RULES] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
