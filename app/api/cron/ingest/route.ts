/**
 * Cron Ingestion Endpoint
 * 
 * Fetches Egypt gold prices from iSagha and GoldBillion
 * and stores snapshots in the database
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/supabase';
import { fetchIsagha, fetchGoldBillion } from '@/lib/ingestion-adapters';
import { writeEgyptSnapshotToSupabase } from '@/lib/supabase/writeMarketSnapshot';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Generate hash from raw response for deduplication
 */
function generateHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
}

/**
 * Type-safe check if IngestionResult has any valid buy prices
 * Checks both direct fields (market21Buy, market24Buy) and prices map if available
 */
function hasValidBuyPrices(result: { market21Buy?: number | null; market24Buy?: number | null; prices?: Record<string, { buy?: number | null }> }): boolean {
  // Check prices map first (if available)
  if (result.prices && typeof result.prices === 'object') {
    const prices = Object.values(result.prices);
    return prices.some(price => {
      const buyPrice = typeof price === 'object' && price !== null ? price.buy : null;
      return typeof buyPrice === 'number' && isFinite(buyPrice) && buyPrice > 0;
    });
  }
  
  // Fallback to direct fields (for backward compatibility)
  return (
    (typeof result.market21Buy === 'number' && isFinite(result.market21Buy) && result.market21Buy > 0) ||
    (typeof result.market24Buy === 'number' && isFinite(result.market24Buy) && result.market24Buy > 0)
  );
}

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

  const results = {
    inserted: 0,
    errors: [] as Array<{ source: string; error: string }>,
    timestamp: Date.now(),
  };

  try {
    // Fetch all sources in parallel
    const [isaghaResult, goldBillionResult] = await Promise.all([
      fetchIsagha(),
      fetchGoldBillion(),
    ]);

    // Process iSagha result
    try {
      const rawHash = generateHash(isaghaResult.rawResponse);
      const now = Date.now();
      
      // Check for duplicate (same hash in last 5 minutes) using normalized schema
      const fiveMinutesAgoISO = new Date(now - 5 * 60 * 1000).toISOString();
      const { data: recentDuplicate } = await db.supabase
        .from('market_snapshots')
        .select('id')
        .eq('market', 'egypt')
        .eq('source', 'isagha')
        .eq('raw_hash', rawHash)
        .gte('created_at', fiveMinutesAgoISO)
        .limit(1)
        .maybeSingle();

      if (!recentDuplicate && !isaghaResult.error && hasValidBuyPrices(isaghaResult)) {
        // Write to normalized Supabase schema only
        // Extract prices from prices map if available, otherwise use direct fields
        const pricesMap = (isaghaResult as any).prices;
        const buy21 = pricesMap?.[21]?.buy ?? isaghaResult.market21Buy ?? null;
        const buy24 = pricesMap?.[24]?.buy ?? isaghaResult.market24Buy ?? null;
        const buy18 = pricesMap?.[18]?.buy ?? null;
        const buy14 = pricesMap?.[14]?.buy ?? null;
        
        try {
          const supabaseResult = await writeEgyptSnapshotToSupabase({
            source: 'isagha',
            trusted: false,
            createdAtMs: now,
            rawHash,
            prices: {
              14: { buy: buy14 },
              18: { buy: buy18 },
              21: { buy: buy21 },
              24: { buy: buy24 },
            },
          });
          if (supabaseResult.ok && supabaseResult.inserted && supabaseResult.inserted > 0) {
            results.inserted++;
            console.log(`[Cron] Inserted ${supabaseResult.inserted} rows for isagha`);
          } else {
            console.error('[Cron] Write failed for isagha:', supabaseResult.error);
          }
        } catch (supabaseError) {
          // Non-fatal: log and continue
          console.error('[Cron] Write exception for isagha:', supabaseError);
        }
      }
      
      // Add fetch errors to results
      if (isaghaResult.error) {
        results.errors.push({ source: 'isagha', error: isaghaResult.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push({ source: 'isagha', error: `DB insert failed: ${errorMessage}` });
      // Also add original fetch error if any
      if (isaghaResult.error) {
        results.errors.push({ source: 'isagha', error: isaghaResult.error });
      }
    }

    // Process GoldBillion result
    try {
      const rawHash = generateHash(goldBillionResult.rawResponse);
      const now = Date.now();
      
      // Check for duplicate (same hash in last 5 minutes) using normalized schema
      const fiveMinutesAgoISO = new Date(now - 5 * 60 * 1000).toISOString();
      const { data: recentDuplicate } = await db.supabase
        .from('market_snapshots')
        .select('id')
        .eq('market', 'egypt')
        .eq('source', 'goldbillion')
        .eq('raw_hash', rawHash)
        .gte('created_at', fiveMinutesAgoISO)
        .limit(1)
        .maybeSingle();

      if (!recentDuplicate && !goldBillionResult.error && hasValidBuyPrices(goldBillionResult)) {
        // Write to normalized Supabase schema only
        // Extract prices from prices map if available, otherwise use direct fields
        const pricesMap = (goldBillionResult as any).prices;
        const buy21 = pricesMap?.[21]?.buy ?? goldBillionResult.market21Buy ?? null;
        const buy24 = pricesMap?.[24]?.buy ?? goldBillionResult.market24Buy ?? null;
        const buy18 = pricesMap?.[18]?.buy ?? null;
        const buy14 = pricesMap?.[14]?.buy ?? null;
        
        try {
          const supabaseResult = await writeEgyptSnapshotToSupabase({
            source: 'goldbillion',
            trusted: false,
            createdAtMs: now,
            rawHash,
            prices: {
              14: { buy: buy14 },
              18: { buy: buy18 },
              21: { buy: buy21 },
              24: { buy: buy24 },
            },
          });
          if (supabaseResult.ok && supabaseResult.inserted && supabaseResult.inserted > 0) {
            results.inserted++;
            console.log(`[Cron] Inserted ${supabaseResult.inserted} rows for goldbillion`);
          } else {
            console.error('[Cron] Write failed for goldbillion:', supabaseResult.error);
          }
        } catch (supabaseError) {
          // Non-fatal: log and continue
          console.error('[Cron] Write exception for goldbillion:', supabaseError);
        }
      }
      
      // Add fetch errors to results
      if (goldBillionResult.error) {
        results.errors.push({ source: 'goldbillion', error: goldBillionResult.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push({ source: 'goldbillion', error: `DB insert failed: ${errorMessage}` });
      // Also add original fetch error if any
      if (goldBillionResult.error) {
        results.errors.push({ source: 'goldbillion', error: goldBillionResult.error });
      }
    }

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Cron ingestion error:', errorMessage);
    
    return NextResponse.json(
      {
        ...results,
        errors: [...results.errors, { source: 'system', error: errorMessage }],
      },
      { status: 500 }
    );
  }
}

