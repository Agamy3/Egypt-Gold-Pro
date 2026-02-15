import { NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { fetchGoldApiSpot, getLatestSpot, computeAgeSeconds, spotIsStale, storeSpotTick, newRequestId, isSpotTableMissing } from '@/lib/gold/spot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET() {
  const requestId = newRequestId();
  const supabase = getServerClient();
  const now = new Date();

  let latest = await getLatestSpot(supabase, { traceId: requestId });
  if (!latest.ok) {
    // If canonical table isn't deployed yet, fall back to a direct GoldAPI fetch (server-only).
    if (isSpotTableMissing(latest)) {
      const fetched = await fetchGoldApiSpot({ traceId: requestId });
      if (!fetched.ok) {
        return withNoStoreHeaders(
          NextResponse.json({ ok: false, error: fetched.error, stale_data: true, serverAsOf: now.toISOString(), requestId, fallback: true }, { status: 502 })
        );
      }
      const ageSeconds = computeAgeSeconds(fetched.fetchedAtIso ?? null, now);
      const stale = ageSeconds === null ? true : ageSeconds > 10 * 60;
      return withNoStoreHeaders(
        NextResponse.json(
          {
            ok: true,
            price_usd_per_oz: fetched.price,
            fetched_at: fetched.fetchedAtIso,
            ageSeconds,
            stale_data: stale,
            source: 'goldapi',
            serverAsOf: now.toISOString(),
            requestId,
            fallback: true,
            storage: 'none',
          },
          { status: 200 }
        )
      );
    }
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: latest.error }, { status: 500 }));
  }

  // If missing or stale (>10m), try to fetch+store once (server-only).
  if (!latest.row || spotIsStale(String((latest.row as any)?.fetched_at || ''), now)) {
    const fetched = await fetchGoldApiSpot({ traceId: requestId });
    if (fetched.ok && fetched.price !== undefined && fetched.fetchedAtIso !== undefined) {
      const stored = await storeSpotTick(supabase, { price: fetched.price, fetchedAtIso: fetched.fetchedAtIso, raw: fetched.raw, traceId: requestId });
      if (!stored.ok) {
        // If we couldn't store (e.g. missing table), still return the fetched value so UI doesn't break.
        const ageSeconds = computeAgeSeconds(fetched.fetchedAtIso ?? null, now);
        const stale = ageSeconds === null ? true : ageSeconds > 10 * 60;
        return withNoStoreHeaders(
          NextResponse.json(
            {
              ok: true,
              price_usd_per_oz: fetched.price,
              fetched_at: fetched.fetchedAtIso,
              ageSeconds,
              stale_data: stale,
              source: 'goldapi',
              serverAsOf: now.toISOString(),
              requestId,
              fallback: true,
              storage: 'none',
            },
            { status: 200 }
          )
        );
      }
      latest = await getLatestSpot(supabase, { traceId: requestId });
    }
  }

  if (!latest.ok) return withNoStoreHeaders(NextResponse.json({ ok: false, error: latest.error }, { status: 500 }));
  if (!latest.row) {
    return withNoStoreHeaders(
      NextResponse.json(
        { ok: false, error: 'no_spot_tick_yet', stale_data: true, serverAsOf: now.toISOString(), requestId },
        { status: 503 }
      )
    );
  }

  const fetchedAtIso = String((latest.row as any).fetched_at);
  const ageSeconds = computeAgeSeconds(fetchedAtIso, now);
  const stale = ageSeconds === null ? true : ageSeconds > 10 * 60;

  return withNoStoreHeaders(
    NextResponse.json(
      {
        ok: true,
        price_usd_per_oz: Number((latest.row as any).price_usd_per_oz),
        fetched_at: fetchedAtIso,
        ageSeconds,
        stale_data: stale,
        source: String((latest.row as any).source || 'goldapi'),
        serverAsOf: now.toISOString(),
        requestId,
      },
      { status: 200 }
    )
  );
}

