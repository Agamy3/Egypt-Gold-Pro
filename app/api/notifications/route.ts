/**
 * Notifications API
 * 
 * GET: List user's notifications
 * POST: Create new notification
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ notifications: data || [] });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { country, karat, direction, threshold_value, currency, channel, enabled } = body;

    // Validation
    if (!country || !['EG', 'AE', 'SA', 'US'].includes(country)) {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
    }
    if (!karat || ![14, 18, 21, 24].includes(karat)) {
      return NextResponse.json({ error: 'Invalid karat' }, { status: 400 });
    }
    if (!direction || !['above', 'below'].includes(direction)) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }
    if (typeof threshold_value !== 'number' || threshold_value <= 0) {
      return NextResponse.json({ error: 'Invalid threshold_value' }, { status: 400 });
    }
    if (!currency || !['EGP', 'USD', 'AED', 'SAR'].includes(currency)) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_notifications')
      .insert({
        user_id: user.id,
        country,
        karat,
        rule_type: 'price_threshold',
        direction,
        threshold_value,
        currency,
        channel: channel || 'email',
        enabled: enabled !== undefined ? enabled : true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ notification: data });
  } catch (error) {
    console.error('Notifications POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

