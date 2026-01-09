/**
 * Supabase Debug Count API
 * 
 * Returns row counts from market_snapshots_norm table for debugging
 * GET /api/supabase/debug-count?country=AE
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = db.supabase;
    const { searchParams } = new URL(request.url);
    const countryParam = searchParams.get('country');
    const country = (['EG', 'AE', 'SA', 'US'].includes(countryParam || '') 
      ? countryParam 
      : 'EG') as 'EG' | 'AE' | 'SA' | 'US';

    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const sixtyMinutesAgo = new Date(now - 60 * 60 * 1000).toISOString();

    // Determine source filter based on country
    let sourceFilter: string[] = [];
    if (country === 'EG') {
      sourceFilter = ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'];
    } else if (country === 'AE') {
      sourceFilter = ['goldprice_org_ae', 'global_parity'];
    } else if (country === 'SA') {
      sourceFilter = ['goldprice_org_sa', 'global_parity'];
    } else if (country === 'US') {
      sourceFilter = ['goldapi_spot'];
    }

    // Count rows in last 10 minutes (using created_at timestamptz)
    const { count: rowsLast10m, error: error10m } = await supabase
      .from('market_snapshots_norm')
      .select('*', { count: 'exact', head: true })
      .eq('country', country)
      .gte('created_at', tenMinutesAgo)
      .in('source', sourceFilter);

    // Count rows in last 60 minutes
    const { count: rowsLast60m, error: error60m } = await supabase
      .from('market_snapshots_norm')
      .select('*', { count: 'exact', head: true })
      .eq('country', country)
      .gte('created_at', sixtyMinutesAgo)
      .in('source', sourceFilter);

    // Get latest created_at
    const { data: latest, error: latestError } = await supabase
      .from('market_snapshots_norm')
      .select('created_at')
      .eq('country', country)
      .in('source', sourceFilter)
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

    // Get sample rows (latest 10)
    const { data: sampleRows, error: sampleError } = await supabase
      .from('market_snapshots_norm')
      .select('source, karat, price, currency, created_at')
      .eq('country', country)
      .in('source', sourceFilter)
      .order('created_at', { ascending: false })
      .limit(10);

    if (sampleError) {
      console.error('Error fetching sample rows:', sampleError);
    }

    const latestCreatedAtISO = latest?.created_at || null;
    const latestCreatedAtMs = latestCreatedAtISO ? new Date(latestCreatedAtISO).getTime() : null;
    const minutesAgo = latestCreatedAtMs ? (now - latestCreatedAtMs) / (60 * 1000) : null;

    return NextResponse.json({
      ok: true,
      country,
      rowsLast10m: rowsLast10m || 0,
      rowsLast60m: rowsLast60m || 0,
      latestCreatedAt: latestCreatedAtMs,
      latestCreatedAtISO: latestCreatedAtISO,
      minutesAgo: minutesAgo,
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

