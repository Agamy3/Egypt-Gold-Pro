/**
 * Admin EG Local History Backfill
 *
 * POST /api/admin/market/backfill-eg-local
 *
 * - Admin-only (getUserStatus.isAdmin) OR CRON_SECRET header
 * - Copies historical aggregated EG snapshots from wide table (market_snapshots)
 *   into normalized table (market_snapshots_norm) for better weekly/monthly chart history.
 * - Idempotent via unique index on (country, karat, raw_hash) (see migration 0019).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserStatus } from '@/lib/auth/getUserStatus';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;
const MAX_PAGES = 60; // safety cap: up to 60k wide rows scanned per run
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

    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('market_snapshots')
        .select('source, createdAt, rawHash, market24Buy, market21Buy, market18Buy, market14Buy, error')
        .eq('source', 'aggregated')
        .gte('createdAt', windowStartMs)
        .lte('createdAt', nowMs)
        .is('error', null)
        .order('createdAt', { ascending: true })
        .range(from, to);

      if (error) {
        throw new Error(`Backfill fetch failed: ${error.message}`);
      }

      const wideRows = (data || []) as unknown as WideRow[];
      pagesFetched += 1;
      wideRowsScanned += wideRows.length;

      for (const r of wideRows) {
        const createdAtMs = typeof r.createdAt === 'number' ? r.createdAt : Number(r.createdAt);
        if (!isFinite(createdAtMs) || createdAtMs <= 0) continue;

        const createdAtIso = new Date(createdAtMs).toISOString();
        const rawHash = r.rawHash ?? null;

        const pushIfValid = (karat: 14 | 18 | 21 | 24, v: unknown) => {
          const price = Number(v);
          if (!isFinite(price) || price <= 0) return;
          pendingNormRows.push({
            country: 'EG',
            market: 'local',
            karat,
            price,
            currency: 'EGP',
            source: r.source,
            trusted: r.source === 'goldbullioneg',
            created_at: createdAtIso,
            raw_hash: rawHash,
          });
        };

        pushIfValid(24, r.market24Buy);
        pushIfValid(21, r.market21Buy);
        pushIfValid(18, r.market18Buy);
        pushIfValid(14, r.market14Buy);
      }

      // flush periodically
      if (pendingNormRows.length >= INSERT_CHUNK) {
        await flush();
      }

      if (wideRows.length < PAGE_SIZE) {
        break; // reached end
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

