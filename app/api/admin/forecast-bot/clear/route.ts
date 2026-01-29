import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { getProvidedCronSecret, isCronSecretValid } from '@/lib/cron/cronSecret';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function POST(req: NextRequest) {
  try {
    // Auth: cron secret OR admin session.
    const provided = getProvidedCronSecret(req);
    if (!isCronSecretValid(provided)) {
      await requireAdmin();
    }

    const body = (await req.json().catch(() => null)) as any;
    if (body?.confirm !== 'CLEAR_ALL') {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'Missing confirm=CLEAR_ALL' }, { status: 400 })
      );
    }

    const supabase = getServerClient();

    // Delete trades first (FK dependency), then predictions.
    const { error: tErr, count: tradesCount } = await supabase
      .from('admin_30s_trades')
      .delete({ count: 'exact' })
      .neq('id', '__never__');

    if (tErr) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: tErr.message }, { status: 500 }));
    }

    const { error: pErr, count: predsCount } = await supabase
      .from('admin_30s_predictions')
      .delete({ count: 'exact' })
      .neq('id', '__never__');

    if (pErr) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: pErr.message }, { status: 500 }));
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        deletedTrades: tradesCount ?? null,
        deletedPredictions: predsCount ?? null,
      })
    );
  } catch (err) {
    return withNoStoreHeaders(adminErrorToResponse(err));
  }
}

