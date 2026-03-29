/**
 * Centralized Egypt market ingestion health / same-run validation.
 * Used by read paths, admin diagnostics, and debug APIs.
 */

import 'server-only';

import db from './supabase';
import {
  EG_WEB_SOURCES,
  getEgyptAggregationMinSources,
  MARKET_HEALTH_FRESHNESS_MS,
} from './gold-ingestion-config';

export type MarketHealthBadge = 'green' | 'yellow' | 'red';

export function isFreshTimestamp(
  createdAt: Date | string | number | null | undefined,
  maxAgeMs: number,
  nowMs: number = Date.now()
): boolean {
  if (createdAt === null || createdAt === undefined) return false;
  const t =
    typeof createdAt === 'number'
      ? createdAt
      : createdAt instanceof Date
        ? createdAt.getTime()
        : new Date(createdAt).getTime();
  if (!isFinite(t) || t <= 0) return false;
  return nowMs - t <= maxAgeMs;
}

export async function countEgSourcesPersistedForRun(runId: string, nowMs: number): Promise<number> {
  const cutoff = new Date(nowMs - MARKET_HEALTH_FRESHNESS_MS).toISOString();
  const { data, error } = await db.supabase
    .from('market_snapshots_norm')
    .select('source')
    .eq('country', 'EG')
    .eq('ingestion_run_id', runId)
    .in('source', EG_WEB_SOURCES)
    .gte('created_at', cutoff);

  if (error) {
    console.warn('[MarketHealth] countEgSourcesPersistedForRun error:', error.message);
    return 0;
  }

  return new Set((data || []).map((r) => String(r.source))).size;
}

/**
 * Whether a normalized `aggregated` row may be treated as backed by fresh same-run sources.
 */
export async function verifyEgAggregatedNormRow(
  row: Record<string, unknown>,
  nowMs: number,
  verifyCache: Map<string, boolean>
): Promise<boolean> {
  if (row.source !== 'aggregated') return true;
  if (row.is_degraded === true) return false;
  const runId = row.ingestion_run_id;
  if (!runId || typeof runId !== 'string') return false;
  if (!isFreshTimestamp(row.created_at as string, MARKET_HEALTH_FRESHNESS_MS, nowMs)) return false;
  if (verifyCache.has(runId)) return verifyCache.get(runId)!;
  const n = await countEgSourcesPersistedForRun(runId, nowMs);
  const ok = n >= getEgyptAggregationMinSources();
  verifyCache.set(runId, ok);
  return ok;
}

export type EgyptMarketTrustFlags = {
  aggregatedFresh: boolean;
  sourceBacked: boolean;
  sameRunBacked: boolean;
  meetsThreshold: boolean;
  homepageSafeToUse: boolean;
  degradedReason: string | null;
};

export async function evaluateLatestEgyptAggregatedTrust(
  nowMs = Date.now()
): Promise<{
  latestAgg: Record<string, unknown> | null;
  trust: EgyptMarketTrustFlags;
}> {
  const threshold = getEgyptAggregationMinSources();
  const { data: aggRow } = await db.supabase
    .from('market_snapshots_norm')
    .select(
      'id,karat,price,created_at,source,ingestion_run_id,is_degraded,source_write_count,fresh_source_count,degraded_reason'
    )
    .eq('country', 'EG')
    .eq('source', 'aggregated')
    .eq('karat', 21)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = (aggRow || null) as Record<string, unknown> | null;
  const cache = new Map<string, boolean>();
  const aggregatedFresh =
    !!row && isFreshTimestamp(row.created_at as string, MARKET_HEALTH_FRESHNESS_MS, nowMs);
  const sameRunBacked = !!row && (await verifyEgAggregatedNormRow(row, nowMs, cache));

  let persistedInRun = 0;
  const runId = row?.ingestion_run_id;
  if (runId && typeof runId === 'string') {
    persistedInRun = await countEgSourcesPersistedForRun(runId, nowMs);
  }

  const meetsThreshold = persistedInRun >= threshold;
  const sourceBacked = meetsThreshold;

  const degradedReason =
    (row?.is_degraded === true ? String(row.degraded_reason ?? 'aggregated_degraded') : null) ||
    (!sameRunBacked && row ? 'aggregated_not_same_run_backed' : null);

  const homepageSafeToUse = aggregatedFresh && sameRunBacked;

  return {
    latestAgg: row,
    trust: {
      aggregatedFresh,
      sourceBacked,
      sameRunBacked,
      meetsThreshold,
      homepageSafeToUse,
      degradedReason,
    },
  };
}

