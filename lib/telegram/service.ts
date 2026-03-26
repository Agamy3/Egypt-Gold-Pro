import 'server-only';

import db from '@/lib/supabase';
import { getGoldSignalZone, zoneWhyNow } from '@/lib/telegram/signal-zones';

type Country = 'GLOBAL' | 'EG' | 'AE' | 'SA' | 'US';
type SignalAction = 'BUY' | 'SELL' | 'HOLD';

function botToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t && t.length > 10 ? t : null;
}

async function telegramApi(path: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const token = botToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.description || `telegram_http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'telegram_fetch_failed' };
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const res = await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
  return res.ok ? { success: true } : { success: false, error: res.error };
}

export async function getEnabledTelegramConnection(userId: string): Promise<{
  chatId: string | null;
  username: string | null;
}> {
  const { data } = await db.supabase
    .from('user_telegram_connections')
    .select('telegram_chat_id, telegram_username')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .maybeSingle();
  if (!data) return { chatId: null, username: null };
  return {
    chatId: String(data.telegram_chat_id),
    username: data.telegram_username ? String(data.telegram_username) : null,
  };
}

export function formatTelegramTestMessage(): string {
  return `✅ Telegram test notification\nEgyptGold Pro is connected successfully.`;
}

export function formatTelegramPriceAlert(args: {
  country: Exclude<Country, 'GLOBAL'>;
  karat: number;
  price: number;
  currency: string;
  directionLabel: 'UP' | 'DOWN';
  pctChange: number;
}): string {
  return `🔔 PRICE ALERT
Country: ${args.country}
Karat: ${args.karat}k
Price: ${args.currency} ${args.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
Move: ${args.directionLabel} ${(args.pctChange * 100).toFixed(2)}%`;
}

export function formatTelegramSignalAlert(args: {
  action: SignalAction;
  xauUsd: number;
  confidence?: number | null;
  country: Country;
  local24?: number | null;
  local21?: number | null;
  sourcesCount?: number | null;
  timestampIso?: string;
}): string {
  const zone = getGoldSignalZone(args.xauUsd);
  const actionIcon = args.action === 'BUY' ? '🚀' : args.action === 'SELL' ? '📉' : '📊';
  const headline = args.action === 'BUY' ? 'BUY SIGNAL' : args.action === 'SELL' ? 'SELL SIGNAL' : 'SIGNAL UPDATE';
  const zoneLabel = zone?.label || 'No zone';
  const suggestedAction = zone?.action || (args.action === 'HOLD' ? 'Hold / Wait' : args.action);
  const strength = zone?.stars || '—';
  const whyNow = zone
    ? zoneWhyNow(zone)
    : 'Price is outside configured strategy zones, so this signal is based on the live model output rather than a zone trigger.';

  const extra: string[] = [];
  if (typeof args.local24 === 'number' && isFinite(args.local24)) extra.push(`Local 24k (EG): ${args.local24.toFixed(2)}`);
  if (typeof args.local21 === 'number' && isFinite(args.local21)) extra.push(`Local 21k (EG): ${args.local21.toFixed(2)}`);
  if (typeof args.confidence === 'number' && isFinite(args.confidence)) extra.push(`Confidence: ${(args.confidence * 100).toFixed(0)}%`);
  if (typeof args.sourcesCount === 'number' && isFinite(args.sourcesCount)) extra.push(`Sources: ${args.sourcesCount}`);
  if (args.timestampIso) extra.push(`Time: ${new Date(args.timestampIso).toISOString()}`);

  return `${actionIcon} ${headline}
Gold Price: $${args.xauUsd.toFixed(2)}
Zone: ${zoneLabel}
Strength: ${strength}
Suggested Action: ${suggestedAction}

Why now:
${whyNow}${extra.length ? `\n\n${extra.join('\n')}` : ''}`;
}

export async function sendTelegramSignalToEnabledUsers(args: {
  action: SignalAction;
  xauUsd: number;
  confidence?: number | null;
  country: Country;
  local24?: number | null;
  local21?: number | null;
  sourcesCount?: number | null;
  timestampIso?: string;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  const { data, error } = await db.supabase
    .from('user_telegram_connections')
    .select('user_id, telegram_chat_id')
    .eq('is_enabled', true);
  if (error) return { sent: 0, failed: 0, errors: [error.message] };
  const rows = data || [];
  if (rows.length === 0) return { sent: 0, failed: 0, errors: [] };

  const text = formatTelegramSignalAlert(args);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const res = await sendTelegramMessage(String(row.telegram_chat_id), text);
    if (res.success) sent++;
    else {
      failed++;
      if (res.error) errors.push(res.error);
    }
    try {
      await db.supabase.from('notification_deliveries_log').insert({
        user_id: row.user_id,
        rule_id: null,
        channel: 'telegram',
        status: res.success ? 'sent' : 'failed',
        payload: { source: 'gold_signals', xau_usd: args.xauUsd, action: args.action },
        error: res.error || null,
      });
    } catch {
      // best-effort logging only
    }
  }
  return { sent, failed, errors };
}
