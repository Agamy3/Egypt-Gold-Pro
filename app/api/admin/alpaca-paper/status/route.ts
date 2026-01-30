import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { getAccount, getPositions } from '@/lib/brokers/alpacaPaper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const [{ data: settings }, { data: state }] = await Promise.all([
      supabase.from('alpaca_paper_settings').select('*').eq('key', 'default').maybeSingle(),
      supabase.from('alpaca_paper_state').select('*').eq('key', 'default').maybeSingle(),
    ]);

    const [account, positions] = await Promise.all([getAccount(), getPositions()]);

    const { data: reserveSum } = await supabase
      .from('alpaca_reserve_ledger')
      .select('amount')
      .limit(1000);
    const reservedCash = (reserveSum || []).reduce((acc, r: any) => acc + (num(r.amount) ?? 0), 0);

    const { data: longTerm } = await supabase.from('alpaca_long_term_holdings').select('qty, avg_price').limit(2000);
    const longTermValue = (longTerm || []).reduce((acc, r: any) => acc + (num(r.qty) ?? 0) * (num(r.avg_price) ?? 0), 0);

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        serverAsOf: new Date().toISOString(),
        settings: settings ?? null,
        state: state ?? null,
        account,
        positions,
        reservedCash,
        longTermValue,
        banner: 'Paper trading (simulated) — no real money.',
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

