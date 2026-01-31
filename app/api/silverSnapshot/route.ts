import { NextResponse, type NextRequest } from 'next/server';

import { getServerUser } from '@/lib/supabase/server-auth';
import { getUserPremiumStatus } from '@/lib/auth/getUserPremiumStatus';
import { getCountryCurrency } from '@/lib/fx-multi';
import { getServerClient } from '@/lib/supabase/server';
import { getLocalSilver } from '@/lib/metals/localSilver';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Direction = 'UP' | 'DOWN' | 'STALE';
type Confidence = 'low' | 'med' | 'high';

function noStore(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function asNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

function confidenceFromPct(absPct: number): Confidence {
  if (absPct >= 0.003) return 'high'; // >= 0.30%
  if (absPct >= 0.0015) return 'med';
  return 'low';
}

export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return noStore(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

  const premium = await getUserPremiumStatus();
  if (!premium?.isPremium) {
    return noStore(NextResponse.json({ ok: false, error: 'Premium required' }, { status: 403 }));
  }

  const { searchParams } = new URL(req.url);
  const c = String(searchParams.get('country') || 'EG').toUpperCase();
  const country: Country = (['EG', 'AE', 'SA', 'US'].includes(c) ? c : 'EG') as Country;

  const supabase = getServerClient();
  const currency = getCountryCurrency(country);

  const derived = await getLocalSilver(country);
  const serverAsOf = new Date().toISOString();

  if (!derived.ok) {
    return noStore(
      NextResponse.json({
        ok: true,
        metal: 'XAG',
        country,
        currency,
        price_per_oz: null,
        price_per_g: null,
        direction: 'STALE' as Direction,
        confidence: 'low' as Confidence,
        lastUpdatedAt: null,
        meta: {
          serverAsOf,
          derived: true,
          spotSource: 'gold-api',
          fxSource: 'frankfurter',
          spotAsOf: null,
          fxDate: null,
          reason: derived.error,
        },
      })
    );
  }

  // Write a derived snapshot row (server-only) so direction comparisons work even if cron missed.
  const insertRow = {
    country,
    currency,
    price_per_oz: derived.priceLocalPerOunce,
    price_per_g: derived.priceLocalPerGram,
    spot_usd_per_oz: derived.spotUsdPerOunce,
    usd_to_local: derived.usdToLocal,
    source_spot: derived.meta.sourceSpot,
    source_fx: derived.meta.sourceFx,
    spot_asof: derived.meta.spotAsOf,
    fx_date: derived.meta.fxDate,
  } as any;

  try {
    await supabase.from('silver_spot_snapshots').insert(insertRow);
  } catch {
    // ignore insert failures (table may not exist yet)
  }

  // Read last 2 snapshots for direction & confidence
  let rows: any[] | null = null;
  try {
    const r = await supabase
      .from('silver_spot_snapshots')
      .select('price_per_oz, created_at')
      .eq('country', country)
      .order('created_at', { ascending: false })
      .limit(2);
    rows = (r as any).data ?? null;
  } catch {
    rows = null;
  }

  const latest = rows && rows[0] ? (rows[0] as any) : null;
  const prev = rows && rows[1] ? (rows[1] as any) : null;

  const priceOz = derived.priceLocalPerOunce;
  const priceG = derived.priceLocalPerGram;
  const lastUpdatedAt = derived.meta.asOfIso;

  let direction: Direction = 'STALE';
  let confidence: Confidence = 'low';

  const prevOz = prev ? asNum(prev.price_per_oz) : null;
  if (prevOz != null && prevOz > 0) {
    const pct = (priceOz - prevOz) / prevOz;
    const absPct = Math.abs(pct);
    if (absPct >= 0.001) {
      direction = pct > 0 ? 'UP' : 'DOWN';
      confidence = confidenceFromPct(absPct);
    }
  }

  // Stale if our source timestamp is too old
  const spotAtMs = Date.parse(derived.meta.spotAsOf);
  if (isFinite(spotAtMs) && Date.now() - spotAtMs > 120_000) {
    direction = 'STALE';
    confidence = 'low';
  }

  return noStore(
    NextResponse.json({
      ok: true,
      metal: 'XAG',
      country,
      currency,
      price_per_oz: priceOz,
      price_per_g: priceG,
      direction,
      confidence,
      lastUpdatedAt: lastUpdatedAt || null,
      meta: {
        serverAsOf,
        spotSource: 'gold-api',
        fxSource: 'frankfurter',
        spotAsOf: derived.meta.spotAsOf,
        fxDate: derived.meta.fxDate,
        derived: true,
      },
    })
  );
}

