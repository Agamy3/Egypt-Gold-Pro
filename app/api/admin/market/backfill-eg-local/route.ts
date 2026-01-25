/**
 * Admin EG Local History Backfill
 *
 * POST /api/admin/market/backfill-eg-local
 *
 * - Admin-only (getUserStatus.isAdmin) OR CRON_SECRET header
 * - Builds a low-frequency "aggregated" EG history series from high-frequency wide snapshots
 *   (market_snapshots) and writes it into the normalized table (market_snapshots_norm).
 * - Idempotent via unique index on (country, karat, raw_hash) (see migration 0019).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserStatus } from '@/lib/auth/getUserStatus';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;
const MAX_ROWS = 600_000; // safety cap (prevents runaway on very high-frequency ingestion)
const INSERT_CHUNK = 1000; // normalized rows per upsert call

type WideRow = {
  source: string;
  createdAt: number;
  rawHash: string | null;
  market24Buy: number | null;
  market21Buy: number | null;
  market18Buy: number | null;
  market14Buy: number | null;
};

type BucketAgg = {
  v24: number[];
  v21: number[];
  v18: number[];
  v14: number[];
};

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString();
  try {
    const cronSecretHeader = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    const status = await getUserStatus();
    const isAdmin = status.isAdmin === true;
    const hasValidCronSecret = Boolean(expectedSecret && cronSecretHeader === expectedSecret);

    if (!isAdmin && !hasValidCronSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const daysRaw = typeof body.days === 'number' ? body.days : 30;
    const days = Math.max(1, Math.min(365, Math.floor(daysRaw)));

    const nowMs = Date.now();
    const windowStartMs = nowMs - days * 24 * 60 * 60 * 1000;

    const supabase = createAdminClient();

    let pagesFetched = 0;
    let wideRowsScanned = 0;
    let normRowsAttempted = 0;
    let normUpsertCalls = 0;
    let bucketsCount = 0;
    let bucketMinutes: number;

    // Choose a bucket size based on how far back we backfill (keeps row count bounded).
    const bucketMinutesRaw = typeof body.bucketMinutes === 'number' ? body.bucketMinutes : null;
    if (bucketMinutesRaw && isFinite(bucketMinutesRaw) && bucketMinutesRaw > 0) {
      bucketMinutes = Math.max(5, Math.min(24 * 60, Math.floor(bucketMinutesRaw)));
    } else {
      bucketMinutes =
        days <= 7
          ? 10
          : days <= 30
            ? 60
            : days <= 90
              ? 240
              : 720; // 12h
    }
    const bucketMs = bucketMinutes * 60 * 1000;

    const pendingNormRows: Array<{
      country: 'EG';
      market: 'local';
      karat: 14 | 18 | 21 | 24;
      price: number;
      currency: 'EGP';
      source: string;
      trusted: boolean;
      created_at: string;
      raw_hash: string | null;
    }> = [];

    const flush = async () => {
      if (pendingNormRows.length === 0) return;
      // Chunk inserts to keep payload sizes reasonable
      while (pendingNormRows.length > 0) {
        const chunk = pendingNormRows.splice(0, INSERT_CHUNK);
        normRowsAttempted += chunk.length;
        normUpsertCalls += 1;

        const { error } = await supabase
          .from('market_snapshots_norm')
          .upsert(chunk, { onConflict: 'country,karat,raw_hash', ignoreDuplicates: true });

        if (error) {
          // Most common cause: missing unique index in Supabase (migration not applied yet)
          throw new Error(`Backfill upsert failed: ${error.message}`);
        }
      }
    };

    const buckets = new Map<number, BucketAgg>();

    const getOrInitBucket = (t: number): BucketAgg => {
      const key = Math.floor(t / bucketMs) * bucketMs;
      let b = buckets.get(key);
      if (!b) {
        b = { v24: [], v21: [], v18: [], v14: [] };
        buckets.set(key, b);
      }
      return b;
    };

    const pushVal = (arr: number[], v: unknown) => {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return;
      arr.push(n);
    };

    const derive24 = (r: WideRow): number | null => {
      const v24 = Number(r.market24Buy);
      if (isFinite(v24) && v24 > 0) return v24;
      const v21 = Number(r.market21Buy);
      if (isFinite(v21) && v21 > 0) return (v21 * 24) / 21;
      const v18 = Number(r.market18Buy);
      if (isFinite(v18) && v18 > 0) return (v18 * 24) / 18;
      const v14 = Number(r.market14Buy);
      if (isFinite(v14) && v14 > 0) return (v14 * 24) / 14;
      return null;
    };

    // Keyset pagination by createdAt (avoids offset pagination cost and allows scanning large windows).
    let cursor = windowStartMs - 1;
    // Use the "local" EG sources; aggregated can be included, but we compute our own aggregation anyway.
    const sources = ['banklive', 'gold_era', 'dokangold', 'goldrate24', 'goldbullioneg', 'aggregated'];

    while (cursor < nowMs) {
      const { data, error } = await supabase
        .from('market_snapshots')
        .select('source, createdAt, rawHash, market24Buy, market21Buy, market18Buy, market14Buy, error')
        .in('source', sources)
        .gt('createdAt', cursor)
        .lte('createdAt', nowMs)
        .is('error', null)
        .order('createdAt', { ascending: true })
        .limit(PAGE_SIZE);

      if (error) throw new Error(`Backfill fetch failed: ${error.message}`);

      const wideRows = (data || []) as unknown as WideRow[];
      pagesFetched += 1;
      wideRowsScanned += wideRows.length;
      if (wideRowsScanned > MAX_ROWS) {
        break;
      }

      for (const r of wideRows) {
        const createdAtMs = typeof r.createdAt === 'number' ? r.createdAt : Number(r.createdAt);
        if (!isFinite(createdAtMs) || createdAtMs <= 0) continue;
        if (createdAtMs < windowStartMs || createdAtMs > nowMs) continue;
        cursor = Math.max(cursor, createdAtMs);

        const b = getOrInitBucket(createdAtMs);
        // Use real karats when present; always record derived 24k as well.
        const d24 = derive24(r);
        if (d24 !== null) b.v24.push(d24);
        pushVal(b.v21, r.market21Buy);
        pushVal(b.v18, r.market18Buy);
        pushVal(b.v14, r.market14Buy);
      }

      if (wideRows.length < PAGE_SIZE) break;
      if (cursor >= nowMs) break;
    }

    bucketsCount = buckets.size;

    const median = (arr: number[]): number | null => {
      if (arr.length === 0) return null;
      const a = [...arr].sort((x, y) => x - y);
      const mid = Math.floor(a.length / 2);
      return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
    };

    // Write aggregated bucket medians into normalized table as source='aggregated'
    for (const [t, b] of buckets.entries()) {
      const created_at = new Date(t).toISOString();
      const pushAgg = (karat: 14 | 18 | 21 | 24, value: number | null) => {
        if (value === null || !isFinite(value) || value <= 0) return;
        // Deterministic raw_hash per bucket+karat so the job is idempotent.
        const raw_hash = `agg:${t}:${karat}`;
        pendingNormRows.push({
          country: 'EG',
          market: 'local',
          karat,
          price: value,
          currency: 'EGP',
          source: 'aggregated',
          trusted: false,
          created_at,
          raw_hash,
        });
      };

      pushAgg(24, median(b.v24));
      pushAgg(21, median(b.v21));
      pushAgg(18, median(b.v18));
      pushAgg(14, median(b.v14));

      if (pendingNormRows.length >= INSERT_CHUNK) {
        await flush();
      }
    }

    await flush();

    const endedAt = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      startedAt,
      endedAt,
      params: { days },
      stats: {
        pagesFetched,
        wideRowsScanned,
        normRowsAttempted,
        normUpsertCalls,
        bucketsCount,
        bucketMinutes,
      },
      note:
        'If you see an error about onConflict/constraint, ensure migration 0019_market_snapshots_norm_dedupe.sql is applied in Supabase.',
    });
  } catch (error: unknown) {
    const endedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, startedAt, endedAt, error: message }, { status: 500 });
  }
}

function createAdminClient() {
  // Uses service role key (server-only), bypasses RLS.
  return getServerClient();
}

