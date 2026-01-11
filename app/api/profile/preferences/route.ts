/**
 * User Preferences API
 * 
 * GET: Get user preferences
 * POST: Update user preferences
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
      .from('user_profiles')
      .select('preferred_country, preferred_currency')
      .eq('id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      preferred_country: data?.preferred_country || null,
      preferred_currency: data?.preferred_currency || null,
    });
  } catch (error) {
    console.error('Preferences GET error:', error);
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
    const { preferred_country, preferred_currency } = body;

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from('user_profiles')
      .update({
        preferred_country: preferred_country || null,
        preferred_currency: preferred_currency || null,
      })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Preferences POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

