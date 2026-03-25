/**
 * Build admin diagnostics from Supabase snapshots + source_staleness.
 * Read-only — no external scraping.
 */

import 'server-only';

import db from '@/lib/supabase';
import { SOURCE_WEIGHTS, STALE_AFTER_MS } from '@/lib/gold-ingestion-config';
import { getLatestGoldSpot } from '@/lib/supabase/goldSpot';
import { getAdminSourceRegistry } from '@/lib/admin/source-price-registry';
import type {
  AdminSourcePriceDiagnosticsPayload,
  AdminSourcePriceRow,
  DiagnosticsHealth,
  StaleBasis,
} from '@/lib/admin/source-price-diagnostics-types';

const KARAT_LIST = [14, 18, 21, 22, 24] as const;

type WideRow = {
  source: string;
  createdAt: number;
  error: string | null;
  httpStatus: number | null;
  url: string | null;
  market14Buy: number | null;
  market14Sell: number | null;
  market18Buy: number | null;
  market18Sell: number | null;
  market21Buy: number | null;
  market21Sell: number | null;
  market24Buy: number | null;
  market24Sell: number | null;
};

type NormRow = {
  country: string;
  source: string;
  karat: number;
  price: number | null;
  currency: string | null;
  trusted: boolean | null;
  created_at: string;
};

type StalenessRow = {
  country: string;
  source: string;
  karat: number;
  last_ok_timestamp: string;
  last_ok_price: number | null;
};

function karatKey(k: number): '14' | '18' | '21' | '22' | '24' | null {
  if (k === 14 || k === 18 || k === 21 || k === 22 || k === 24) return String(k) as '14' | '18' | '21' | '22' | '24';
  return null;
}

function wideToVals(row: WideRow | null): {
  buy: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>;
  sell: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>;
} {
  if (!row) return { buy: {}, sell: {} };
  return {
    buy: {
      14: row.market14Buy,
      18: row.market18Buy,
      21: row.market21Buy,
      24: row.market24Buy,
    },
    sell: {
      14: row.market14Sell,
      18: row.market18Sell,
      21: row.market21Sell,
      24: row.market24Sell,
    },
  };
}

function effectivePrice(
  buy: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>,
  sell: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>,
  k: typeof KARAT_LIST[number]
): number | null {
  const kk = String(k) as '14' | '18' | '21' | '22' | '24';
  const b = buy[kk];
  const s = sell[kk];
  if (typeof b === 'number' && isFinite(b) && b > 0) return b;
  if (typeof s === 'number' && isFinite(s) && s > 0) return s;
  return null;
}

function hasAnyEffective(
  buy: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>,
  sell: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>
): boolean {
  for (const k of KARAT_LIST) {
    if (effectivePrice(buy, sell, k) !== null) return true;
  }
  return false;
}

/** Prefer 24k for staleness summary; if no 24k price, use richest karat present. */
function representativeKarat(
  buy: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>,
  sell: Partial<Record<'14' | '18' | '21' | '22' | '24', number | null>>
): (typeof KARAT_LIST)[number] {
  for (const k of [24, 22, 21, 18, 14] as const) {
    if (effectivePrice(buy, sell, k) !== null) return k;
  }
  return 24;
}

function bucketWideRows(rows: WideRow[]): Map<string, { latestAny: WideRow; latestOk: WideRow | null }> {
  const m = new Map<string, { latestAny: WideRow; latestOk: WideRow | null }>();
  for (const r of rows) {
    const ex = m.get(r.source);
    if (!ex) {
      m.set(r.source, { latestAny: r, latestOk: r.error ? null : r });
    } else if (!ex.latestOk && !r.error) {
      ex.latestOk = r;
    }
  }
  return m;
}

function bucketNormRows(rows: NormRow[]): Map<string, Map<number, NormRow>> {
  const out = new Map<string, Map<number, NormRow>>();
  for (const r of rows) {
    const key = `${r.country}|${r.source}`;
    if (!out.has(key)) out.set(key, new Map());
    const km = out.get(key)!;
    if (!km.has(r.karat)) km.set(r.karat, r);
  }
  return out;
}

function bucketStaleness(rows: StalenessRow[]): Map<string, StalenessRow> {
  const m = new Map<string, StalenessRow>();
  for (const r of rows) {
    m.set(`${r.country}|${r.source}|${r.karat}`, r);
  }
  return m;
}

