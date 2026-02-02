import { NextResponse, type NextRequest } from 'next/server';

import { getServerUser } from '@/lib/supabase/server-auth';
import { getUserPremiumStatus } from '@/lib/auth/getUserPremiumStatus';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Karat = 999 | 925 | 900 | 800;

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

function confidenceFromAgeMinutes(ageMin: number): 'low' | 'med' | 'high' {
  if (ageMin <= 10) return 'high';
  if (ageMin <= 30) return 'med';
  return 'low';
}

export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return noStore(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

  const prem = await getUserPremiumStatus();
  if (!prem?.isPremium) return noStore(NextResponse.json({ ok: false, error: 'Premium required' }, { status: 403 }));

  const { searchParams } = new URL(req.url);
  const c = String(searchParams.get('country') || 'EG').toUpperCase();
  const country: Country = (['EG', 'AE', 'SA', 'US'].includes(c) ? c : 'EG') as Country;

  const supabase = getServerClient();
  const serverAsOf = new Date().toISOString();

  // For now we only scrape EG. Other countries return empty/stale.
  if (country !== 'EG') {
    return noStore(
      NextResponse.json({
        ok: true,
        country,
        source: null,
        serverAsOf,
        stale: true,
        rows: [],
        meta: { reason: 'no_local_source_for_country' },
      })
    );
  }

  // Get the latest row per karat
  const { data, error } = await supabase
    .from('local_silver_prices')
    .select('karat,buy_price,sell_price,change_value,change_pct,source,trusted,page_updated_at,scraped_at')
    .eq('country', country)
    .order('scraped_at', { ascending: false })
    .limit(500);

  if (error) return noStore(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));

  const byKarat = new Map<number, any>();
  for (const r of data || []) {
    const k = Number((r as any).karat);
    if (!byKarat.has(k)) byKarat.set(k, r);
    if (byKarat.size >= 4) break;
  }

  const nowMs = Date.now();
  const rows = (Array.from(byKarat.values()) as any[])
    .map((r) => {
      const scrapedAtIso = String(r.scraped_at || '');
      const pageUpdatedAtIso = r.page_updated_at ? String(r.page_updated_at) : null;
      // IMPORTANT: Use scraped_at for staleness because page_updated_at is local-time and may be hard to parse reliably.
      const staleBaseIso = scrapedAtIso || null;
      const tMs = staleBaseIso ? Date.parse(staleBaseIso) : NaN;
      const displayIso = pageUpdatedAtIso || scrapedAtIso || null;
      const ageMin = isFinite(tMs) ? (nowMs - tMs) / 60000 : 9999;
      const stale = ageMin > 30;
      return {
        karat: Number(r.karat) as Karat,
        buy_price: asNum(r.buy_price),
        sell_price: asNum(r.sell_price),
        change_value: asNum(r.change_value),
        change_pct: asNum(r.change_pct),
        source: String(r.source || ''),
        trusted: Boolean(r.trusted),
        lastUpdatedAt: displayIso,
        stale,
        confidence: confidenceFromAgeMinutes(ageMin),
      };
    })
    .sort((a, b) => b.karat - a.karat);

  const anyFresh = rows.some((r) => !r.stale);

  return noStore(
    NextResponse.json({
      ok: true,
      country,
      serverAsOf,
      source: 'safehavenhub',
      stale: !anyFresh,
      rows,
      meta: { derived: false },
    })
  );
}

