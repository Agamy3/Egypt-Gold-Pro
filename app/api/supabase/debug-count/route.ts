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

    // Count rows in last 10 minutes (createdAt is bigint, use number)
    // Only count local market sources (same as forecast query)
    const { count: rowsLast10m, error: error10m } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', tenMinutesAgo)
      .is('error', null)
      .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);

    // Count rows in last 60 minutes (only local market sources)
    const { count: rowsLast60m, error: error60m } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true })
      .gte('createdAt', sixtyMinutesAgo)
      .is('error', null)
      .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated']);

    // Get latest createdAt (only local market sources)
    const { data: latest, error: latestError } = await supabase
      .from('market_snapshots')
      .select('createdAt')
      .is('error', null)
      .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'])
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

    // Get sample rows (latest 10) - include aggregated source
    const { data: sampleRows, error: sampleError } = await supabase
      .from('market_snapshots')
      .select('source, createdAt, market21Buy, market24Buy, market18Buy, market14Buy')
      .is('error', null)
      .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'])
      .order('createdAt', { ascending: false })
      .limit(10);

    if (sampleError) {
      console.error('Error fetching sample rows:', sampleError);
    }

    const latestCreatedAtMs = latest?.createdAt ? (typeof latest.createdAt === 'number' ? latest.createdAt : new Date(latest.createdAt).getTime()) : null;
    const minutesAgo = latestCreatedAtMs ? (now - latestCreatedAtMs) / (60 * 1000) : null;

    // Count unique time buckets (10-second buckets) in last 7 days to match forecast
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const { data: allRecentRows, error: recentError } = await supabase
      .from('market_snapshots')
      .select('createdAt')
      .gte('createdAt', sevenDaysAgo)
      .is('error', null)
      .in('source', ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'])
      .or('market21Buy.not.is.null,market24Buy.not.is.null');
    
    let uniqueBuckets = 0;
    if (!recentError && allRecentRows) {
      // Group by 10-second buckets (same as forecast)
      const buckets = new Set<number>();
      for (const row of allRecentRows) {
        const createdAt = typeof row.createdAt === 'number' ? row.createdAt : new Date(row.createdAt).getTime();
        const bucket = Math.floor(createdAt / 10000) * 10000; // 10-second bucket
        buckets.add(bucket);
      }
      uniqueBuckets = buckets.size;
    }

    return NextResponse.json({
      ok: true,
      rowsLast10m: rowsLast10m || 0,
      rowsLast60m: rowsLast60m || 0,
      latestCreatedAt: latestCreatedAtMs,
      latestCreatedAtISO: latestCreatedAtMs ? new Date(latestCreatedAtMs).toISOString() : null,
      minutesAgo: minutesAgo,
      sampleRows: sampleRows || [],
      hasAggregated: sampleRows?.some(row => row.source === 'aggregated') || false,
      // Forecast-equivalent count: unique 10-second buckets in last 7 days
      forecastDataPoints: uniqueBuckets,
      totalRowsLast7Days: allRecentRows?.length || 0,
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

