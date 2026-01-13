/**
 * Premium Request API
 * 
 * POST /api/premium/request
 */

import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, country, message } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const user = await getServerUser();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('premium_requests')
      .insert({
        user_id: user?.id || null,
        email: email.trim().toLowerCase(),
        country: country || null,
        message: message || null,
        status: 'pending',
      });

    if (error) {
      console.error('[API /premium/request] Error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to submit request' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API /premium/request] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

