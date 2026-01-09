/**
 * Gold Ingestion Engine
 * 
 * Orchestrates fetching, validation, staleness tracking, and weighted averages
 */

import db from './supabase';
import { writeEgyptSnapshotToSupabase } from './supabase/writeMarketSnapshot';
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
 * Update staleness for source+karat (uses Supabase)
 */
async function updateStaleness(source: string, karat: Karat, price: number): Promise<void> {
  const now = Date.now();
  
  // Update in Supabase (non-fatal)
  try {
    await updateSourceStaleness(source, karat, now, price);
  } catch (error) {
    console.error(`[Supabase] Failed to update staleness for ${source}/${karat}:`, error);
    // Continue - staleness update failure shouldn't block ingestion
  }
}

/**
 * Check if source+karat is stale (uses Supabase)
 */
async function isStale(source: string, karat: Karat): Promise<boolean> {
  try {
    return await isSourceStaleSupabase(source, karat, STALE_AFTER_MS);
  } catch (error) {
    console.error(`[Supabase] Error checking staleness for ${source}/${karat}:`, error);
    return true; // On error, assume stale
  }
}

/**
 * Get last valid buy price for source+karat (uses Supabase)
 */
async function getLastOkBuy(source: string, karat: Karat): Promise<number | null> {
  try {
    return await getLastOkBuySupabase(source, karat);
  } catch (error) {
    console.error(`[Supabase] Error getting last ok buy for ${source}/${karat}:`, error);
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
      const stale = await isStale(source, karat);
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
export async function runIngestionCycle(): Promise<IngestionResult> {
  const sources = Object.keys(SOURCE_WEIGHTS);
  
  // Fetch all sources in parallel
  const sourceResults = await Promise.all(
    sources.map(source => processSource(source))
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
  const result = await computeWeightedAverage(sourceResults);

  // Store source results in database
  const now = Date.now();
  for (const sourceResult of sourceResults) {
    const rawHash = Buffer.from(JSON.stringify(sourceResult)).toString('base64').substring(0, 32);
    
    try {
      // Write to Supabase using the unified client
      // Check if source is trusted (e.g., goldbullioneg)
      const isTrusted = sourceResult.source === 'goldbullioneg';
      
      // Only write if we have valid prices
      const hasValidPrices = 
        sourceResult.prices[24] || 
        sourceResult.prices[21] || 
        sourceResult.prices[18] || 
        sourceResult.prices[14];
      
      if (hasValidPrices) {
        // Write to normalized Supabase schema only (Supabase-only, no SQLite)
        if (sourceResult.errors.length === 0) {
          try {
            const supabaseResult = await writeEgyptSnapshotToSupabase({
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
            if (!supabaseResult.ok) {
              console.error(`[Supabase] Normalized write failed for ${sourceResult.source}:`, supabaseResult.error);
            }
          } catch (supabaseError) {
            // Non-fatal: log and continue
            console.error(`[Supabase] Normalized write exception for ${sourceResult.source}:`, supabaseError);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to store snapshot for ${sourceResult.source}:`, e);
    }
  }

  return result;
}

