/**
 * Country Watchlist API
 * 
 * GET /api/notifications/watchlist
 * POST /api/notifications/watchlist
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
      .from('user_country_watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WATCHLIST] Error fetching watchlist:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ watchlist: data || [] });
  } catch (error) {
    console.error('[WATCHLIST] GET error:', error);
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
    const { country, enabled } = body;

    if (!country || !['EG', 'AE', 'SA', 'US'].includes(country)) {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from('user_country_watchlist')
      .upsert(
        {
          user_id: user.id,
          country,
          enabled: enabled !== undefined ? enabled : true,
        },
        { onConflict: 'user_id,country' }
      )
      .select()
      .single();

    if (error) {
      console.error('[WATCHLIST] Error updating watchlist:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ watchlist: data });
  } catch (error) {
    console.error('[WATCHLIST] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

