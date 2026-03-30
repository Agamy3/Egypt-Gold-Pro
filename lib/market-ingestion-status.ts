import 'server-only';

import db from './supabase';

const IS_CLOUDFLARE_WORKER = typeof (globalThis as any).WebSocketPair !== 'undefined';

function getExpectedFrequencyMinutes(): number {
  const raw = Number(process.env.EG_EXPECTED_INGEST_FREQUENCY_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return IS_CLOUDFLARE_WORKER ? 5 : 1;
}

export type EgyptIngestionStatus = {
  lastIngestionAt: string | null;
  ageMinutes: number | null;
  status: 'healthy' | 'delayed' | 'stale' | 'dead';
};

export async function getLatestEgyptIngestionStatus(nowMs: number = Date.now()): Promise<EgyptIngestionStatus> {
  const { data, error } = await db.supabase
    .from('market_snapshots_norm')
    .select('created_at')
    .eq('country', 'EG')
    .eq('source', 'aggregated')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[IngestionStatus] query error:', error.message);
  }

  const createdAt = (data?.created_at as string) ?? null;

  if (!createdAt) {
    return {
      lastIngestionAt: null,
      ageMinutes: null,
      status: 'dead',
    };
  }

  const ts = new Date(createdAt).getTime();
  const ageMs = isFinite(ts) ? nowMs - ts : NaN;
  const ageMinutes = isFinite(ageMs) ? Math.max(0, Math.floor(ageMs / 60000)) : null;

  const expected = getExpectedFrequencyMinutes();

  // Frequency-aware thresholds.
  // - healthy: within ~1 run interval (+1 minute buffer)
  // - delayed: within ~2 run intervals
  // - stale: within ~12 run intervals (caps near 1 hour when expected=5)
  // - dead: beyond that
  const healthyMax = expected + 1;
  const delayedMax = expected * 2;
  const staleMax = expected * 12;

  let status: EgyptIngestionStatus['status'] = 'dead';
  if (ageMinutes === null) status = 'dead';
  else if (ageMinutes <= healthyMax) status = 'healthy';
  else if (ageMinutes <= delayedMax) status = 'delayed';
  else if (ageMinutes <= staleMax) status = 'stale';
  else status = 'dead';

  console.log('[IngestionStatus] EG aggregated last run:', {
    lastIngestionAt: createdAt,
    ageMinutes,
    status,
  });

  return {
    lastIngestionAt: createdAt,
    ageMinutes,
    status,
  };
}
