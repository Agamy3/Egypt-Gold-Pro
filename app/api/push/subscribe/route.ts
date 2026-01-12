/**
 * Web Push Subscribe API
 * 
 * POST: Subscribe user to push notifications
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Check if subscription already exists
    const { data: existing } = await supabase
      .from('web_push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, message: 'Subscription already exists' });
    }

    // Insert new subscription
    const { error } = await supabase
      .from('web_push_subscriptions')
      .insert({
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: request.headers.get('user-agent') || null,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

