/**
 * Health API Endpoint
 * 
 * GET /api/health - Returns service health status
 */

import { NextResponse } from 'next/server';
import db from '@/lib/supabase';
import { SOURCE_WEIGHTS } from '@/lib/gold-ingestion-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Track last run time (in-memory, or could use DB)
let lastRunTimestamp: number | null = null;

export async function GET() {
  try {
    // Count valid sources (sources with valid data in last 10 minutes)
    const windowStart = Date.now() - 10 * 60 * 1000;
    
    // Query for sources with valid data (at least one karat price is not null)
    const { data: validSources, error: queryError } = await db.supabase
      .from('market_snapshots')
      .select('source')
      .gt('createdAt', windowStart)
      .is('error', null)
      .or('market24Buy.not.is.null,market21Buy.not.is.null,market18Buy.not.is.null,market14Buy.not.is.null');

    if (queryError) {
      throw new Error(`Query error: ${queryError.message}`);
    }

    // Get distinct sources
    const uniqueSources = new Set((validSources || []).map((s: any) => s.source));
    const numSourcesOk = uniqueSources.size;
    
    // Count total expected sources
    const totalSources = Object.keys(SOURCE_WEIGHTS).length;
    const numSourcesErrors = totalSources - numSourcesOk;

    return NextResponse.json({
      status: 'running',
      last_run_ts: lastRunTimestamp,
      num_sources_ok: numSourcesOk,
      num_sources_errors: numSourcesErrors,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Health API error:', errorMessage);
    
    return NextResponse.json(
      {
        status: 'error',
        error: errorMessage,
        last_run_ts: lastRunTimestamp,
        num_sources_ok: 0,
        num_sources_errors: 0,
      },
      { status: 500 }
    );
  }
}

