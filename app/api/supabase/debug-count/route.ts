/**
 * Supabase Debug Count API
 * 
 * Returns row counts from market_snapshots table for debugging
 * GET /api/supabase/debug-count
 */

import { NextResponse } from 'next/server';
import db from '@/lib/supabase';
import { NORMALIZED_SNAPSHOTS_TABLE } from '@/lib/supabase/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = db.supabase;

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    // Count rows in last 10 minutes
    const { count: rowsLast10m, error: error10m } = await supabase
      .from(NORMALIZED_SNAPSHOTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('market', 'egypt')
      .gte('created_at', tenMinutesAgo);

    // Count rows in last 60 minutes
    const { count: rowsLast60m, error: error60m } = await supabase
      .from(NORMALIZED_SNAPSHOTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('market', 'egypt')
      .gte('created_at', sixtyMinutesAgo);

    // Get latest created_at
    const { data: latest, error: latestError } = await supabase
      .from(NORMALIZED_SNAPSHOTS_TABLE)
      .select('created_at')
      .eq('market', 'egypt')
      .order('created_at', { ascending: false })
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
      .from(NORMALIZED_SNAPSHOTS_TABLE)
      .select('market, karat, price_egp, source, trusted, created_at')
      .eq('market', 'egypt')
      .order('created_at', { ascending: false })
      .limit(5);

    if (sampleError) {
      console.error('Error fetching sample rows:', sampleError);
    }

    return NextResponse.json({
      ok: true,
      rowsLast10m: rowsLast10m || 0,
      rowsLast60m: rowsLast60m || 0,
      latestCreatedAt: latest?.created_at || null,
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

