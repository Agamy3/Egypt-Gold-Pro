/**
 * Notification Rules API
 * 
 * GET: List user's notification rules
 * POST: Create new notification rule
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
    
    const { data: rules, error } = await supabase
      .from('user_notification_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (error) {
    console.error('Notification rules GET error:', error);
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
    const {
      country,
      karat,
      side,
      currency,
      direction,
      threshold,
      cooldown_minutes,
      enabled,
    } = body;

    // Validation
    if (!country || !['EG', 'AE', 'SA', 'US'].includes(country)) {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
    }
    if (!karat || ![14, 18, 21, 24].includes(karat)) {
      return NextResponse.json({ error: 'Invalid karat' }, { status: 400 });
    }
    if (side && !['buy', 'sell'].includes(side)) {
      return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
    }
    if (!currency || !['EGP', 'USD', 'AED', 'SAR'].includes(currency)) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }
    if (!direction || !['above', 'below'].includes(direction)) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }
    if (typeof threshold !== 'number' || threshold <= 0) {
      return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_notification_rules')
      .insert({
        user_id: user.id,
        country,
        karat,
        side: side || 'buy',
        currency,
        direction,
        threshold,
        cooldown_minutes: cooldown_minutes || 180,
        enabled: enabled !== undefined ? enabled : true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('Notification rules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

