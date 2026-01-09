/**
 * Gold Ingestion Engine
 * 
 * Orchestrates fetching, validation, staleness tracking, and weighted averages
 */

import db from './supabase';
import { writeEgyptSnapshotToSupabase } from './supabase/writeMarketSnapshot';
import { writeMarketSnapshotNorm } from './supabase/writeMarketSnapshotNorm';
import { updateSourceStaleness, isSourceStale as isSourceStaleSupabase, getLastOkBuy as getLastOkBuySupabase } from './supabase/sourceStaleness';
import { processSource, SourcePriceResult } from './gold-sources-adapters';
import { SOURCE_WEIGHTS, STALE_AFTER_MS, KARATS, Karat } from './gold-ingestion-config';
import { computeConfidence } from './gold-ingestion-utils';

export interface IngestionResult {
  timestamp: string;
  our_price_buy: Record<string, number | null>;
  our_price_sell?: Record<string, number | null>;
  confidence: Record<string, {
    level: 'LOW' | 'MED' | 'HIGH';
    num_sources: number;
    stddev: number | null;
    weight_sum: number;
    cv: number | null;
  }>;
  sources_used: Record<string, string[]>;
  breakdown: Record<string, Record<string, {
    buy: number | null;
    sell: number | null;
    valid: boolean;
    stale: boolean;
    reason: string | null;
    note: string | null;
  }>>;
  errors: string[];
  num_sources_ok: number;
  num_sources_errors: number;
}

/**
 * Update staleness for source+karat (uses Supabase, with country support)
 */
async function updateStaleness(source: string, karat: number, price: number, country: 'EG' | 'AE' | 'SA' | 'US' = 'EG'): Promise<void> {
  const now = Date.now();
  
  // Update in Supabase (non-fatal)
  // Only update staleness for valid karats (14, 18, 21, 22, 24)
  if (![14, 18, 21, 22, 24].includes(karat)) {
    return;
  }
  
  try {
    await updateSourceStaleness(country, source, karat as 14 | 18 | 21 | 22 | 24, now, price);
  } catch (error) {
    console.error(`[Supabase] Failed to update staleness for ${source}/${karat} (${country}):`, error);
    // Continue - staleness update failure shouldn't block ingestion
  }
}

/**
 * Check if source+karat is stale (uses Supabase, with country support)
 */
async function isStale(source: string, karat: number, country: 'EG' | 'AE' | 'SA' | 'US' = 'EG'): Promise<boolean> {
  // Only check staleness for valid karats
  if (![14, 18, 21, 22, 24].includes(karat)) {
    return true; // Unknown karat = stale
  }
  try {
    return await isSourceStaleSupabase(country, source, karat as 14 | 18 | 21 | 22 | 24, STALE_AFTER_MS);
  } catch (error) {
    console.error(`[Supabase] Error checking staleness for ${source}/${karat} (${country}):`, error);
    return true; // On error, assume stale
  }
}

/**
 * Get last valid buy price for source+karat (uses Supabase, with country support)
 */
async function getLastOkBuy(source: string, karat: number, country: 'EG' | 'AE' | 'SA' | 'US' = 'EG'): Promise<number | null> {
  // Only query for valid karats
  if (![14, 18, 21, 22, 24].includes(karat)) {
    return null;
  }
  try {
    return await getLastOkBuySupabase(country, source, karat as 14 | 18 | 21 | 22 | 24);
  } catch (error) {
    console.error(`[Supabase] Error getting last ok buy for ${source}/${karat} (${country}):`, error);
    return null;
  }
}

/**
 * Compute weighted average prices and confidence per karat
 */
