/**
 * User Price Alert Rules API
 * 
 * GET: List user's price alert rules
 * POST: Create a new price alert rule
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
      .from('user_price_alert_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching price alert rules:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rules: data || [] });
  } catch (error) {
    console.error('Price alert rules GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { country, karat, direction, threshold_price, currency, enabled } = body;

    // Validation
    if (!country || !['EG', 'AE', 'SA', 'US'].includes(country)) {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
    }

    if (!karat || ![14, 18, 21, 22, 24].includes(karat)) {
      return NextResponse.json({ error: 'Invalid karat' }, { status: 400 });
    }

    if (!direction || !['above', 'below'].includes(direction)) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }

    if (!threshold_price || typeof threshold_price !== 'number' || threshold_price <= 0) {
      return NextResponse.json({ error: 'Invalid threshold_price' }, { status: 400 });
    }

    if (!currency || !['EGP', 'USD', 'AED', 'SAR'].includes(currency)) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_price_alert_rules')
      .insert({
        user_id: user.id,
        country,
        karat,
        direction,
        threshold_price,
        currency,
        enabled: enabled !== undefined ? enabled : true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating price alert rule:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('Price alert rules POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

