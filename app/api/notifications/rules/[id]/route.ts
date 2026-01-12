/**
 * Single Notification Rule API
 * 
 * PATCH: Update notification rule
 * DELETE: Delete notification rule
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

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

    const body = await request.json();
    const updateData: any = {};

    if (body.country !== undefined) {
      if (!['EG', 'AE', 'SA', 'US'].includes(body.country)) {
        return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
      }
      updateData.country = body.country;
    }
    if (body.karat !== undefined) {
      if (![14, 18, 21, 24].includes(body.karat)) {
        return NextResponse.json({ error: 'Invalid karat' }, { status: 400 });
      }
      updateData.karat = body.karat;
    }
    if (body.side !== undefined) {
      if (!['buy', 'sell'].includes(body.side)) {
        return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
      }
      updateData.side = body.side;
    }
    if (body.currency !== undefined) {
      if (!['EGP', 'USD', 'AED', 'SAR'].includes(body.currency)) {
        return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
      }
      updateData.currency = body.currency;
    }
    if (body.direction !== undefined) {
      if (!['above', 'below'].includes(body.direction)) {
        return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
      }
      updateData.direction = body.direction;
    }
    if (body.threshold !== undefined) {
      if (typeof body.threshold !== 'number' || body.threshold <= 0) {
        return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 });
      }
      updateData.threshold = body.threshold;
    }
    if (body.cooldown_minutes !== undefined) {
      if (typeof body.cooldown_minutes !== 'number' || body.cooldown_minutes < 0) {
        return NextResponse.json({ error: 'Invalid cooldown_minutes' }, { status: 400 });
      }
      updateData.cooldown_minutes = body.cooldown_minutes;
    }
    if (body.enabled !== undefined) {
      updateData.enabled = Boolean(body.enabled);
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_notification_rules')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('Notification rule PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from('user_notification_rules')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Notification rule DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

