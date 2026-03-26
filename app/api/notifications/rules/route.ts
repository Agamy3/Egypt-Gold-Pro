/**
 * Notification Rules API
 * 
 * GET /api/notifications/rules
 * POST /api/notifications/rules
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[RULES] Error fetching rules:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rules: data || [] });
  } catch (error) {
    console.error('[RULES] GET error:', error);
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
      type,
      country,
      karat,
      direction,
      threshold_value,
      pct_threshold,
      one_time,
      enabled = true,
      channel_inapp = true,
      channel_push = false,
      channel_email = false,
      channel_telegram = false,
      schedule_cron,
    } = body;

    // Validation
    if (!type) {
      return NextResponse.json({ error: 'Type is required' }, { status: 400 });
    }

    // Auto-set one_time for certain types
    const autoOneTime = type === 'price_threshold_cross' || type === 'portfolio_pl_pct';
    const finalOneTime = one_time !== undefined ? one_time : autoOneTime;

    const supabase = await createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from('notification_rules')
      .insert({
        user_id: user.id,
        type,
        country: country || null,
        karat: karat || null,
        direction: direction || null,
        threshold_value: threshold_value || null,
        pct_threshold: pct_threshold || null,
        one_time: finalOneTime,
        enabled,
        channel_inapp,
        channel_push,
        channel_email,
        channel_telegram,
        schedule_cron: schedule_cron || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[RULES] Error creating rule:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('[RULES] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
