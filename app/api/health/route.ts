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
const lastRunTimestamp: number | null = null;

export async function GET() {
  try {
    // Count valid sources (sources with valid data in last 10 minutes)
    const windowStart = Date.now() - 10 * 60 * 1000;
    let sourceCheckTable: 'wide' | 'norm' = 'wide';
    
    // Query for sources with valid data using normalized schema
    const { data: validSources, error: queryError } = await db.supabase
      .from('market_snapshots')
      .select('source')
      .gte('createdAt', windowStart)
      .is('error', null)
      .or('market21Buy.not.is.null,market24Buy.not.is.null');

    if (queryError) {
      throw new Error(`Query error: ${queryError.message}`);
    }

    // Get distinct sources
    const uniqueSources = new Set((validSources || []).map((s: any) => s.source));
    let numSourcesOk = uniqueSources.size;
    
    // If wide table has no recent valid inserts, fall back to normalized table
    // (homepage uses normalized schema for market medians).
    if (numSourcesOk === 0) {
      const windowStartISO = new Date(windowStart).toISOString();
      const { data: validNormSources, error: normError } = await db.supabase
        .from('market_snapshots_norm')
        .select('source')
        .eq('country', 'EG')
        .gte('created_at', windowStartISO)
        .in('karat', [21, 24])
        .gt('price', 0);

      if (normError) {
        console.error('[Health] Norm table query error:', normError);
      } else {
        const uniqueNormSources = new Set((validNormSources || []).map((s: any) => s.source));
        numSourcesOk = uniqueNormSources.size;
        sourceCheckTable = 'norm';
      }
    }
    
    // Count total expected sources
    const totalSources = Object.keys(SOURCE_WEIGHTS).length;
    const numSourcesErrors = totalSources - numSourcesOk;

    return NextResponse.json({
      status: 'running',
      last_run_ts: lastRunTimestamp,
      num_sources_ok: numSourcesOk,
      num_sources_errors: numSourcesErrors,
      source_check_table: sourceCheckTable,
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

