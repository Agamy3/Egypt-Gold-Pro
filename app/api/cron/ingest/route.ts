/**
 * Cron Ingestion Endpoint
 * 
 * Fetches Egypt gold prices from local market sources:
 * - banklive, gold_era, dokangold, goldrate24, goldbullioneg
 * Uses weighted averages and stores snapshots in Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMultiCountryIngestionCycle } from '@/lib/gold-ingestion-engine';

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
    // Production: Vercel Cron authentication
    // Vercel cron jobs automatically include Authorization header with CRON_SECRET if configured
    // We need to verify the secret matches, or allow if it's a Vercel internal request
    
    // Check if this is a Vercel internal cron request (they add x-vercel-id header)
    const isVercelCron = request.headers.get('x-vercel-id') !== null;
    
    if (isVercelCron) {
      // Vercel cron request - allow it (Vercel handles authentication)
      console.log('[Cron] Vercel cron request detected (x-vercel-id present)');
    } else if (cronSecret) {
      // Manual request - require valid CRON_SECRET
      if (providedSecret !== cronSecret) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid or missing CRON_SECRET. For Vercel cron, ensure CRON_SECRET is set in environment variables.' },
          { status: 401 }
        );
      }
    } else {
      // No CRON_SECRET configured - log warning but allow (might be first-time setup)
      console.warn('[Cron] CRON_SECRET not configured. Consider setting it in Vercel environment variables for security.');
    }
  }

  try {
    // Run multi-country ingestion (EG, AE, SA, US)
    console.log('[Cron] Starting multi-country ingestion cycle...');
    const multiCountryResult = await runMultiCountryIngestionCycle();

    // Aggregate results
    const allErrors: Array<{ source: string; error: string }> = [];
    for (const [country, result] of Object.entries(multiCountryResult.results)) {
      result.errors.forEach(err => allErrors.push({ source: country, error: err }));
    }
    
    const results = {
      inserted: multiCountryResult.totalInserted,
      countriesProcessed: Object.keys(multiCountryResult.results).length,
      countryResults: multiCountryResult.results,
      errors: allErrors.length > 0 ? allErrors : undefined,
      timestamp: Date.now(),
    };

    console.log('[Cron] Multi-country ingestion complete:', {
      totalInserted: multiCountryResult.totalInserted,
      countries: Object.keys(multiCountryResult.results),
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

