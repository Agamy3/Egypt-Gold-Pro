import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import { getTelegramAutomationSettings } from '@/lib/telegram/automationSettings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

async function latestLog(supabase: ReturnType<typeof getServerClient>, source: string) {
  const { data } = await supabase
    .from('notification_deliveries_log')
    .select('created_at, status, error, payload')
    .eq('channel', 'telegram')
    .eq('payload->>source', source)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const settings = await getTelegramAutomationSettings(supabase);
    const [lastGoldSignals, lastNotifyRules] = await Promise.all([
      latestLog(supabase, 'gold_signals'),
      latestLog(supabase, 'notify_rules'),
    ]);

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings,
        automations: [
          {
            key: 'gold_signals',
            name: 'Gold signals',
            trigger: '/api/cron/gold-signals',
            enabled: settings.globalEnabled && settings.goldSignalsEnabled,
            last: lastGoldSignals,
          },
          {
            key: 'notify_rules',
            name: 'Notification rules (cron notify)',
            trigger: '/api/cron/notify',
            enabled: settings.globalEnabled && settings.notifyRulesEnabled,
            last: lastNotifyRules,
          },
        ],
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
