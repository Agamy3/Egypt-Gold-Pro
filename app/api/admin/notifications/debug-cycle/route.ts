/**
 * Admin debug endpoint (dry-run) for notification evaluation cycle.
 *
 * - Does NOT send any push notifications (dryRun=true)
 * - Admin-only via session OR allowed via x-cron-secret for trusted server-side debugging
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { runNotificationCycle } from '@/lib/notifications/runNotificationCycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  const isCronAuth = Boolean(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);

  if (!isCronAuth) {
    try {
      await requireAdmin();
    } catch {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
    }
  }

  const res = await runNotificationCycle({ dryRun: true });
  return withNoStoreHeaders(NextResponse.json({ ...res, ok: true, dryRun: true }, { status: res.ok ? 200 : 500 }));
}

