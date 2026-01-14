/**
 * User Price Alert Rule API (single rule)
 * 
 * PATCH: Update a price alert rule
 * DELETE: Delete a price alert rule
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ruleId = parseInt(params.id, 10);
    if (isNaN(ruleId)) {
      return NextResponse.json({ error: 'Invalid rule ID' }, { status: 400 });
    }

    const body = await request.json();
    const updates: any = {};

    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }

    if (body.threshold_price !== undefined) {
      if (typeof body.threshold_price !== 'number' || body.threshold_price <= 0) {
        return NextResponse.json({ error: 'Invalid threshold_price' }, { status: 400 });
      }
      updates.threshold_price = body.threshold_price;
    }

    if (body.direction !== undefined) {
      if (!['above', 'below'].includes(body.direction)) {
        return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
      }
      updates.direction = body.direction;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    // First verify the rule belongs to the user
    const { data: existing } = await supabase
      .from('user_price_alert_rules')
      .select('id')
      .eq('id', ruleId)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('user_price_alert_rules')
      .update(updates)
      .eq('id', ruleId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating price alert rule:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('Price alert rule PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ruleId = parseInt(params.id, 10);
    if (isNaN(ruleId)) {
      return NextResponse.json({ error: 'Invalid rule ID' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from('user_price_alert_rules')
      .delete()
      .eq('id', ruleId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting price alert rule:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Price alert rule DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