export async function computeWeightedAverage(sourceResults: SourcePriceResult[]): Promise<IngestionResult> {
  const result: IngestionResult = {
    timestamp: new Date().toISOString(),
    our_price_buy: {},
    confidence: {},
    sources_used: {},
    breakdown: {},
    errors: [],
    num_sources_ok: 0,
    num_sources_errors: 0,
  };

  // Collect valid prices per karat (source, price, weight)
  const karatData: Record<number, Array<{ source: string; price: number; weight: number }>> = {};

  for (const sourceResult of sourceResults) {
    if (sourceResult.valid) {
      result.num_sources_ok++;
      const weight = SOURCE_WEIGHTS[sourceResult.source] || 0.5;

      for (const karat of KARATS) {
        if (karat in sourceResult.prices) {
          // Check if stale (async)
          const stale = await isStale(sourceResult.source, karat);
          if (stale) {
            continue;
          }
          
          if (!karatData[karat]) {
            karatData[karat] = [];
          }
          karatData[karat].push({
            source: sourceResult.source,
            price: sourceResult.prices[karat],
            weight,
          });
        }
      }
    } else {
      result.num_sources_errors++;
      // Always include at least one error per failed source
      if (sourceResult.errors.length > 0) {
        result.errors.push(...sourceResult.errors.map(e => `${sourceResult.source}: ${e}`));
      } else {
        result.errors.push(`${sourceResult.source}: no_valid_prices`);
      }
    }
  }

  // Compute weighted average per karat
  for (const karat of KARATS) {
    const karatStr = String(karat);

    if (!karatData[karat] || karatData[karat].length === 0) {
      result.our_price_buy[karatStr] = null;
      result.confidence[karatStr] = {
        level: 'LOW',
        num_sources: 0,
        stddev: null,
        weight_sum: 0,
        cv: null,
      };
      result.sources_used[karatStr] = [];
      result.breakdown[karatStr] = {};
      continue;
    }

    const data = karatData[karat];
    const prices = data.map(d => d.price);
    const weights = data.map(d => d.weight);
    const sources = data.map(d => d.source);

    const weightSum = weights.reduce((a, b) => a + b, 0);
    const weightedSum = data.reduce((sum, d) => sum + d.price * d.weight, 0);
    const weightedAvg = weightSum > 0 ? weightedSum / weightSum : 0;

    // Compute confidence
    const conf = computeConfidence(prices, weightSum, sources.length);

    result.our_price_buy[karatStr] = Math.round(weightedAvg * 100) / 100;
    result.confidence[karatStr] = {
      level: conf.level,
      num_sources: sources.length,
      stddev: Math.round(conf.stddev * 100) / 100,
      weight_sum: Math.round(weightSum * 100) / 100,
      cv: Math.round(conf.cv * 10000) / 10000,
    };
    result.sources_used[karatStr] = sources;

    // Build breakdown
    const breakdown: Record<string, any> = {};
    for (const sourceResult of sourceResults) {
      const source = sourceResult.source;
      const stale = await isStale(source, karat, 'EG');
      if (karat in sourceResult.prices) {
        breakdown[source] = {
          buy: sourceResult.prices[karat],
          sell: null, // Not tracked currently
          valid: true,
          stale,
          reason: null,
          note: sourceResult.notes.length > 0 ? sourceResult.notes.join('; ') : null,
        };
      } else {
        breakdown[source] = {
          buy: null,
          sell: null,
          valid: false,
          stale,
          reason: sourceResult.errors.length > 0 ? sourceResult.errors.join('; ') : 'No data',
          note: null,
        };
      }
    }
    result.breakdown[karatStr] = breakdown;
  }

  return result;
}

/**
 * Run one ingestion cycle
 */
/**
 * Run multi-country ingestion cycle
 * Fetches data for EG, AE, SA, US
 */
