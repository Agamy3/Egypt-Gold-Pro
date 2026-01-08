/**
 * Market Snapshot API
 * 
 * Returns aggregated market data with pricing calculations
 * Frontend polls this every 30 seconds
 */

import { NextResponse } from 'next/server';
import { getImpliedOunceWithCache } from '@/lib/goldapi';
import { calculatePricing } from '@/lib/pricing';
import { getUsdEgpRate } from '@/lib/fx';
import { getEgyptMarketMedians, getActiveSourceCount } from '@/lib/supabase/queries';

// Trusted source configuration (safe defaults, no undefined errors)
function getTrustedMode(request: Request): boolean {
  // Check for client override in header or query param
  const url = new URL(request.url);
  const queryOverride = url.searchParams.get('trustedMode');
  if (queryOverride !== null) {
    return queryOverride === 'true';
  }
  
  // Check header override
  const headerOverride = request.headers.get('x-trusted-mode');
  if (headerOverride !== null) {
    return headerOverride === 'true';
  }
  
  // Fall back to environment variables
  return (
    process.env.EGYPT_TRUSTED_ONLY_MODE === 'true' ||
    process.env.NEXT_PUBLIC_EGYPT_TRUSTED_ONLY_MODE === 'true'
  );
}

const TRUSTED_EGYPT_SOURCES = new Set(['goldbullioneg']);
const isTrustedEgyptSource = (sourceKey: string, trustedMode: boolean): boolean => {
  if (!trustedMode) return true; // If mode is off, all sources are trusted
  return TRUSTED_EGYPT_SOURCES.has(sourceKey);
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const errors: Array<{ source: string; message: string }> = [];
  
  // Get trusted mode (check for client override)
  const EGYPT_TRUSTED_ONLY_MODE = getTrustedMode(request);
  
  try {
    // Fetch Egypt Market Implied Ounce with individual error handling
    let impliedOunce = null;
    let impliedOunceStale = false;
    try {
      const impliedOunceResult = await getImpliedOunceWithCache();
      if (impliedOunceResult.error) {
        console.error('Market snapshot error: Egypt Market Implied Ounce fetch failed -', impliedOunceResult.error.message);
        errors.push({ source: 'ImpliedOunce', message: impliedOunceResult.error.message });
        impliedOunceStale = true;
        // impliedOunceResult.data might still have stale data
        impliedOunce = impliedOunceResult.data;
      } else {
        impliedOunce = impliedOunceResult.data;
        impliedOunceStale = impliedOunce?.stale ?? false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Market snapshot error: Egypt Market Implied Ounce fetch threw exception -', errorMessage);
      errors.push({ source: 'ImpliedOunce', message: errorMessage });
      impliedOunceStale = true;
      // Try to get stale data from Supabase cache
      try {
        const { getLatestGoldSpot } = await import('@/lib/supabase/goldSpot');
        const cached = await getLatestGoldSpot();
        if (cached) {
          impliedOunce = {
            impliedOunceUsd: cached.xau_spot_usd_oz,
            source: 'gold-api.com' as const,
            timestamp: cached.fetched_at,
            stale: true,
          };
          impliedOunceStale = true;
        }
      } catch (cacheError) {
        // No cached data available
        console.error('[Supabase] Error getting cached gold spot in fallback:', cacheError);
      }
    }

    // Fetch real USD/EGP exchange rate
    let fxData: { rate: number | null; fetchedAt: number; stale: boolean; source: string; error?: string } | null = null;
    try {
      fxData = await getUsdEgpRate();
      if (fxData.rate === null) {
        errors.push({ source: 'FXRate', message: fxData.error || 'Failed to fetch USD/EGP rate' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Market snapshot error: FX rate fetch failed -', errorMessage);
      errors.push({ source: 'FXRate', message: errorMessage });
      fxData = {
        rate: null,
        fetchedAt: Date.now(),
        stale: true,
        source: 'open.er-api.com',
        error: errorMessage,
      };
    }

    // Determine if FX is unavailable (must be defined before use in pricing/warnings)
    const usdEgp = fxData?.rate ?? null;
    const fxUnavailable = usdEgp === null || !Number.isFinite(usdEgp) || usdEgp <= 0;

    // Fetch Egypt market prices from Supabase (new normalized schema)
    let egyptMarketData;
    try {
      egyptMarketData = await getEgyptMarketMedians(EGYPT_TRUSTED_ONLY_MODE, 60);
      
      // If no data in Supabase, trigger ingestion (but don't wait for it)
      if (egyptMarketData.activeSourceCount === 0 && egyptMarketData.lastUpdated === 0) {
        console.log('[MarketSnapshot] No data in Supabase, triggering ingestion...');
        // Trigger web sources ingestion in background (non-blocking)
        import('@/lib/gold-ingestion-engine').then(({ runIngestionCycle }) => {
          runIngestionCycle().catch(err => {
            console.error('[MarketSnapshot] Web sources ingestion failed:', err);
          });
        }).catch(err => {
          console.error('[MarketSnapshot] Failed to load web ingestion engine:', err);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Market snapshot error: Failed to fetch Egypt market data from Supabase -', errorMessage);
      errors.push({ source: 'EgyptMarket', message: errorMessage });
      egyptMarketData = {
        prices: {
          market21Buy: null,
          market21Sell: null,
          market24Buy: null,
          market24Sell: null,
          market18Buy: null,
          market18Sell: null,
          market14Buy: null,
          market14Sell: null,
        },
        activeSourceCount: 0,
        sourcesUsed: {},
        lastUpdated: 0,
      };
    }

    // Get active source count from Supabase
    let activeSources = egyptMarketData.activeSourceCount;
    try {
      activeSources = await getActiveSourceCount(EGYPT_TRUSTED_ONLY_MODE, 60);
    } catch (error) {
      console.error('Market snapshot error: Failed to get active source count -', error);
      // Use the count from egyptMarketData as fallback
    }

    // Build sources array for response (mock structure for compatibility)
    // The new schema doesn't have per-source snapshots, so we create a simplified structure
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    const egyptSourceResults: Array<{
      source: string;
      status: 'OK' | 'DOWN' | 'STALE';
      prices: {
        market21Buy: number | null;
        market21Sell: number | null;
        market24Buy: number | null;
        market24Sell: number | null;
      };
      fetchedAt: number;
      lastError: string | null;
    }> = [];

    // Create a synthetic source entry for the aggregate
    const isStale = egyptMarketData.lastUpdated === 0 || (now - egyptMarketData.lastUpdated) > STALE_THRESHOLD_MS;
    egyptSourceResults.push({
      source: 'supabase_aggregate',
      status: isStale ? 'STALE' : (egyptMarketData.activeSourceCount > 0 ? 'OK' : 'DOWN'),
      prices: {
        market21Buy: egyptMarketData.prices.market21Buy,
        market21Sell: egyptMarketData.prices.market21Sell,
        market24Buy: egyptMarketData.prices.market24Buy,
        market24Sell: egyptMarketData.prices.market24Sell,
      },
      fetchedAt: egyptMarketData.lastUpdated,
      lastError: null,
    });

    const egyptData = {
      sources: egyptSourceResults,
      median: {
        market21Buy: egyptMarketData.prices.market21Buy,
        market21Sell: egyptMarketData.prices.market21Sell,
        market24Buy: egyptMarketData.prices.market24Buy,
        market24Sell: egyptMarketData.prices.market24Sell,
      },
      webAggregate: null, // Removed in new schema
    };
    
    // Calculate pricing (only if we have required data)
    let pricing = null;
    try {
      pricing = calculatePricing({
        impliedOunceUsd: impliedOunce?.impliedOunceUsd ?? null,
        market21Buy: egyptData.median.market21Buy,
        market21Sell: egyptData.median.market21Sell,
        market24Buy: egyptData.median.market24Buy,
        market24Sell: egyptData.median.market24Sell,
        usdEgp: usdEgp,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Market snapshot error: Pricing calculation failed -', errorMessage);
      errors.push({ source: 'PricingCalculation', message: errorMessage });
    }

    // Active source count is already calculated by getEgyptMarketMedians/getActiveSourceCount
    // activeSources is set above from Supabase query
    const hasMarketData = egyptData.median.market21Buy !== null || egyptData.median.market24Buy !== null;
    
    // Check if any source has data within the last 10 minutes
    const hasRecentData = egyptData.sources.some(
      s => s.status === 'OK' && (now - s.fetchedAt) <= STALE_THRESHOLD_MS
    );
    
    // Determine if we have enough data for variance calculation
    // Need: impliedOunce AND real USD/EGP FX AND (market21Buy OR market24Buy)
    const hasVarianceData = impliedOunce?.impliedOunceUsd !== null && 
      !fxUnavailable &&
      (egyptData.median.market21Buy !== null || egyptData.median.market24Buy !== null);
    
    // Check if sells are missing (warn if buy-only)
    const hasSellData = egyptData.median.market21Sell !== null || egyptData.median.market24Sell !== null;
    
    // Check if local market data is missing
    const localMarketMissing = egyptData.median.market21Buy === null && egyptData.median.market24Buy === null;
    
    // referenceUnavailable: true only if required inputs missing
    // Required: impliedOunceUsd AND real FX rate AND (market21Buy OR market24Buy)
    // Do NOT mark unavailable just because implied FX can't be computed
    const referenceUnavailable = 
      (impliedOunce?.impliedOunceUsd === null) ||
      fxUnavailable ||
      localMarketMissing;

    // Aggregate sourcesUsed from Supabase query
    const sourcesUsed = egyptMarketData.sourcesUsed || {};
    
    // Compute active underlying source count and list
    // sourcesUsed shape: {14:[...],18:[...],21:[...],24:[...]}
    const allUnderlyingSources = new Set<string>();
    for (const karat in sourcesUsed) {
      const sources = sourcesUsed[karat];
      if (Array.isArray(sources)) {
        sources.forEach((source: string) => allUnderlyingSources.add(source));
      }
    }
    const activeUnderlyingSourceCount = allUnderlyingSources.size;
    const activeUnderlyingSources = Array.from(allUnderlyingSources).sort();

    // Build response with partial data
    return NextResponse.json({
      timestamp: Date.now(),
      impliedOunce: impliedOunce
        ? {
            impliedOunceUsd: impliedOunce.impliedOunceUsd,
            source: impliedOunce.source,
            timestamp: impliedOunce.timestamp,
            stale: impliedOunceStale || impliedOunce.stale,
          }
        : null,
      egyptMarket: {
        median: egyptData.median,
        sources: [
          ...egyptData.sources.map(s => ({
            source: s.source,
            status: s.status,
            fetchedAt: s.fetchedAt,
            lastError: s.lastError,
          })),
        ],
        activeSourceCount: activeSources, // Only counts trusted sources
        activeUnderlyingSourceCount: activeUnderlyingSourceCount,
        activeUnderlyingSources: activeUnderlyingSources,
        sourcesUsed: sourcesUsed,
        trusted: {
          mode: EGYPT_TRUSTED_ONLY_MODE ? 'SINGLE_SOURCE' : 'ALL_SOURCES',
          source: EGYPT_TRUSTED_ONLY_MODE ? 'goldbullioneg' : null,
        },
      },
      pricing: pricing ? {
        ...pricing,
        fx: {
          usdEgp: usdEgp,
          source: fxData?.source ?? 'open.er-api.com',
          fetchedAt: fxData?.fetchedAt ?? null,
          stale: fxData?.stale ?? true,
          error: fxData?.error,
        },
      } : {
        usdPerGram24: null,
        usdPerGram21: null,
        usdEgpGold: null,
        localMarketParity: { local24: null, local21: null },
        fairValue: { fair24: null, fair21: null },
        variance: { variancePct: null, premiumEGP: null, classification: 'N/A' as const },
        fx: {
          usdEgp: usdEgp,
          source: fxData?.source ?? 'open.er-api.com',
          fetchedAt: fxData?.fetchedAt ?? null,
          stale: fxData?.stale ?? true,
          error: fxData?.error,
        },
      },
      warnings: {
        lowConfidence: activeSources === 1,
        referenceUnavailable: referenceUnavailable,
        fxUnavailable: fxUnavailable,
        buyOnlyVariance: !hasSellData && hasVarianceData, // New: warn if variance computed from BUY only
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    // Final catch-all to ensure handler never throws
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Market snapshot error: Unexpected error -', errorMessage);
    return NextResponse.json(
      {
        error: 'Failed to fetch market snapshot',
        errors: errors.length > 0 ? errors : [{ source: 'Unexpected', message: errorMessage }],
        timestamp: Date.now(),
        impliedOunce: null,
        egyptMarket: {
          median: {
            market21Buy: null,
            market21Sell: null,
            market24Buy: null,
            market24Sell: null,
          },
          sources: [],
          activeSourceCount: 0,
          activeUnderlyingSourceCount: 0,
          activeUnderlyingSources: [],
          sourcesUsed: {},
        },
        pricing: {
          usdPerGram24: null,
          usdPerGram21: null,
          usdEgpGold: null,
          localMarketParity: { local24: null, local21: null },
          fairValue: { fair24: null, fair21: null },
          variance: { variancePct: null, premiumEGP: null, classification: 'N/A' as const },
          fx: {
            usdEgp: null,
            source: 'open.er-api.com',
            fetchedAt: null,
            stale: true,
            error: 'Failed to fetch market snapshot',
          },
        },
        warnings: {
          lowConfidence: false,
          referenceUnavailable: true,
          buyOnlyVariance: false,
        },
      },
      { status: 200 } // Always return 200, never 500
    );
  }
}

