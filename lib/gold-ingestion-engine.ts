/**
 * Gold Ingestion Engine
 * 
 * Orchestrates fetching, validation, staleness tracking, and weighted averages
 */

import { writeEgyptSnapshotToSupabase } from './supabase/writeMarketSnapshot';
import { writeMarketSnapshotNorm } from './supabase/writeMarketSnapshotNorm';
import { updateSourceStaleness, isSourceStale as isSourceStaleSupabase, getLastOkBuy as getLastOkBuySupabase } from './supabase/sourceStaleness';
import { processSource, type SourcePriceResult } from './gold-sources-adapters-regex';
import { SOURCE_WEIGHTS, STALE_AFTER_MS, KARATS, getEgyptAggregationMinSources } from './gold-ingestion-config';
import { computeConfidence } from './gold-ingestion-utils';
import db from './supabase';
import { getEffectiveIngestionConfig } from './ingestion/adminIngestionSettings';

const IS_CLOUDFLARE_WORKER = typeof (globalThis as any).WebSocketPair !== 'undefined';

/**
 * Worker-safe base64 encoder for stable raw_hash values.
 * Cloudflare Workers may not provide Node.js `Buffer`.
 */
function newIngestionRunId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error('Secure random UUID generation is not available in this runtime');
  }

  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);

  // RFC 4122 version 4 UUID
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function base64Encode(input: string): string {
  // Prefer Workers/Web `btoa` when available.
  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    return btoa(binary);
  }

  // Fallback to Node.js Buffer for local/dev environments.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input).toString('base64');
  }

  // Last resort (should be unreachable in practice).
  throw new Error('No base64 encoder available in this runtime');
}

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

export type SourceWriteDiagnostics = {
  source: string;
  valid: boolean;
  hasValidPrices: boolean;
  prices: {
    14: number | null;
    18: number | null;
    21: number | null;
    24: number | null;
  };
  wideOk: boolean | null;
  wideInserted: number | null;
  wideError: string | null;
  normOk: boolean | null;
  normInserted: number | null;
  normError: string | null;
  countedAsWritten: boolean;
  skippedReason: string | null;
};

export type AggregatedWriteDiagnostics = {
  attempted: boolean;
  wideOk: boolean | null;
  wideInserted: number | null;
  wideError: string | null;
  normOk: boolean | null;
  normInserted: number | null;
  normError: string | null;
};

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
    const updateResult = await updateSourceStaleness(country, source, karat as 14 | 18 | 21 | 22 | 24, now, price);
    if (!updateResult.ok) {
      console.warn('[Ingestion] Staleness update failed:', {
        source,
        karat,
        country,
        price,
        timestampMs: now,
        reason: updateResult.error || 'unknown',
      });
    }
  } catch (error) {
    console.error(`[Supabase] Failed to update staleness for ${source}/${karat} (${country}):`, error);
    // Continue - staleness update failure shouldn't block ingestion
  }
}

/**
 * Check if source+karat is stale (uses Supabase, with country support)
 */
async function isStale(source: string, karat: number, country: 'EG' | 'AE' | 'SA' | 'US' = 'EG'): Promise<boolean> {
  if (IS_CLOUDFLARE_WORKER && country === 'EG') {
    return false;
  }
  // Only check staleness for valid karats
  if (![14, 18, 21, 22, 24].includes(karat)) {
    return true; // Unknown karat = stale
  }
  try {
    return await isSourceStaleSupabase(country, source, karat as 14 | 18 | 21 | 22 | 24, STALE_AFTER_MS);
  } catch (error) {
    console.error(`[Supabase] Error checking staleness for ${source}/${karat} (${country}):`, error);
    return false; // Fail-open: don't reject valid prices on staleness backend errors
  }
}

/**
 * Get last valid buy price for source+karat (uses Supabase, with country support)
 */
