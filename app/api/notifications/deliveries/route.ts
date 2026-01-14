/**
 * Notification Deliveries API
 * 
 * GET: Get recent delivery history from notification_deliveries_log
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
    
    // Get deliveries from notification_deliveries_log for this user
    const { data: deliveries, error } = await supabase
      .from('notification_deliveries_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching deliveries:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ deliveries: deliveries || [] });
  } catch (error) {
    console.error('Notification deliveries GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