export type EgyptMarketDiagnostics = {
  serverNowIso: string;
  serverNowMs: number;
  freshnessWindowHours: number;
  aggregationMinSources: number;
  healthBadge: MarketHealthBadge;
  trust: EgyptMarketTrustFlags;
  latestIngestionRunId: string | null;
  latestAggregated: null | {
    createdAt: string | null;
    ageMinutes: number | null;
    karat: number | null;
    price: number | null;
    ingestionRunId: string | null;
    isDegraded: boolean | null;
    sourceWriteCount: number | null;
    freshSourceCount: number | null;
    degradedReason: string | null;
  };
  sources: Array<{
    source: string;
    latestCreatedAt: string | null;
    ageMinutes: number | null;
    price21: number | null;
    ingestionRunId: string | null;
    stale: boolean;
  }>;
  homepageUsesLatestAggregated: boolean;
  notes: string[];
};

export async function getEgyptMarketIngestionDiagnostics(nowMs = Date.now()): Promise<EgyptMarketDiagnostics> {
  const threshold = getEgyptAggregationMinSources();
  const { latestAgg, trust } = await evaluateLatestEgyptAggregatedTrust(nowMs);
  const notes: string[] = [];

  const sources: EgyptMarketDiagnostics['sources'] = [];
  for (const source of EG_WEB_SOURCES) {
    const { data, error } = await db.supabase
      .from('market_snapshots_norm')
      .select('price, created_at, karat, ingestion_run_id')
      .eq('country', 'EG')
      .eq('source', source)
      .eq('karat', 21)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      notes.push(`${source} query: ${error.message}`);
    }

    const createdAt = (data?.created_at as string) ?? null;
    const ageMinutes =
      createdAt !== null ? Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 60000)) : null;
    const stale = createdAt === null || !isFreshTimestamp(createdAt, MARKET_HEALTH_FRESHNESS_MS, nowMs);

    sources.push({
      source,
      latestCreatedAt: createdAt,
      ageMinutes,
      price21: data?.price != null ? Number(data.price) : null,
      ingestionRunId: (data?.ingestion_run_id as string) ?? null,
      stale,
    });
  }

  const latestRunFromAgg = (latestAgg?.ingestion_run_id as string) ?? null;
  const latestRunFromSources = sources.map((s) => s.ingestionRunId).find(Boolean) ?? null;
  const latestIngestionRunId = latestRunFromAgg || latestRunFromSources;

  const aggCreated = (latestAgg?.created_at as string) ?? null;
  const aggAgeMin =
    aggCreated !== null ? Math.max(0, Math.floor((nowMs - new Date(aggCreated).getTime()) / 60000)) : null;

  let healthBadge: MarketHealthBadge = 'red';
  if (trust.homepageSafeToUse) healthBadge = 'green';
  else if (latestAgg && trust.aggregatedFresh) healthBadge = 'yellow';
  else if (sources.some((s) => !s.stale)) healthBadge = 'yellow';

  const homepageUsesLatestAggregated = trust.homepageSafeToUse;

  return {
    serverNowIso: new Date(nowMs).toISOString(),
    serverNowMs: nowMs,
    freshnessWindowHours: MARKET_HEALTH_FRESHNESS_MS / 3600000,
    aggregationMinSources: threshold,
    healthBadge,
    trust,
    latestIngestionRunId,
    latestAggregated: latestAgg
      ? {
          createdAt: aggCreated,
          ageMinutes: aggAgeMin,
          karat: latestAgg.karat != null ? Number(latestAgg.karat) : null,
          price: latestAgg.price != null ? Number(latestAgg.price) : null,
          ingestionRunId: latestRunFromAgg,
          isDegraded: latestAgg.is_degraded === true ? true : latestAgg.is_degraded === false ? false : null,
          sourceWriteCount:
            latestAgg.source_write_count != null ? Number(latestAgg.source_write_count) : null,
          freshSourceCount:
            latestAgg.fresh_source_count != null ? Number(latestAgg.fresh_source_count) : null,
          degradedReason: latestAgg.degraded_reason ? String(latestAgg.degraded_reason) : null,
        }
      : null,
    sources,
    homepageUsesLatestAggregated,
    notes,
  };
}
