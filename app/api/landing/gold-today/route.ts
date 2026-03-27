import { NextResponse } from 'next/server';
import { getGoldTodayLandingData } from '@/lib/landing/gold-today';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET() {
  try {
    const data = await getGoldTodayLandingData();
    return withNoStoreHeaders(NextResponse.json({ ok: true, data }));
  } catch (e) {
    return withNoStoreHeaders(
      NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : 'failed_to_load' },
        { status: 500 }
      )
    );
  }
}
