/**
 * Market Snapshot API
 * 
 * Returns aggregated market data with pricing calculations
 * Frontend polls this every 30 seconds
 */

import { NextResponse } from 'next/server';
import { getImpliedOunceWithCache } from '@/lib/goldapi';
import { calculatePricing } from '@/lib/pricing';
import { getMultiCurrencyRates, convertMoney, getCountryCurrency, Currency } from '@/lib/fx-multi';
import { getMarketMedians, getActiveSourceCountNorm } from '@/lib/supabase/queries-norm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET(request: Request) {
  const errors: Array<{ source: string; message: string }> = [];
  
  // Parse query params
  const { searchParams } = new URL(request.url);
  const countryParam = searchParams.get('country');
  const currencyParam = searchParams.get('currency');
  
  // Validate and default country
  const country = (['EG', 'AE', 'SA', 'US'].includes(countryParam || '') 
    ? countryParam 
    : 'EG') as 'EG' | 'AE' | 'SA' | 'US';
  
  // Validate and default currency
  const currency = (['EGP', 'USD', 'AED', 'SAR'].includes(currencyParam || '') 
    ? currencyParam 
    : getCountryCurrency(country)) as Currency;
  
  // Always use all sources (trusted mode toggle removed)
  const TRUSTED_ONLY_MODE = false;
  
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

    // Fetch multi-currency FX rates (USD pivot)
    let fxRates;
    try {
      fxRates = await getMultiCurrencyRates();
      if (fxRates.usd_egp === null || fxRates.usd_aed === null || fxRates.usd_sar === null) {
        errors.push({ source: 'FXRate', message: 'Failed to fetch some FX rates' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Market snapshot error: FX rate fetch failed -', errorMessage);
      errors.push({ source: 'FXRate', message: errorMessage });
      fxRates = {
        usd_egp: null,
        usd_aed: null,
        usd_sar: null,
        fetchedAt: Date.now(),
        stale: true,
        source: 'open.er-api.com',
        errors: { network: errorMessage },
      };
    }

    // Determine if FX is unavailable
    const canonicalCurrency = getCountryCurrency(country);
    const usdEgp = fxRates.usd_egp;
    const fxUnavailable = (canonicalCurrency === 'EGP' && (usdEgp === null || !Number.isFinite(usdEgp) || usdEgp <= 0)) ||
                          (canonicalCurrency === 'AED' && (fxRates.usd_aed === null || !Number.isFinite(fxRates.usd_aed) || fxRates.usd_aed <= 0)) ||
                          (canonicalCurrency === 'SAR' && (fxRates.usd_sar === null || !Number.isFinite(fxRates.usd_sar) || fxRates.usd_sar <= 0));

    // Fetch market prices from normalized schema (country-aware)
    // Use 120 minute window to capture more data (increased from 60 for better coverage)
    let marketData;
    try {
      marketData = await getMarketMedians(country, TRUSTED_ONLY_MODE, 120);
      
      // If no data in Supabase for any country, trigger ingestion (but don't wait for it)
      if (marketData.activeSourceCount === 0 && marketData.lastUpdated === 0) {
        console.warn(`[MarketSnapshot] ⚠️  No data in Supabase for ${country}, triggering ingestion...`);
        // Trigger web sources ingestion in background (non-blocking)
        import('@/lib/gold-ingestion-engine').then(({ runIngestionCycle, runMultiCountryIngestionCycle }) => {
          if (country === 'EG') {
            runIngestionCycle().catch(err => {
              console.error('[MarketSnapshot] Web sources ingestion failed:', err);
            });
          } else {
            runMultiCountryIngestionCycle().catch(err => {
              console.error('[MarketSnapshot] Multi-country ingestion failed:', err);
            });
          }
        }).catch(err => {
          console.error('[MarketSnapshot] Failed to load ingestion engine:', err);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[MarketSnapshot] Failed to fetch market data for ${country} from Supabase -`, errorMessage);
      errors.push({ source: 'MarketData', message: errorMessage });
      marketData = {
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
        canonicalCurrency: canonicalCurrency,
      };
    }

    // Get active source count from normalized schema (use same 120min window for consistency)
    let activeSources = marketData.activeSourceCount;
    try {
      activeSources = await getActiveSourceCountNorm(country, TRUSTED_ONLY_MODE, 120);
    } catch (error) {
      console.error(`[MarketSnapshot] Failed to get active source count for ${country} -`, error);
      // Use the count from marketData as fallback
    }

    // Convert prices to requested currency (if different from canonical)
    const canonicalPrices = marketData.prices;
    let convertedPrices = canonicalPrices;
    
    if (currency !== marketData.canonicalCurrency && fxRates) {
      convertedPrices = {
        market21Buy: canonicalPrices.market21Buy !== null 
          ? convertMoney(canonicalPrices.market21Buy, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market21Sell: canonicalPrices.market21Sell !== null
          ? convertMoney(canonicalPrices.market21Sell, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market24Buy: canonicalPrices.market24Buy !== null
          ? convertMoney(canonicalPrices.market24Buy, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market24Sell: canonicalPrices.market24Sell !== null
          ? convertMoney(canonicalPrices.market24Sell, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market18Buy: canonicalPrices.market18Buy !== null
          ? convertMoney(canonicalPrices.market18Buy, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market18Sell: canonicalPrices.market18Sell !== null
          ? convertMoney(canonicalPrices.market18Sell, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market14Buy: canonicalPrices.market14Buy !== null
          ? convertMoney(canonicalPrices.market14Buy, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
        market14Sell: canonicalPrices.market14Sell !== null
          ? convertMoney(canonicalPrices.market14Sell, marketData.canonicalCurrency, currency, {
              usd_egp: fxRates.usd_egp,
              usd_aed: fxRates.usd_aed,
              usd_sar: fxRates.usd_sar,
            })
          : null,
      };
    }

    // Build sources array (simplified for now)
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    const isStale = marketData.lastUpdated === 0 || (now - marketData.lastUpdated) > STALE_THRESHOLD_MS;
    const marketSources = [{
      source: 'supabase_aggregate',
      status: isStale ? 'STALE' : (marketData.activeSourceCount > 0 ? 'OK' : 'DOWN') as 'OK' | 'STALE' | 'DOWN',
      prices: convertedPrices,
      fetchedAt: marketData.lastUpdated,
      lastError: null,
    }];

    // Calculate pricing using canonical prices (in canonical currency)
    // Pricing calculations are typically done in the canonical currency
    let pricing = null;
    try {
      // Get the appropriate FX rate for the country's canonical currency
      const canonicalFxRate = canonicalCurrency === 'EGP' ? usdEgp :
                             canonicalCurrency === 'AED' ? fxRates.usd_aed :
                             canonicalCurrency === 'SAR' ? fxRates.usd_sar :
                             1.0; // USD (no conversion needed)
      
      // Use canonical prices for calculations, then convert if needed
      pricing = calculatePricing({
        impliedOunceUsd: impliedOunce?.impliedOunceUsd ?? null,
        market21Buy: canonicalPrices.market21Buy,
        market21Sell: canonicalPrices.market21Sell,
        market24Buy: canonicalPrices.market24Buy,
        market24Sell: canonicalPrices.market24Sell,
        usdLocalRate: canonicalFxRate, // Use country-specific FX rate
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Market snapshot error: Pricing calculation failed -', errorMessage);
      errors.push({ source: 'PricingCalculation', message: errorMessage });
    }

    const hasMarketData = convertedPrices.market21Buy !== null || convertedPrices.market24Buy !== null;
    const hasVarianceData = impliedOunce?.impliedOunceUsd !== null && 
      !fxUnavailable &&
      (convertedPrices.market21Buy !== null || convertedPrices.market24Buy !== null);
    const hasSellData = convertedPrices.market21Sell !== null || convertedPrices.market24Sell !== null;
    const localMarketMissing = convertedPrices.market21Buy === null && convertedPrices.market24Buy === null;
    
    // referenceUnavailable: true only if required inputs missing
    // Required: impliedOunceUsd AND real FX rate AND (market21Buy OR market24Buy)
    // Do NOT mark unavailable just because implied FX can't be computed
    const referenceUnavailable = 
      (impliedOunce?.impliedOunceUsd === null) ||
      fxUnavailable ||
      localMarketMissing;

    // Aggregate sourcesUsed from query
    const sourcesUsed = marketData.sourcesUsed || {};
    const allUnderlyingSources = new Set<string>();
    for (const karat in sourcesUsed) {
      const sources = sourcesUsed[karat];
      if (Array.isArray(sources)) {
        sources.forEach((source: string) => allUnderlyingSources.add(source));
      }
    }
    const activeUnderlyingSourceCount = allUnderlyingSources.size;
    const activeUnderlyingSources = Array.from(allUnderlyingSources).sort();

    // Build response with both canonical and converted prices
    return withNoStoreHeaders(NextResponse.json({
      timestamp: Date.now(),
      country,
      currency,
      canonicalCurrency: marketData.canonicalCurrency,
      impliedOunce: impliedOunce
        ? {
            impliedOunceUsd: impliedOunce.impliedOunceUsd,
            source: impliedOunce.source,
            timestamp: impliedOunce.timestamp,
            stale: impliedOunceStale || impliedOunce.stale,
          }
        : null,
      market: {
        median: convertedPrices, // Return converted prices
        canonicalMedian: canonicalPrices, // Also return canonical prices for reference
        sources: marketSources.map(s => ({
          source: s.source,
          status: s.status,
          fetchedAt: s.fetchedAt,
          lastError: s.lastError,
        })),
        activeSourceCount: activeSources,
        activeUnderlyingSourceCount: activeUnderlyingSourceCount,
        activeUnderlyingSources: activeUnderlyingSources,
        sourcesUsed: sourcesUsed,
      },
      pricing: pricing ? {
        usdPerGram24: pricing.usdPerGram24,
        usdPerGram21: pricing.usdPerGram21,
        usdEgpGold: pricing.usdLocalRate, // Map to usdEgpGold for backward compatibility (but it's actually canonical currency rate)
        localMarketParity: pricing.localMarketParity,
        // Convert fair values to selected currency if different from canonical
        fairValue: (currency !== canonicalCurrency && fxRates) ? {
          fair24: pricing.fairValue.fair24 !== null 
            ? convertMoney(pricing.fairValue.fair24, canonicalCurrency, currency, {
                usd_egp: fxRates.usd_egp,
                usd_aed: fxRates.usd_aed,
                usd_sar: fxRates.usd_sar,
              })
            : null,
          fair21: pricing.fairValue.fair21 !== null
            ? convertMoney(pricing.fairValue.fair21, canonicalCurrency, currency, {
                usd_egp: fxRates.usd_egp,
                usd_aed: fxRates.usd_aed,
                usd_sar: fxRates.usd_sar,
              })
            : null,
        } : pricing.fairValue,
        // Map premiumLocal to premiumEGP for backward compatibility, but it's actually in canonical currency
        variance: {
          variancePct: pricing.variance.variancePct,
          premiumEGP: pricing.variance.premiumLocal, // Keep backward compatibility (actually in canonical currency)
          classification: pricing.variance.classification,
        },
        fx: {
          usdEgp: usdEgp,
          usdAed: fxRates.usd_aed,
          usdSar: fxRates.usd_sar,
          source: fxRates.source,
          fetchedAt: fxRates.fetchedAt,
          stale: fxRates.stale,
          errors: fxRates.errors,
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
          usdAed: fxRates.usd_aed,
          usdSar: fxRates.usd_sar,
          source: fxRates.source,
          fetchedAt: fxRates.fetchedAt,
          stale: fxRates.stale,
          errors: fxRates.errors,
        },
      },
      warnings: {
        lowConfidence: activeSources === 1,
        referenceUnavailable: referenceUnavailable,
        fxUnavailable: fxUnavailable,
        buyOnlyVariance: !hasSellData && hasVarianceData,
      },
      errors: errors.length > 0 ? errors : undefined,
    }));
  } catch (error) {
    // Final catch-all to ensure handler never throws
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Market snapshot error: Unexpected error -', errorMessage);
    return withNoStoreHeaders(NextResponse.json(
      {
        error: 'Failed to fetch market snapshot',
        errors: errors.length > 0 ? errors : [{ source: 'Unexpected', message: errorMessage }],
        timestamp: Date.now(),
        impliedOunce: null,
        market: {
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
            usdAed: null,
            usdSar: null,
            source: 'open.er-api.com',
            fetchedAt: null,
            stale: true,
            errors: { network: 'Failed to fetch market snapshot' },
          },
        },
        warnings: {
          lowConfidence: false,
          referenceUnavailable: true,
          buyOnlyVariance: false,
        },
      },
      { status: 200 } // Always return 200, never 500
    ));
  }
}

