/**
 * Cron Ingestion Endpoint
 * 
 * Fetches Egypt gold prices from local market sources:
 * - banklive, gold_era, dokangold, goldrate24, goldbullioneg
 * Uses weighted averages and stores snapshots in Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { runIngestionCycle } from '@/lib/gold-ingestion-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Guard: Check CRON_SECRET (with dev mode exception)
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const providedSecret = 
    request.headers.get('x-cron-secret') || 
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    request.nextUrl.searchParams.get('secret');

  // In development: allow requests without secret or with 'dev' secret
  if (isDevelopment) {
    // Allow if no secret provided, secret is 'dev', or secret matches CRON_SECRET (if set)
    if (providedSecret && providedSecret !== 'dev' && cronSecret && providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid secret. In development, use no secret, secret=dev, or set CRON_SECRET env var' },
        { status: 401 }
      );
    }
    // Otherwise allow (no secret, secret='dev', or matches CRON_SECRET)
  } else {
    // Production: strict validation
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET environment variable not configured' },
        { status: 500 }
      );
    }

    // Allow Vercel Cron requests (they send x-vercel-signature) or valid secret
    const isVercelCron = request.headers.get('x-vercel-signature') !== null;
    
    if (!isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing CRON_SECRET. Provide valid secret in x-cron-secret header, Authorization: Bearer <secret>, or ?secret=<secret> query param' },
        { status: 401 }
      );
    }
  }

  try {
    // Use the local market data ingestion engine instead of outdated iSagha/GoldBillion
    // This uses sources: banklive, gold_era, dokangold, goldrate24, goldbullioneg
    console.log('[Cron] Starting local market data ingestion...');
    const ingestionResult = await runIngestionCycle();
    
    // Count how many sources were successfully ingested AND written to DB
    // Check the breakdown to see which sources have valid data
    const sourcesWithData = Object.values(ingestionResult.breakdown).flatMap(karatData => 
      Object.keys(karatData).filter(source => karatData[source].valid && karatData[source].buy !== null)
    );
    const uniqueSources = new Set(sourcesWithData);
    
    // Also check if aggregated data exists (should always be written)
    const hasAggregatedData = ingestionResult.our_price_buy && Object.values(ingestionResult.our_price_buy).some(price => price !== null);
    
    const results = {
      inserted: uniqueSources.size + (hasAggregatedData ? 1 : 0), // Count individual sources + aggregated
      sourcesProcessed: uniqueSources.size,
      sourcesUsed: Array.from(uniqueSources),
      hasAggregated: hasAggregatedData,
      numSourcesOk: ingestionResult.num_sources_ok,
      numSourcesErrors: ingestionResult.num_sources_errors,
      errors: ingestionResult.errors.map(err => ({ source: 'ingestion', error: err })),
      timestamp: Date.now(),
      confidence: ingestionResult.confidence,
      prices: ingestionResult.our_price_buy,
    };

    console.log('[Cron] Ingestion complete:', {
      sourcesOk: ingestionResult.num_sources_ok,
      sourcesErrors: ingestionResult.num_sources_errors,
      uniqueSources: Array.from(uniqueSources),
    });

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Cron ingestion error:', errorMessage);
    
    return NextResponse.json(
      {
        inserted: 0,
        sourcesProcessed: 0,
        sourcesUsed: [],
        numSourcesOk: 0,
        numSourcesErrors: 0,
        errors: [{ source: 'system', error: errorMessage }],
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

