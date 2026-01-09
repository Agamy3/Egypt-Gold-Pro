/**
 * Supabase Health Check API
 * 
 * Tests Supabase connection by querying market_snapshots table
 * GET /api/supabase/health
 */

import { NextResponse } from 'next/server';
import db from '@/lib/supabase';
import { checkSupabaseWrite } from '@/lib/supabase/snapshots';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = db.supabase;

    // Check all required tables exist by selecting 1 row from each
    const checks = {
      market_snapshots: false,
      source_staleness: false,
      gold_spot: false,
      egypt_market: false,
    };

    const errors: Record<string, string> = {};

    // Check market_snapshots table - validate table exists with wide schema
    const { error: msError, data: msData } = await supabase
      .from('market_snapshots')
      .select('id, source, createdAt')
      .limit(1)
      .maybeSingle();
    
    if (msError) {
      // Check if it's a "table doesn't exist" error vs other error
      if (msError.message.includes('does not exist') || msError.message.includes('relation') || msError.code === '42P01') {
        errors.market_snapshots = 'Table does not exist or schema mismatch';
      } else {
        errors.market_snapshots = msError.message;
      }
    } else {
      // Table exists - validate it has the expected columns by checking the data structure
      checks.market_snapshots = true;
    }

    // Check source_staleness table exists with correct schema
    // Try both camelCase and snake_case column names for compatibility
    const { error: ssError } = await supabase
      .from('source_staleness')
      .select('id, source, karat')
      .limit(1)
      .maybeSingle();
    
    if (ssError) {
      errors.source_staleness = ssError.message;
    } else {
      checks.source_staleness = true;
    }

    // Check gold_spot
    const { error: gsError } = await supabase
      .from('gold_spot')
      .select('id')
      .limit(1)
      .maybeSingle();
    
    if (gsError) {
      errors.gold_spot = gsError.message;
    } else {
      checks.gold_spot = true;
    }

    // Check egypt_market (legacy, optional)
    const { error: emError } = await supabase
      .from('egypt_market')
      .select('id')
      .limit(1)
      .maybeSingle();
    
    if (emError) {
      errors.egypt_market = emError.message;
    } else {
      checks.egypt_market = true;
    }

    // All core tables must exist (egypt_market is optional/legacy)
    const allCoreTablesExist = checks.market_snapshots && checks.source_staleness && checks.gold_spot;

    if (!allCoreTablesExist) {
      return NextResponse.json(
        {
          ok: false,
          checks,
          errors,
          timestamp: Date.now(),
          message: 'One or more required tables are missing or inaccessible',
        },
        { status: 500 }
      );
    }

    // Check write status and recent inserts
    const writeStatus = await checkSupabaseWrite();
    
    // Get count of recent snapshots (last 10 minutes)
    let recentSnapshotCount = 0;
    try {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      const { count, error: countError } = await supabase
        .from('market_snapshots')
        .select('*', { count: 'exact', head: true })
        .gte('createdAt', tenMinutesAgo) // createdAt is bigint, use epoch ms number
        .is('error', null);
      
      if (!countError && count !== null) {
        recentSnapshotCount = count;
      }
    } catch (error) {
      // Ignore count errors
    }

    return NextResponse.json({
      ok: true,
      checks,
      write: writeStatus,
      recentSnapshotCount,
      timestamp: Date.now(),
      message: 'All required Supabase tables are accessible',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Supabase health check exception:', errorMessage);

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

