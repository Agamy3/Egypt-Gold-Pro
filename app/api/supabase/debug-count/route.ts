/**
 * Supabase Debug Count API
 * 
 * Returns row counts from market_snapshots table for debugging
 * GET /api/supabase/debug-count
 */

import { NextResponse } from 'next/server';
import db from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = db.supabase;

    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const sixtyMinutesAgo = now - 60 * 60 * 1000;
    const tenMinutesAgoISO = new Date(tenMinutesAgo).toISOString();
    const sixtyMinutesAgoISO = new Date(sixtyMinutesAgo).toISOString();

    // Count rows in last 10 minutes (using createdAt as timestamptz, use ISO string)
    const { count: rowsLast10m, error: error10m } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', tenMinutesAgoISO)
      .is('error', null);

    // Count rows in last 60 minutes
    const { count: rowsLast60m, error: error60m } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', sixtyMinutesAgoISO)
      .is('error', null);

    // Get latest createdAt
    const { data: latest, error: latestError } = await supabase
      .from('market_snapshots')
      .select('createdAt')
      .is('error', null)
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error10m || error60m || latestError) {
      const errors = [error10m, error60m, latestError].filter(Boolean);
      return NextResponse.json(
        {
          ok: false,
          error: errors.map(e => e?.message).join('; '),
          timestamp: Date.now(),
        },
        { status: 500 }
      );
    }

    // Get sample rows (latest 5)
    const { data: sampleRows, error: sampleError } = await supabase
      .from('market_snapshots')
      .select('source, createdAt, market21Buy, market24Buy, market18Buy, market14Buy')
      .is('error', null)
      .order('createdAt', { ascending: false })
      .limit(5);

    if (sampleError) {
      console.error('Error fetching sample rows:', sampleError);
    }

    return NextResponse.json({
      ok: true,
      rowsLast10m: rowsLast10m || 0,
      rowsLast60m: rowsLast60m || 0,
      latestCreatedAt: latest?.createdAt || null,
      sampleRows: sampleRows || [],
      timestamp: Date.now(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Supabase debug count error:', errorMessage);

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

