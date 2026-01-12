/**
 * Push Subscription Endpoint
 * 
 * POST /api/notifications/push/subscribe
 * Requires authenticated user
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

    const body = await request.json();
    const { endpoint, keys } = body;

    // Validate subscription data
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Invalid push subscription: missing endpoint' }, { status: 400 });
    }

    if (!keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json({ error: 'Invalid push subscription: missing keys' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Store subscription in push_subscriptions table (used by price change cron)
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          content_encoding: 'aes128gcm',
        },
        { onConflict: 'endpoint' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving push subscription:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, subscription: data });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