function stalenessEval(
  lastOkIso: string | null,
  staleAfterMs: number
): { stale: boolean; reason: string | null; ageMs: number | null } {
  if (!lastOkIso) {
    return { stale: true, reason: 'no_staleness_or_snapshot_time', ageMs: null };
  }
  const t = new Date(lastOkIso).getTime();
  if (!isFinite(t) || t <= 0) {
    return { stale: true, reason: 'invalid_timestamp', ageMs: null };
  }
  const ageMs = Date.now() - t;
  if (ageMs > staleAfterMs) {
    return { stale: true, reason: 'age_exceeds_threshold', ageMs };
  }
  return { stale: false, reason: null, ageMs };
}

function maxIsoStrings(...inputs: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const s of inputs) {
    if (!s) continue;
    const t = new Date(s).getTime();
    if (isFinite(t) && t > bestT) {
      bestT = t;
      best = s;
    }
  }
  return best;
}

export async function getSourcePriceDiagnostics(): Promise<AdminSourcePriceDiagnosticsPayload> {
  const loadWarnings: string[] = [];
  const registry = getAdminSourceRegistry();

  const widePromise = db.supabase
    .from('market_snapshots')
    .select(
      'source, createdAt, error, httpStatus, url, market14Buy, market14Sell, market18Buy, market18Sell, market21Buy, market21Sell, market24Buy, market24Sell'
    )
    .order('createdAt', { ascending: false })
    .limit(2500);

  const normPromise = db.supabase
    .from('market_snapshots_norm')
    .select('country, source, karat, price, currency, trusted, created_at')
    .in('country', ['EG', 'AE', 'SA', 'US'])
    .order('created_at', { ascending: false })
    .limit(5000);

  const stalePromise = db.supabase.from('source_staleness').select('country, source, karat, last_ok_timestamp, last_ok_price');

  const spotPromise = getLatestGoldSpot();

  const [wideRes, normRes, staleRes, spot] = await Promise.all([widePromise, normPromise, stalePromise, spotPromise]);

  if (wideRes.error) {
    loadWarnings.push(`market_snapshots: ${wideRes.error.message}`);
  }
  if (normRes.error) {
    loadWarnings.push(`market_snapshots_norm: ${normRes.error.message}`);
  }
  if (staleRes.error) {
    loadWarnings.push(`source_staleness: ${staleRes.error.message}`);
  }

  const wideBucket = bucketWideRows((wideRes.data || []) as WideRow[]);
  const normBucket = bucketNormRows((normRes.data || []) as NormRow[]);
  const staleMap = bucketStaleness((staleRes.data || []) as StalenessRow[]);

  const egWeightedKeys = Object.keys(SOURCE_WEIGHTS);
  const generatedAt = new Date().toISOString();

  const rows: AdminSourcePriceRow[] = [];

  for (const def of registry) {
    const { country, sourceId: source, kind, adapterLabel } = def;
    const normKey = `${country}|${source}`;
    const nm = normBucket.get(normKey) || new Map<number, NormRow>();
    const w = wideBucket.get(source);

    const wideAny = w?.latestAny ?? null;
    const wideOk = w?.latestOk ?? null;

    const { buy: wBuy, sell: wSell } = wideToVals(wideOk || wideAny);
    const buy: AdminSourcePriceRow['buyByKarat'] = { ...wBuy };
    const sell: AdminSourcePriceRow['sellByKarat'] = { ...wSell };

    let currency: string | null = null;
    let trustedLatest: boolean | null = null;
    let lastNormIso: string | null = null;

    for (const k of KARAT_LIST) {
      const rec = nm.get(k);
      if (!rec) continue;
      lastNormIso = maxIsoStrings(lastNormIso, rec.created_at);
      const kk = karatKey(k);
      if (!kk) continue;
      if (rec.price != null && isFinite(Number(rec.price))) {
        if (buy[kk] == null || buy[kk] === undefined) {
          buy[kk] = Number(rec.price);
        }
      }
      if (trustedLatest === null) trustedLatest = !!rec.trusted;
      else if (rec.trusted === true) trustedLatest = true;
      if (!currency && rec.currency) currency = rec.currency;
    }

    const wideIso = wideAny ? new Date(wideAny.createdAt).toISOString() : null;
    const lastCheckedAt = maxIsoStrings(wideIso, lastNormIso);

    let lastSuccessFromStaleness: string | null = null;
    const perKaratStale: AdminSourcePriceRow['perKaratStale'] = {};

    for (const k of KARAT_LIST) {
      const st = staleMap.get(`${country}|${source}|${k}`);
      const stIso = st?.last_ok_timestamp ?? null;
      if (stIso) {
        lastSuccessFromStaleness = maxIsoStrings(lastSuccessFromStaleness, stIso);
      }
      const normRow = nm.get(k);
      const snapIso =
        normRow?.created_at && effectivePrice(buy, sell, k) != null ? normRow.created_at : null;
      const refIso = maxIsoStrings(stIso, snapIso);
      const ev = stalenessEval(refIso, STALE_AFTER_MS);
      const kk = karatKey(k);
      if (kk) perKaratStale[kk] = ev.stale;
    }

    const snapSuccessIso = lastNormIso;
    const lastSuccessAt = maxIsoStrings(lastSuccessFromStaleness, wideOk ? new Date(wideOk.createdAt).toISOString() : null, snapSuccessIso);

    const anyStalenessRow = KARAT_LIST.some((k) => staleMap.has(`${country}|${source}|${k}`));
    let staleBasis: StaleBasis = 'none';
    if (anyStalenessRow) staleBasis = 'source_staleness';
    else if (lastCheckedAt || lastSuccessAt) staleBasis = 'snapshot_age';

    const repK = representativeKarat(buy, sell);
    const ref = maxIsoStrings(
      staleMap.get(`${country}|${source}|${repK}`)?.last_ok_timestamp,
      nm.get(repK)?.created_at && effectivePrice(buy, sell, repK) != null ? nm.get(repK)!.created_at : null,
      wideOk && effectivePrice(wBuy, wSell, repK) != null ? new Date(wideOk.createdAt).toISOString() : null
    );
    const summaryEv = stalenessEval(ref, STALE_AFTER_MS);
    const summaryStale = summaryEv.stale;
    const summaryReason = summaryEv.reason;
    const summaryAge = summaryEv.ageMs;

    const valid = hasAnyEffective(buy, sell);

    let errorMessage: string | null = null;
    if (!valid) {
      if (wideAny?.error) errorMessage = String(wideAny.error);
      else if (kind === 'aggregate_output') errorMessage = 'aggregate_row_missing_in_window';
      else errorMessage = 'no_usable_price_in_storage';
    }

    let usedInWeightedAggregation: boolean | null = null;
    if (country === 'EG' && egWeightedKeys.includes(source)) {
      usedInWeightedAggregation = hasAnyEffective(buy, sell);
    } else if (country === 'EG' && (kind === 'aggregate_output' || kind === 'legacy_adapter')) {
      usedInWeightedAggregation = null;
    } else {
      usedInWeightedAggregation = null;
    }

    let globalReference: string | null = null;
    if (source === 'goldapi_spot' && spot?.xau_spot_usd_oz) {
      globalReference = `gold_spot cache ≈ $${spot.xau_spot_usd_oz.toFixed(2)}/oz`;
    } else if (source === 'global_parity') {
      globalReference = spot?.xau_spot_usd_oz
        ? `parity uses implied/spot (~$${spot.xau_spot_usd_oz.toFixed(2)}/oz) × FX`
        : 'parity uses implied ounce × FX (spot cache empty)';
    }

    let storageCoverage: AdminSourcePriceRow['storageCoverage'] = 'none';
    const hasWide = !!(wideOk || wideAny);
    const hasNorm = nm.size > 0;
    if (hasWide && hasNorm) storageCoverage = 'both';
    else if (hasWide) storageCoverage = 'wide';
    else if (hasNorm) storageCoverage = 'norm';

    let health: DiagnosticsHealth;
    if (!valid) {
      health = wideAny?.error ? 'failed' : 'missing_data';
    } else if (summaryStale) {
      health = 'stale';
    } else {
      health = 'healthy';
    }

    const notes: string[] = [];
    if (storageCoverage === 'none') {
      notes.push('No rows found in market_snapshots / market_snapshots_norm for this key (within fetch limit).');
    }
    if (valid && wideAny?.error) {
      notes.push(`Latest wide snapshot recorded an error; prices may come from norm or older wide success: ${wideAny.error}`);
    }

    rows.push({
      country,
      sourceId: source,
      adapterLabel,
      kind,
      buyByKarat: buy,
      sellByKarat: sell,
      currency,
      trustedLatest,
      lastCheckedAt,
      lastSuccessAt,
      stale: summaryStale,
      staleBasis,
      staleAfterMs: STALE_AFTER_MS,
      freshnessAgeMs: summaryAge,
      staleReason: summaryReason,
      valid,
      errorMessage,
      notes,
      usedInWeightedAggregation,
      globalReference,
      storageCoverage,
      perKaratStale,
      health,
    });
  }

  return {
    generatedAt,
    staleAfterMs: STALE_AFTER_MS,
    rows,
    meta: {
      goldSpotUsdPerOz: spot?.xau_spot_usd_oz ?? null,
      goldSpotFetchedAt: spot ? new Date(spot.fetched_at).toISOString() : null,
      goldSpotStale: spot?.stale ?? null,
      loadWarnings,
    },
  };
}
