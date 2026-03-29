import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import type { TelegramAutomationKey } from '@/lib/telegram/automationSettings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function keyToAdminSettingKey(key: 'global' | TelegramAutomationKey): string {
  if (key === 'global') return 'telegram_global_enabled';
  if (key === 'gold_signals') return 'telegram_automation_gold_signals_enabled';
  return 'telegram_automation_notify_rules_enabled';
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdmin();
    const supabase = getServerClient();

    const body = (await req.json().catch(() => null)) as {
      key?: 'global' | TelegramAutomationKey;
      enabled?: boolean;
    } | null;

    const key = body?.key;
    const enabled = body?.enabled;

    if (key !== 'global' && key !== 'gold_signals' && key !== 'notify_rules') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid key' }, { status: 400 }));
    }
    if (typeof enabled !== 'boolean') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'enabled must be boolean' }, { status: 400 }));
    }

    const settingKey = keyToAdminSettingKey(key);

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert(
        {
          key: settingKey,
          value: enabled,
          description:
            key === 'global'
              ? 'Global kill switch for Telegram automation sending (does not affect interactive bot replies)'
              : key === 'gold_signals'
                ? 'Enable/disable Telegram gold signals automation'
                : 'Enable/disable Telegram sending from cron notify rules',
          updated_by_user_id: user.id,
        },
        { onConflict: 'key' }
      )
      .select('key, value, updated_at, updated_by_user_id')
      .single();

    if (error) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        setting: {
          key: data.key,
          enabled: data.value === true || data.value === 'true',
          updated_at: (data as any).updated_at ?? null,
          updated_by_user_id: (data as any).updated_by_user_id ?? null,
        },
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
