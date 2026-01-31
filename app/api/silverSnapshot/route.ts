import { NextResponse, type NextRequest } from 'next/server';

import { getServerUser } from '@/lib/supabase/server-auth';
import { getUserPremiumStatus } from '@/lib/auth/getUserPremiumStatus';
import { getCountryCurrency } from '@/lib/fx-multi';
import { getServerClient } from '@/lib/supabase/server';

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

  const currency = getCountryCurrency(country);
  const supabase = getServerClient();

  const { data: rows, error } = await supabase
    .from('silver_spot_snapshots')
    .select('*')
    .eq('country', country)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) return noStore(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));

  const latest = rows && rows[0] ? (rows[0] as any) : null;
  const prev = rows && rows[1] ? (rows[1] as any) : null;

  const serverAsOf = new Date().toISOString();
  if (!latest) {
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
        meta: { serverAsOf, reason: 'no_rows' },
      })
    );
  }

  const priceOz = asNum(latest.price_per_oz);
  const priceG = asNum(latest.price_per_g);
  const lastUpdatedAt = String(latest.created_at || '');

  let direction: Direction = 'STALE';
  let confidence: Confidence = 'low';

  const prevOz = prev ? asNum(prev.price_per_oz) : null;
  if (priceOz != null && prevOz != null && prevOz > 0) {
    const pct = (priceOz - prevOz) / prevOz;
    const absPct = Math.abs(pct);
    // Direction threshold: 0.10% (silver is noisy)
    if (absPct >= 0.001) {
      direction = pct > 0 ? 'UP' : 'DOWN';
      confidence = confidenceFromPct(absPct);
    }
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
        spotAsOf: latest.spot_asof ?? null,
        fxDate: latest.fx_date ?? null,
        sourceSpot: latest.source_spot ?? null,
        sourceFx: latest.source_fx ?? null,
      },
    })
  );
}

