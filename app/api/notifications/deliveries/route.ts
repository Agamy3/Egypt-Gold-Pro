/**
 * Notification Deliveries API
 * 
 * GET: Get recent delivery history for user's rules
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const supabase = await createServerSupabaseClient();
    
    // Get deliveries for user's rules
    const { data: deliveries, error } = await supabase
      .from('notification_deliveries')
      .select(`
        *,
        user_notification_rules!inner(user_id, country, karat, side, currency, direction, threshold)
      `)
      .eq('user_notification_rules.user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ deliveries: deliveries || [] });
  } catch (error) {
    console.error('Notification deliveries GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

