/**
 * Activity Ping Endpoint
 * 
 * POST /api/activity/ping
 * Updates user's last_seen_at timestamp
 * Call from client every 60 seconds when logged in
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Upsert user activity
    const { error } = await supabase
      .from('user_activity')
      .upsert(
        {
          user_id: user.id,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[ACTIVITY] Error updating activity:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ACTIVITY] Ping error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