export async function runMultiCountryIngestionCycle(): Promise<{
  results: Record<string, { inserted: number; errors: string[] }>;
  totalInserted: number;
}> {
  const results: Record<string, { inserted: number; errors: string[] }> = {};
  let totalInserted = 0;
  const now = Date.now();

  // Import multi-country adapters
  const { fetchUAEGoldPrices, fetchSaudiGoldPrices, fetchUSASpotPrices } = await import('./gold-sources-adapters-multicountry');
  const { getLatestGoldSpot } = await import('./supabase/goldSpot');

  // 1. EGYPT (existing pipeline)
  console.log('[Ingestion] Processing Egypt (EG)...');
  try {
    const egResult = await runIngestionCycle();
    results['EG'] = {
      inserted: egResult.sourcesWritten + (egResult.aggregatedSnapshotWritten ? 1 : 0),
      errors: egResult.errors,
    };
    totalInserted += results['EG'].inserted;
  } catch (error) {
    console.error('[Ingestion] Egypt ingestion failed:', error);
    results['EG'] = { inserted: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }

  // 2. USA (derive from spot price)
  console.log('[Ingestion] Processing USA (US)...');
  try {
    const spotData = await getLatestGoldSpot();
    const spotPrice = spotData?.xau_spot_usd_oz ?? null;
    const usResult = await fetchUSASpotPrices(spotPrice);
    
    if (usResult.valid && Object.keys(usResult.prices).length > 0) {
      const rawHash = Buffer.from(JSON.stringify(usResult)).toString('base64').substring(0, 32);
      const writeResult = await writeMarketSnapshotNorm({
        country: 'US',
        source: 'goldapi_spot',
        trusted: true,
        createdAt: now,
        rawHash,
        prices: {
          24: { buy: usResult.prices[24] || null },
          22: { buy: usResult.prices[22] || null },
          21: { buy: usResult.prices[21] || null },
          18: { buy: usResult.prices[18] || null },
          14: { buy: usResult.prices[14] || null },
        },
      });
      results['US'] = {
        inserted: writeResult.inserted || 0,
        errors: writeResult.ok ? [] : [writeResult.error || 'Write failed'],
      };
      totalInserted += results['US'].inserted;
    } else {
      results['US'] = { inserted: 0, errors: usResult.errors };
    }
  } catch (error) {
    console.error('[Ingestion] USA ingestion failed:', error);
    results['US'] = { inserted: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }

  // 3. UAE
  console.log('[Ingestion] Processing UAE (AE)...');
  try {
    const aeResult = await fetchUAEGoldPrices();
    
    if (aeResult.valid && Object.keys(aeResult.prices).length > 0) {
      const rawHash = Buffer.from(JSON.stringify(aeResult)).toString('base64').substring(0, 32);
      const writeResult = await writeMarketSnapshotNorm({
        country: 'AE',
        source: 'goldprice_org_ae',
        trusted: false,
        createdAt: now,
        rawHash,
        prices: {
          24: { buy: aeResult.prices[24] || null },
          22: { buy: aeResult.prices[22] || null },
          21: { buy: aeResult.prices[21] || null },
          18: { buy: aeResult.prices[18] || null },
          14: { buy: aeResult.prices[14] || null },
        },
      });
      results['AE'] = {
        inserted: writeResult.inserted || 0,
        errors: writeResult.ok ? [] : [writeResult.error || 'Write failed'],
      };
      totalInserted += results['AE'].inserted;
    } else {
      results['AE'] = { inserted: 0, errors: aeResult.errors };
    }
  } catch (error) {
    console.error('[Ingestion] UAE ingestion failed:', error);
    results['AE'] = { inserted: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }

  // 4. Saudi Arabia
  console.log('[Ingestion] Processing Saudi Arabia (SA)...');
  try {
    const saResult = await fetchSaudiGoldPrices();
    
    if (saResult.valid && Object.keys(saResult.prices).length > 0) {
      const rawHash = Buffer.from(JSON.stringify(saResult)).toString('base64').substring(0, 32);
      const writeResult = await writeMarketSnapshotNorm({
        country: 'SA',
        source: 'goldprice_org_sa',
        trusted: false,
        createdAt: now,
        rawHash,
        prices: {
          24: { buy: saResult.prices[24] || null },
          22: { buy: saResult.prices[22] || null },
          21: { buy: saResult.prices[21] || null },
          18: { buy: saResult.prices[18] || null },
          14: { buy: saResult.prices[14] || null },
        },
      });
      results['SA'] = {
        inserted: writeResult.inserted || 0,
        errors: writeResult.ok ? [] : [writeResult.error || 'Write failed'],
      };
      totalInserted += results['SA'].inserted;
    } else {
      results['SA'] = { inserted: 0, errors: saResult.errors };
    }
  } catch (error) {
    console.error('[Ingestion] Saudi Arabia ingestion failed:', error);
    results['SA'] = { inserted: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }

  console.log(`[Ingestion] Multi-country cycle complete: ${totalInserted} total rows inserted`, results);
  return { results, totalInserted };
}

export async function runIngestionCycle(): Promise<IngestionResult & { sourcesWritten: number; aggregatedSnapshotWritten: boolean }> {
  const sources = Object.keys(SOURCE_WEIGHTS);
  console.log(`[Ingestion] Starting Egypt cycle with ${sources.length} sources:`, sources);
  
  // Fetch all sources in parallel
  const sourceResults = await Promise.all(
    sources.map(async (source) => {
      try {
        const result = await processSource(source);
        console.log(`[Ingestion] Source ${source}: valid=${result.valid}, prices=${Object.keys(result.prices).length}, errors=${result.errors.length}`);
        return result;
      } catch (error) {
        console.error(`[Ingestion] Error processing source ${source}:`, error);
        return {
          source,
          valid: false,
          stale: {},
          prices: {},
          errors: [error instanceof Error ? error.message : String(error)],
          notes: [],
        } as SourcePriceResult;
      }
    })
  );

  // Update staleness tracking for valid prices
  for (const sourceResult of sourceResults) {
    if (sourceResult.valid) {
      for (const karat of KARATS) {
        if (karat in sourceResult.prices) {
          // Check for sudden drops (60% drop from last known)
          const lastOk = await getLastOkBuy(sourceResult.source, karat);
          if (lastOk !== null) {
            const dropPct = (lastOk - sourceResult.prices[karat]) / lastOk;
            if (dropPct > 0.60) {
              sourceResult.errors.push(
                `Karat ${karat}: suspicious 60%+ drop (${lastOk} -> ${sourceResult.prices[karat]})`
              );
              sourceResult.notes.push(`Rejected ${karat}K due to large drop`);
              delete sourceResult.prices[karat];
              continue;
            }
          }
          
          await updateStaleness(sourceResult.source, karat, sourceResult.prices[karat]);
        }
      }
    }
  }

  // Compute weighted averages
  console.log(`[Ingestion] Computing weighted averages from ${sourceResults.filter(s => s.valid).length} valid sources`);
  const result = await computeWeightedAverage(sourceResults);
  console.log(`[Ingestion] Weighted averages computed:`, {
    24: result.our_price_buy['24'],
    21: result.our_price_buy['21'],
    18: result.our_price_buy['18'],
    14: result.our_price_buy['14'],
  });

  // Store source results in database
  const now = Date.now();
  let sourcesWritten = 0;
  
  // Write individual source snapshots
  for (const sourceResult of sourceResults) {
    const rawHash = Buffer.from(JSON.stringify(sourceResult)).toString('base64').substring(0, 32);
    
    try {
      // Write to Supabase using the unified client
      // Check if source is trusted (e.g., goldbullioneg)
      const isTrusted = sourceResult.source === 'goldbullioneg';
      
      // Only write if we have valid prices and source is valid
      const hasValidPrices = 
        (sourceResult.prices[24] && sourceResult.prices[24] > 0) || 
        (sourceResult.prices[21] && sourceResult.prices[21] > 0) || 
        (sourceResult.prices[18] && sourceResult.prices[18] > 0) || 
        (sourceResult.prices[14] && sourceResult.prices[14] > 0);
      
      // Write if source is valid OR if we have valid prices (even with errors, log them)
      if (sourceResult.valid && hasValidPrices) {
        try {
          // Write to both wide schema (backward compatibility) and normalized schema
          // Wide schema write (existing)
          const wideResult = await writeEgyptSnapshotToSupabase({
            source: sourceResult.source,
            trusted: isTrusted,
            createdAtMs: now,
            rawHash,
            prices: {
              14: { buy: sourceResult.prices[14] || null },
              18: { buy: sourceResult.prices[18] || null },
              21: { buy: sourceResult.prices[21] || null },
              24: { buy: sourceResult.prices[24] || null },
            },
          });
          
          // Normalized schema write (new multi-country support)
          // Only write for EG (Egypt) - other countries will be stubbed later
          const normResult = await writeMarketSnapshotNorm({
            country: 'EG',
            source: sourceResult.source,
            trusted: isTrusted,
            createdAt: now,
            rawHash,
            prices: {
              14: { buy: sourceResult.prices[14] || null },
              18: { buy: sourceResult.prices[18] || null },
              21: { buy: sourceResult.prices[21] || null },
              24: { buy: sourceResult.prices[24] || null },
            },
          });
          
          if ((wideResult.ok && wideResult.inserted && wideResult.inserted > 0) ||
              (normResult.ok && normResult.inserted && normResult.inserted > 0)) {
            sourcesWritten++;
            console.log(`[Ingestion] Wrote snapshot for ${sourceResult.source}: wide=${wideResult.inserted || 0}, norm=${normResult.inserted || 0} row(s)`);
          } else {
            console.error(`[Ingestion] Write failed for ${sourceResult.source}:`, {
              wide: wideResult.error,
              norm: normResult.error,
            });
          }
        } catch (supabaseError) {
          // Non-fatal: log and continue
          console.error(`[Ingestion] Write exception for ${sourceResult.source}:`, supabaseError);
        }
      } else {
        console.log(`[Ingestion] Skipping ${sourceResult.source}: valid=${sourceResult.valid}, hasValidPrices=${hasValidPrices}`);
      }
    } catch (e) {
      console.error(`[Ingestion] Failed to store snapshot for ${sourceResult.source}:`, e);
    }
  }

  // IMPORTANT: Also write the aggregated weighted average as 'aggregated' source
  // This ensures we always have data even if individual sources fail
  // result.our_price_buy uses string keys like '14', '18', '21', '24'
  let aggregatedWritten = false;
  if (result.our_price_buy && Object.keys(result.our_price_buy).length > 0) {
    try {
      const aggregatedHash = Buffer.from(JSON.stringify(result)).toString('base64').substring(0, 32);
      // Extract prices from result.our_price_buy (keys are strings like '14', '18', '21', '24')
      const price14 = result.our_price_buy['14'] ?? result.our_price_buy[14] ?? null;
      const price18 = result.our_price_buy['18'] ?? result.our_price_buy[18] ?? null;
      const price21 = result.our_price_buy['21'] ?? result.our_price_buy[21] ?? null;
      const price24 = result.our_price_buy['24'] ?? result.our_price_buy[24] ?? null;
      
      console.log(`[Ingestion] Attempting to write aggregated snapshot:`, { price14, price18, price21, price24 });
      
      // Only write if we have at least one valid price
      if (price14 !== null || price18 !== null || price21 !== null || price24 !== null) {
        // Write to wide schema (backward compatibility)
        const wideAggregatedResult = await writeEgyptSnapshotToSupabase({
          source: 'aggregated',
          trusted: false,
          createdAtMs: now,
          rawHash: aggregatedHash,
          prices: {
            14: { buy: price14 },
            18: { buy: price18 },
            21: { buy: price21 },
            24: { buy: price24 },
          },
        });
        
        // Write to normalized schema (new multi-country support)
        // Only write for EG (Egypt) - other countries will be stubbed later
        const normAggregatedResult = await writeMarketSnapshotNorm({
          country: 'EG',
          source: 'aggregated',
          trusted: false,
          createdAt: now,
          rawHash: aggregatedHash,
          prices: {
            14: { buy: price14 },
            18: { buy: price18 },
            21: { buy: price21 },
            24: { buy: price24 },
          },
        });
        
        if ((wideAggregatedResult.ok && wideAggregatedResult.inserted && wideAggregatedResult.inserted > 0) ||
            (normAggregatedResult.ok && normAggregatedResult.inserted && normAggregatedResult.inserted > 0)) {
          aggregatedWritten = true;
          console.log(`[Ingestion] ✓ Wrote aggregated snapshot: wide=${wideAggregatedResult.inserted || 0}, norm=${normAggregatedResult.inserted || 0} row(s)`, {
            prices24: price24,
            prices21: price21,
            prices18: price18,
            prices14: price14,
          });
        } else {
          const errorMsg = normAggregatedResult.error || wideAggregatedResult.error || 'Unknown error';
          console.error(`[Ingestion] ✗ Failed to write aggregated snapshot:`, errorMsg, {
            attempted: { price14, price18, price21, price24 },
            wide: wideAggregatedResult.error,
            norm: normAggregatedResult.error,
          });
        }
      } else {
        console.warn('[Ingestion] Skipping aggregated snapshot write: all prices are null', result.our_price_buy);
      }
    } catch (aggregatedError) {
      console.error(`[Ingestion] Exception writing aggregated snapshot:`, aggregatedError);
    }
  } else {
    console.warn('[Ingestion] No aggregated prices to write:', result.our_price_buy);
  }

  console.log(`[Ingestion] Completed: ${sourcesWritten} individual sources written, aggregated: ${aggregatedWritten ? 'YES' : 'NO'}`);
  return {
    ...result,
    sourcesWritten,
    aggregatedSnapshotWritten: aggregatedWritten,
  };
}

