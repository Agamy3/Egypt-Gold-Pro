import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

type Country = 'EG' | 'AE' | 'SA' | 'US';

function parseCountry(x: string | null): Country | null {
  if (x === 'EG' || x === 'AE' || x === 'SA' || x === 'US') return x;
  return null;
}

function parseKarat(x: string | null): 14 | 18 | 21 | 22 | 24 | null {
  const n = Number(x);
  if (n === 14 || n === 18 || n === 21 || n === 22 || n === 24) return n;
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = parseCountry(searchParams.get('country'));
  const karat = parseKarat(searchParams.get('karat'));
  if (!country || !karat) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'invalid_params' }, { status: 400 }));
  }

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('market_snapshots_norm')
    .select('price, currency, created_at, source, trusted')
    .eq('country', country)
    .eq('karat', karat)
    .eq('trusted', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
  if (!data) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'no_trusted_local_data' }, { status: 404 }));

  return withNoStoreHeaders(
    NextResponse.json(
      {
        ok: true,
        country,
        karat,
        unit: 'per_gram',
        price: Number((data as any).price),
        currency: String((data as any).currency),
        created_at: String((data as any).created_at),
        source: String((data as any).source),
        serverAsOf: new Date().toISOString(),
      },
      { status: 200 }
    )
  );
}