async function getLastOkBuy(source: string, karat: number, country: 'EG' | 'AE' | 'SA' | 'US' = 'EG'): Promise<number | null> {
  if (IS_CLOUDFLARE_WORKER && country === 'EG') {
    return null;
  }
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
 * Get effective price for aggregation/validation:
 * prefer buy, fallback to sell when buy is missing.
 */
function getEffectivePrice(sourceResult: SourcePriceResult, karat: number): number | null {
  if (sourceResult.source === 'gold_era') {
    const sell = sourceResult.sells?.[karat];
    if (typeof sell === 'number' && isFinite(sell) && sell > 0) return sell;
    const buy = sourceResult.prices[karat];
    if (typeof buy === 'number' && isFinite(buy) && buy > 0) return buy;
    return null;
  }
  const buy = sourceResult.prices[karat];
  if (typeof buy === 'number' && isFinite(buy) && buy > 0) return buy;
  const sell = sourceResult.sells?.[karat];
  if (typeof sell === 'number' && isFinite(sell) && sell > 0) return sell;
  return null;
}

function hasAnyEffectivePrice(sourceResult: SourcePriceResult): boolean {
  return KARATS.some((karat) => getEffectivePrice(sourceResult, karat) !== null);
}

/** True when weighted-average output has at least one usable buy price (14/18/21/24). */
export function hasValidAggregatedPrices(ingestion: Pick<IngestionResult, 'our_price_buy'>): boolean {
  const b = ingestion.our_price_buy;
  const ok = (k: string) => {
    const v = b[k];
    return typeof v === 'number' && isFinite(v) && v > 0;
  };
  return ok('14') || ok('18') || ok('21') || ok('24');
}

/**
 * Compute weighted average prices and confidence per karat
 */
export async function computeWeightedAverage(
  sourceResults: SourcePriceResult[],
  opts?: { aggregationEnabledSources?: Set<string> }
): Promise<IngestionResult> {
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
    if (opts?.aggregationEnabledSources && !opts.aggregationEnabledSources.has(sourceResult.source)) {
      continue;
    }
    if (hasAnyEffectivePrice(sourceResult)) {
      result.num_sources_ok++;
      const weight = SOURCE_WEIGHTS[sourceResult.source] || 0.5;

      for (const karat of KARATS) {
        const buy = sourceResult.prices[karat];
        const sell = sourceResult.sells?.[karat];
        const effective = getEffectivePrice(sourceResult, karat);
        const hasValidPrice = typeof effective === 'number' && isFinite(effective) && effective > 0;

        if (!hasValidPrice) {
          console.log('[Aggregation] Source price check:', {
            source: sourceResult.source,
            karat,
            buy: buy ?? null,
            sell: sell ?? null,
            chosenPrice: hasValidPrice ? effective : null,
            accepted: false,
            reason: 'no_valid_price',
          });
          continue;
        }

        // Check if stale (async)
        const stale = await isStale(sourceResult.source, karat);
        console.log('[Aggregation] Source price check:', {
          source: sourceResult.source,
          karat,
          buy: buy ?? null,
          sell: sell ?? null,
          chosenPrice: effective,
          stale,
          accepted: true,
          reason: stale ? 'stale_but_used' : null,
        });

        if (!karatData[karat]) {
          karatData[karat] = [];
        }
        karatData[karat].push({
          source: sourceResult.source,
          price: effective,
          weight,
        });
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
    const breakdown: Record<string, {
      buy: number | null;
      sell: number | null;
      valid: boolean;
      stale: boolean;
      reason: string | null;
      note: string | null;
    }> = {};

    for (const sourceResult of sourceResults) {
      const source = sourceResult.source;
      const effectivePrice = getEffectivePrice(sourceResult, karat);
      if (effectivePrice !== null) {
        // Live scrape supplied this karat for this cycle — do not mark stale (DB tracking age is unrelated to write eligibility).
        breakdown[source] = {
          buy: sourceResult.prices[karat] ?? sourceResult.sells?.[karat] ?? null,
          sell: sourceResult.sells?.[karat] ?? null,
          valid: true,
          stale: false,
          reason: null,
          note: sourceResult.notes.length > 0 ? sourceResult.notes.join('; ') : null,
        };
      } else {
        const stale = await isStale(source, karat, 'EG');
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

  const effective = await getEffectiveIngestionConfig(db.supabase);
  console.log('[IngestionConfig] countries enabled', effective.countriesEnabled);

  // Import multi-country adapters and helpers
  const { fetchUAEGoldPrices, fetchSaudiGoldPrices, fetchUSASpotPrices } = await import('./gold-sources-adapters-multicountry');
  const { getLatestGoldSpot } = await import('./supabase/goldSpot');
  const { getImpliedOunceWithCache } = await import('./goldapi');
  const { getMultiCurrencyRates } = await import('./fx-multi');
  const { computeParityPrices, generateParityHash } = await import('./global-parity');

  // 1. EGYPT (existing pipeline)
  console.log('[Ingestion] Processing Egypt (EG)...');
  if (!effective.countriesEnabled.EG) {
    console.warn('[IngestionConfig] EG disabled by admin');
    results['EG'] = { inserted: 0, errors: [] };
  } else {
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
  }

  const globalResult = await runGlobalIngestionCycle({
    effective,
    now,
    helpers: {
      fetchUAEGoldPrices,
      fetchSaudiGoldPrices,
      fetchUSASpotPrices,
      getLatestGoldSpot,
      getImpliedOunceWithCache,
      getMultiCurrencyRates,
      computeParityPrices,
      generateParityHash,
    },
  });

  for (const [country, r] of Object.entries(globalResult.results)) {
    results[country] = r;
  }
  totalInserted += globalResult.totalInserted;

  console.log(`[Ingestion] Multi-country cycle complete: ${totalInserted} total rows inserted`, results);
  return { results, totalInserted };
}

export async function runGlobalIngestionCycle(opts?: {
  effective?: Awaited<ReturnType<typeof getEffectiveIngestionConfig>>;
  now?: number;
  helpers?: {
    fetchUAEGoldPrices: typeof import('./gold-sources-adapters-multicountry').fetchUAEGoldPrices;
    fetchSaudiGoldPrices: typeof import('./gold-sources-adapters-multicountry').fetchSaudiGoldPrices;
    fetchUSASpotPrices: typeof import('./gold-sources-adapters-multicountry').fetchUSASpotPrices;
    getLatestGoldSpot: typeof import('./supabase/goldSpot').getLatestGoldSpot;
    getImpliedOunceWithCache: typeof import('./goldapi').getImpliedOunceWithCache;
    getMultiCurrencyRates: typeof import('./fx-multi').getMultiCurrencyRates;
    computeParityPrices: typeof import('./global-parity').computeParityPrices;
    generateParityHash: typeof import('./global-parity').generateParityHash;
  };
}): Promise<{
  results: Record<string, { inserted: number; errors: string[] }>;
  totalInserted: number;
}> {
  const results: Record<string, { inserted: number; errors: string[] }> = {};
  let totalInserted = 0;
  const now = typeof opts?.now === 'number' ? opts.now : Date.now();
  const effective = opts?.effective ?? (await getEffectiveIngestionConfig(db.supabase));

  const helpers =
    opts?.helpers ??
    (await (async () => {
      const { fetchUAEGoldPrices, fetchSaudiGoldPrices, fetchUSASpotPrices } = await import(
        './gold-sources-adapters-multicountry'
      );
      const { getLatestGoldSpot } = await import('./supabase/goldSpot');
      const { getImpliedOunceWithCache } = await import('./goldapi');
      const { getMultiCurrencyRates } = await import('./fx-multi');
      const { computeParityPrices, generateParityHash } = await import('./global-parity');
      return {
        fetchUAEGoldPrices,
        fetchSaudiGoldPrices,
        fetchUSASpotPrices,
        getLatestGoldSpot,
        getImpliedOunceWithCache,
        getMultiCurrencyRates,
        computeParityPrices,
        generateParityHash,
      };
    })());

  // 1. USA (derive from spot price)
  console.log('[Ingestion] Processing USA (US)...');
  try {
    const spotData = await helpers.getLatestGoldSpot();
    const spotPrice = spotData?.xau_spot_usd_oz ?? null;
    const usResult = await helpers.fetchUSASpotPrices(spotPrice);

    if (usResult.valid && Object.keys(usResult.prices).length > 0) {
      const rawHash = base64Encode(JSON.stringify(usResult)).substring(0, 32);
      const writeResult = await writeMarketSnapshotNorm({
        country: 'US',
        source: 'goldapi_spot',
        trusted: true,
        createdAt: now,
        rawHash,
        prices: {
          24: { buy: usResult.prices[24] || null },
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

  // Fetch impliedOunce and FX for parity computation
  let impliedOunceUsd: number | null = null;
  let fxRates: { usd_aed: number | null; usd_sar: number | null } | null = null;

  try {
    const impliedOunceResult = await helpers.getImpliedOunceWithCache();
    if (impliedOunceResult.data?.impliedOunceUsd) {
      impliedOunceUsd = impliedOunceResult.data.impliedOunceUsd;
    }
  } catch (error) {
    console.warn('[Ingestion] Failed to fetch impliedOunce for parity:', error);
  }

  try {
    const fx = await helpers.getMultiCurrencyRates();
    fxRates = {
      usd_aed: fx.usd_aed,
      usd_sar: fx.usd_sar,
    };
  } catch (error) {
    console.warn('[Ingestion] Failed to fetch FX rates for parity:', error);
  }

  // 2. UAE - Try scraper first, then ALWAYS write parity
  console.log('[Ingestion] Processing UAE (AE)...');
  if (!effective.countriesEnabled.AE) {
    console.warn('[IngestionConfig] AE disabled by admin');
    results['AE'] = { inserted: 0, errors: [] };
  } else {
    let aeScraperInserted = 0;
    try {
      const aeResult = await helpers.fetchUAEGoldPrices();
      if (aeResult.valid && Object.keys(aeResult.prices).length > 0) {
        const rawHash = base64Encode(JSON.stringify(aeResult)).substring(0, 32);
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
        aeScraperInserted = writeResult.inserted || 0;
      }
    } catch (error) {
      console.warn('[Ingestion] UAE scraper failed (will use parity):', error);
    }

    // ALWAYS write parity snapshot for AE (even if scraper succeeded)
    let aeParityInserted = 0;
    if (impliedOunceUsd !== null && fxRates !== null && fxRates.usd_aed !== null && fxRates.usd_aed > 0) {
      try {
        const parityPrices = helpers.computeParityPrices({
          impliedOunceUsd,
          currency: 'AED',
          usdRate: fxRates.usd_aed,
        });

        const parityHash = helpers.generateParityHash('AE', 'global_parity', impliedOunceUsd, fxRates.usd_aed, now);

        const writeResult = await writeMarketSnapshotNorm({
          country: 'AE',
          source: 'global_parity',
          trusted: false,
          createdAt: now,
          rawHash: parityHash,
          prices: {
            24: { buy: parityPrices[24] },
            21: { buy: parityPrices[21] },
            18: { buy: parityPrices[18] },
            14: { buy: parityPrices[14] },
          },
        });

        aeParityInserted = writeResult.inserted || 0;
        console.log('[Ingest] parity inserted', { country: 'AE', inserted: aeParityInserted });
      } catch (error) {
        console.error('[Ingestion] Failed to write AE parity:', error);
      }
    } else {
      console.warn('[Ingestion] Cannot compute AE parity: missing impliedOunce or FX rate');
    }

    results['AE'] = {
      inserted: aeScraperInserted + aeParityInserted,
      errors: [],
    };
    totalInserted += results['AE'].inserted;
  }

  // 3. Saudi Arabia - Try scraper first, then ALWAYS write parity
  console.log('[Ingestion] Processing Saudi Arabia (SA)...');
  if (!effective.countriesEnabled.SA) {
    console.warn('[IngestionConfig] SA disabled by admin');
    results['SA'] = { inserted: 0, errors: [] };
  } else {
    let saScraperInserted = 0;
    try {
      const saResult = await helpers.fetchSaudiGoldPrices();

      if (saResult.valid && Object.keys(saResult.prices).length > 0) {
        const rawHash = base64Encode(JSON.stringify(saResult)).substring(0, 32);
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
        saScraperInserted = writeResult.inserted || 0;
      }
    } catch (error) {
      console.warn('[Ingestion] Saudi Arabia scraper failed (will use parity):', error);
    }

    // ALWAYS write parity snapshot for SA (even if scraper succeeded)
    let saParityInserted = 0;
    if (impliedOunceUsd !== null && fxRates !== null && fxRates.usd_sar !== null && fxRates.usd_sar > 0) {
      try {
        const parityPrices = helpers.computeParityPrices({
          impliedOunceUsd,
          currency: 'SAR',
          usdRate: fxRates.usd_sar,
        });

        const parityHash = helpers.generateParityHash('SA', 'global_parity', impliedOunceUsd, fxRates.usd_sar, now);

        const writeResult = await writeMarketSnapshotNorm({
          country: 'SA',
          source: 'global_parity',
          trusted: false,
          createdAt: now,
          rawHash: parityHash,
          prices: {
            24: { buy: parityPrices[24] },
            21: { buy: parityPrices[21] },
            18: { buy: parityPrices[18] },
            14: { buy: parityPrices[14] },
          },
        });

        saParityInserted = writeResult.inserted || 0;
        console.log('[Ingest] parity inserted', { country: 'SA', inserted: saParityInserted });
      } catch (error) {
        console.error('[Ingestion] Failed to write SA parity:', error);
      }
    } else {
      console.warn('[Ingestion] Cannot compute SA parity: missing impliedOunce or FX rate');
    }

    results['SA'] = {
      inserted: saScraperInserted + saParityInserted,
      errors: [],
    };
    totalInserted += results['SA'].inserted;
  }

  console.log(`[Ingestion] Global cycle complete: ${totalInserted} total rows inserted`, results);
  return { results, totalInserted };
}

export async function runIngestionCycle(): Promise<
  IngestionResult & {
    sourcesWritten: number;
    aggregatedSnapshotWritten: boolean;
    ingestionRunId: string;
    aggregatedMarkedDegraded: boolean;
    sourceWriteDiagnostics: SourceWriteDiagnostics[];
    aggregatedWriteDiagnostics: AggregatedWriteDiagnostics;
    enabledIngestionSources: string[];
    enabledAggregationSources: string[];
    countriesEnabled: { EG: boolean; AE: boolean; SA: boolean };
  }
> {
  const ingestionRunId = newIngestionRunId();
  console.log('[Ingestion] run started', { ingestionRunId });

  const effective = await getEffectiveIngestionConfig(db.supabase);
  const enabledIngestionSources = effective.egypt.ingestionSourcesEnabled;
  const enabledAggregationSources = effective.egypt.aggregationSourcesEnabled;

  console.log('[IngestionConfig] EG ingestion sources enabled', enabledIngestionSources);
  console.log('[IngestionConfig] EG aggregation sources enabled', enabledAggregationSources);

  if (!effective.countriesEnabled.EG) {
    console.warn('[IngestionConfig] EG disabled by admin');
    return {
      timestamp: new Date().toISOString(),
      our_price_buy: {},
      confidence: {},
      sources_used: {},
      breakdown: {},
      errors: ['EG ingestion disabled by admin'],
      num_sources_ok: 0,
      num_sources_errors: 0,
      sourcesWritten: 0,
      aggregatedSnapshotWritten: false,
      ingestionRunId,
      aggregatedMarkedDegraded: false,
      sourceWriteDiagnostics: [],
      aggregatedWriteDiagnostics: {
        attempted: false,
        wideOk: null,
        wideInserted: null,
        wideError: null,
        normOk: null,
        normInserted: null,
        normError: null,
      },
      enabledIngestionSources,
      enabledAggregationSources,
      countriesEnabled: effective.countriesEnabled,
    };
  }

  const sources = enabledIngestionSources;
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
  if (!IS_CLOUDFLARE_WORKER) {
    for (const sourceResult of sourceResults) {
      if (hasAnyEffectivePrice(sourceResult)) {
        for (const karat of KARATS) {
          const effectivePrice = getEffectivePrice(sourceResult, karat);
          if (effectivePrice !== null) {
            // Check for sudden drops (60% drop from last known)
            const lastOk = await getLastOkBuy(sourceResult.source, karat);
            if (lastOk !== null) {
              const dropPct = (lastOk - effectivePrice) / lastOk;
              if (dropPct > 0.60) {
                sourceResult.errors.push(
                  `Karat ${karat}: suspicious 60%+ drop (${lastOk} -> ${effectivePrice})`
                );
                sourceResult.notes.push(`Rejected ${karat}K due to large drop`);
                delete sourceResult.prices[karat];
                if (sourceResult.sells) {
                  delete sourceResult.sells[karat];
                }
                continue;
              }
            }
            
            await updateStaleness(sourceResult.source, karat, effectivePrice);
          }
        }
      }
    }
  } else {
    console.warn('[Ingestion] EG staleness DB operations disabled in Cloudflare Worker runtime');
  }

  // Compute weighted averages
  console.log(`[Ingestion] Computing weighted averages from ${sourceResults.filter(s => s.valid).length} valid sources`);
  const result = await computeWeightedAverage(sourceResults, {
    aggregationEnabledSources: new Set(enabledAggregationSources),
  });
  console.log(`[Ingestion] Weighted averages computed:`, {
    24: result.our_price_buy['24'],
    21: result.our_price_buy['21'],
    18: result.our_price_buy['18'],
    14: result.our_price_buy['14'],
  });

  // Store source results in database (sources first; aggregated only after persistence threshold is known)
  const now = Date.now();
  let sourcesWritten = 0;
  const sourceWriteDiagnostics: SourceWriteDiagnostics[] = [];
  const aggregatedWriteDiagnostics: AggregatedWriteDiagnostics = {
    attempted: false,
    wideOk: null,
    wideInserted: null,
    wideError: null,
    normOk: null,
    normInserted: null,
    normError: null,
  };

  console.log('[Ingestion] source writes phase start', {
    ingestionRunId,
    parsedSourcesOk: result.num_sources_ok,
    parsedSourcesErrors: result.num_sources_errors,
  });

  for (const sourceResult of sourceResults) {
    const rawHash = base64Encode(JSON.stringify(sourceResult)).substring(0, 32);
    const price14 = getEffectivePrice(sourceResult, 14);
    const price18 = getEffectivePrice(sourceResult, 18);
    const price21 = getEffectivePrice(sourceResult, 21);
    const price24 = getEffectivePrice(sourceResult, 24);
    const hasValidPrices = price24 !== null || price21 !== null || price18 !== null || price14 !== null;

    const diag: SourceWriteDiagnostics = {
      source: sourceResult.source,
      valid: !!sourceResult.valid,
      hasValidPrices,
      prices: {
        14: price14,
        18: price18,
        21: price21,
        24: price24,
      },
      wideOk: null,
      wideInserted: null,
      wideError: null,
      normOk: null,
      normInserted: null,
      normError: null,
      countedAsWritten: false,
      skippedReason: null,
    };
    
    try {
      // Write to Supabase using the unified client
      // Check if source is trusted (e.g., goldbullioneg)
      const isTrusted = sourceResult.source === 'goldbullioneg';

      if (hasValidPrices) {
        const snapshotPreview = {
          source: sourceResult.source,
          createdAt: now,
          rawHashPrefix: rawHash.substring(0, 8),
          prices: {
            21: price21,
            24: price24,
            18: price18,
            14: price14,
          },
        };
        console.log('[Ingestion] Preparing snapshot insert (wide+norm):', snapshotPreview);

        try {
          const wideResult = IS_CLOUDFLARE_WORKER
            ? { ok: false, inserted: 0, error: 'wide_disabled_in_worker' }
            : await writeEgyptSnapshotToSupabase({
                source: sourceResult.source,
                trusted: isTrusted,
                createdAtMs: now,
                rawHash,
                ingestionRunId,
                isDegraded: false,
                sourceWriteCount: null,
                freshSourceCount: null,
                degradedReason: null,
                prices: {
                  14: { buy: price14 },
                  18: { buy: price18 },
                  21: { buy: price21 },
                  24: { buy: price24 },
                },
              });
          
          const normResult = await writeMarketSnapshotNorm({
            country: 'EG',
            source: sourceResult.source,
            trusted: isTrusted,
            createdAt: now,
            rawHash,
            ingestionRunId,
            isDegraded: false,
            sourceWriteCount: null,
            freshSourceCount: null,
            degradedReason: null,
            prices: {
              14: { buy: price14 },
              18: { buy: price18 },
              21: { buy: price21 },
              24: { buy: price24 },
            },
          });

          diag.wideOk = wideResult.ok;
          diag.wideInserted = typeof wideResult.inserted === 'number' ? wideResult.inserted : 0;
          diag.wideError = wideResult.ok ? null : wideResult.error || null;
          diag.normOk = normResult.ok;
          diag.normInserted = typeof normResult.inserted === 'number' ? normResult.inserted : 0;
          diag.normError = normResult.ok ? null : normResult.error || null;
          
          const sourceWriteAccepted = wideResult.ok || normResult.ok;
          if (sourceWriteAccepted) {
            sourcesWritten++;
            diag.countedAsWritten = true;
            console.log(`[Ingestion] Wrote snapshot for ${sourceResult.source}: wide=${wideResult.inserted || 0}, norm=${normResult.inserted || 0} row(s)`, {
              source: sourceResult.source,
              accepted: true,
              reason: (wideResult.inserted || normResult.inserted) ? 'inserted_rows' : 'ok_zero_rows_idempotent_or_dedup',
              wideOk: wideResult.ok,
              wideInserted: wideResult.inserted || 0,
              normOk: normResult.ok,
              normInserted: normResult.inserted || 0,
              ingestionRunId,
            });
          } else {
            diag.skippedReason = 'both_writers_not_ok';
            console.error(`[Ingestion] Write skipped/failed for ${sourceResult.source}:`, {
              source: sourceResult.source,
              accepted: false,
              reason: 'both_writers_not_ok',
              wide: wideResult.error,
              norm: normResult.error,
              ingestionRunId,
            });
          }
        } catch (supabaseError) {
          diag.skippedReason = 'write_exception';
          diag.wideOk = diag.wideOk ?? false;
          diag.normOk = diag.normOk ?? false;
          diag.wideError = diag.wideError ?? (supabaseError instanceof Error ? supabaseError.message : String(supabaseError));
          diag.normError = diag.normError ?? (supabaseError instanceof Error ? supabaseError.message : String(supabaseError));
          console.error(`[Ingestion] Write exception for ${sourceResult.source}:`, {
            message: supabaseError instanceof Error ? supabaseError.message : String(supabaseError),
            error: supabaseError,
            ingestionRunId,
          });
        }
      } else {
        diag.skippedReason = 'no_effective_prices';
        console.log(`[Ingestion] Skipping ${sourceResult.source}: valid=${sourceResult.valid}, hasValidPrices=${hasValidPrices}`, {
          source: sourceResult.source,
          accepted: false,
          reason: 'no_effective_prices',
          prices: {
            24: price24,
            21: price21,
            18: price18,
            14: price14,
          },
        });
      }
    } catch (e) {
      diag.skippedReason = diag.skippedReason ?? 'write_loop_exception';
      console.error(`[Ingestion] Failed to store snapshot for ${sourceResult.source}:`, e);
    } finally {
      sourceWriteDiagnostics.push(diag);
    }
  }

  console.log('[Ingestion] source writes completed', {
    ingestionRunId,
    sourcesWritten,
    parsedSourcesOk: result.num_sources_ok,
  });

  const minSources = getEgyptAggregationMinSources();
  const meetsThreshold = sourcesWritten >= minSources;

  let aggregatedWritten = false;
  let aggregatedMarkedDegraded = false;

  if (!hasValidAggregatedPrices(result)) {
    console.warn('[Ingestion] aggregated write skipped: no positive karat prices', {
      ingestionRunId,
      our_price_buy: result.our_price_buy,
    });
  } else if (!meetsThreshold) {
    aggregatedMarkedDegraded = true;
    console.warn('[Ingestion] aggregated write marked degraded: insufficient persisted sources', {
      ingestionRunId,
      sourcesWritten,
      minSourcesRequired: minSources,
    });
  } else {
    console.log('[Ingestion] aggregated write: threshold met', {
      ingestionRunId,
      sourcesWritten,
      minSourcesRequired: minSources,
    });
  }

  if (hasValidAggregatedPrices(result)) {
    try {
      aggregatedWriteDiagnostics.attempted = true;
      const aggregatedHash = base64Encode(JSON.stringify(result)).substring(0, 32);
      const price14 = result.our_price_buy['14'] ?? null;
      const price18 = result.our_price_buy['18'] ?? null;
      const price21 = result.our_price_buy['21'] ?? null;
      const price24 = result.our_price_buy['24'] ?? null;

      const isDegraded = !meetsThreshold;
      const degradedReason = isDegraded
        ? `insufficient_persisted_sources:${sourcesWritten}<${minSources}`
        : null;

      console.log('[Ingestion] aggregated snapshot write attempt', {
        ingestionRunId,
        isDegraded,
        price14,
        price18,
        price21,
        price24,
        sourceWriteCount: sourcesWritten,
        freshSourceCount: result.num_sources_ok,
        degradedReason,
      });

      const wideAggregatedResultFinal = IS_CLOUDFLARE_WORKER
        ? { ok: false, inserted: 0, error: 'wide_disabled_in_worker' }
        : await writeEgyptSnapshotToSupabase({
            source: 'aggregated',
            trusted: false,
            createdAtMs: now,
            rawHash: aggregatedHash,
            ingestionRunId,
            isDegraded,
            sourceWriteCount: sourcesWritten,
            freshSourceCount: result.num_sources_ok,
            degradedReason,
            prices: {
              14: { buy: price14 },
              18: { buy: price18 },
              21: { buy: price21 },
              24: { buy: price24 },
            },
          });

      const normAggregatedResult = await writeMarketSnapshotNorm({
        country: 'EG',
        source: 'aggregated',
        trusted: false,
        createdAt: now,
        rawHash: aggregatedHash,
        ingestionRunId,
        isDegraded,
        sourceWriteCount: sourcesWritten,
        freshSourceCount: result.num_sources_ok,
        degradedReason,
        prices: {
          14: { buy: price14 },
          18: { buy: price18 },
          21: { buy: price21 },
          24: { buy: price24 },
        },
      });

      aggregatedWriteDiagnostics.wideOk = wideAggregatedResultFinal.ok;
      aggregatedWriteDiagnostics.wideInserted = typeof wideAggregatedResultFinal.inserted === 'number' ? wideAggregatedResultFinal.inserted : 0;
      aggregatedWriteDiagnostics.wideError = wideAggregatedResultFinal.ok ? null : wideAggregatedResultFinal.error || null;
      aggregatedWriteDiagnostics.normOk = normAggregatedResult.ok;
      aggregatedWriteDiagnostics.normInserted = typeof normAggregatedResult.inserted === 'number' ? normAggregatedResult.inserted : 0;
      aggregatedWriteDiagnostics.normError = normAggregatedResult.ok ? null : normAggregatedResult.error || null;

      const aggregatedWriteAccepted = wideAggregatedResultFinal.ok || normAggregatedResult.ok;
      if (aggregatedWriteAccepted) {
        aggregatedWritten = true;
        console.log(
          `[Ingestion] aggregated snapshot persisted: wide=${wideAggregatedResultFinal.inserted || 0}, norm=${normAggregatedResult.inserted || 0}`,
          {
            ingestionRunId,
            isDegraded,
            sourcesWritten,
            wideOk: wideAggregatedResultFinal.ok,
            normOk: normAggregatedResult.ok,
            degradedReason,
          }
        );
      } else {
        const errorMsg = normAggregatedResult.error || wideAggregatedResultFinal.error || 'Unknown error';
        console.error(`[Ingestion] aggregated snapshot failed`, errorMsg, {
          ingestionRunId,
          wide: wideAggregatedResultFinal.error,
          norm: normAggregatedResult.error,
        });
      }
    } catch (aggregatedError) {
      aggregatedWriteDiagnostics.attempted = true;
      aggregatedWriteDiagnostics.wideOk = aggregatedWriteDiagnostics.wideOk ?? false;
      aggregatedWriteDiagnostics.normOk = aggregatedWriteDiagnostics.normOk ?? false;
      const msg = aggregatedError instanceof Error ? aggregatedError.message : String(aggregatedError);
      aggregatedWriteDiagnostics.wideError = aggregatedWriteDiagnostics.wideError ?? msg;
      aggregatedWriteDiagnostics.normError = aggregatedWriteDiagnostics.normError ?? msg;
      console.error(`[Ingestion] Exception writing aggregated snapshot:`, aggregatedError);
    }
  }

  console.log(`[Ingestion] Completed: ${sourcesWritten} sources persisted, aggregated: ${aggregatedWritten ? 'YES' : 'NO'}`, {
    ingestionRunId,
    aggregatedMarkedDegraded,
  });

  console.log('[Ingestion] freshness evaluation summary', {
    ingestionRunId,
    marketNowMs: Date.now(),
    persistedSources: sourcesWritten,
    aggregationThreshold: minSources,
    meetsThreshold,
  });

  return {
    ...result,
    sourcesWritten,
    aggregatedSnapshotWritten: aggregatedWritten,
    ingestionRunId,
    aggregatedMarkedDegraded,
    sourceWriteDiagnostics,
    aggregatedWriteDiagnostics,
    enabledIngestionSources,
    enabledAggregationSources,
    countriesEnabled: effective.countriesEnabled,
  };
}