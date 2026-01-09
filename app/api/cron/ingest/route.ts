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

      if (!recentDuplicate && !isaghaResult.error && (isaghaResult.market21Buy || isaghaResult.market24Buy)) {
        // Write to normalized Supabase schema only
        try {
          const supabaseResult = await writeEgyptSnapshotToSupabase({
            source: 'isagha',
            trusted: false,
            createdAtMs: now,
            rawHash,
            prices: {
              14: { buy: null }, // iSagha doesn't provide 14k
              18: { buy: null }, // iSagha doesn't provide 18k
              21: { buy: isaghaResult.market21Buy || null },
              24: { buy: isaghaResult.market24Buy || null },
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

      if (!recentDuplicate && !goldBillionResult.error && (goldBillionResult.market21Buy || goldBillionResult.market24Buy)) {
        // Write to normalized Supabase schema only
        try {
          const supabaseResult = await writeEgyptSnapshotToSupabase({
            source: 'goldbillion',
            trusted: false,
            createdAtMs: now,
            rawHash,
            prices: {
              14: { buy: null }, // GoldBillion doesn't provide 14k
              18: { buy: null }, // GoldBillion doesn't provide 18k
              21: { buy: goldBillionResult.market21Buy || null },
              24: { buy: goldBillionResult.market24Buy || null },
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

