import 'server-only';

import db from './supabase';

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

  let status: EgyptIngestionStatus['status'] = 'dead';
  if (ageMinutes === null) status = 'dead';
  else if (ageMinutes <= 2) status = 'healthy';
  else if (ageMinutes <= 5) status = 'delayed';
  else if (ageMinutes <= 60) status = 'stale';
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
