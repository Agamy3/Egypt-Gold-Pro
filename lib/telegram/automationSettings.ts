import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type TelegramAutomationKey = 'gold_signals' | 'notify_rules';

export type TelegramAutomationSettings = {
  globalEnabled: boolean;
  goldSignalsEnabled: boolean;
  notifyRulesEnabled: boolean;
};

function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return null;
}

async function readBoolSetting(supabase: SupabaseClient, key: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('admin_settings').select('value').eq('key', key).maybeSingle();
  if (error) return null;
  const raw = (data as any)?.value;
  return asBool(raw);
}

export async function getTelegramAutomationSettings(supabase: SupabaseClient): Promise<TelegramAutomationSettings> {
  const [globalEnabled, goldSignalsEnabled, notifyRulesEnabled] = await Promise.all([
    readBoolSetting(supabase, 'telegram_global_enabled'),
    readBoolSetting(supabase, 'telegram_automation_gold_signals_enabled'),
    readBoolSetting(supabase, 'telegram_automation_notify_rules_enabled'),
  ]);

  return {
    globalEnabled: globalEnabled ?? true,
    goldSignalsEnabled: goldSignalsEnabled ?? true,
    notifyRulesEnabled: notifyRulesEnabled ?? true,
  };
}

export async function isTelegramAutomationEnabled(
  supabase: SupabaseClient,
  automation: TelegramAutomationKey
): Promise<boolean> {
  const s = await getTelegramAutomationSettings(supabase);
  if (!s.globalEnabled) return false;
  if (automation === 'gold_signals') return s.goldSignalsEnabled;
  if (automation === 'notify_rules') return s.notifyRulesEnabled;
  return true;
}
