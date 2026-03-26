import 'server-only';

import db from '@/lib/supabase';
import { getGoldSignalZone, zoneWhyNow } from '@/lib/telegram/signal-zones';

type Country = 'GLOBAL' | 'EG' | 'AE' | 'SA' | 'US';
type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type TelegramLang = 'en' | 'ar';
export type PreferredKarat = '21' | '24' | 'global';

type TelegramConnectionPrefs = {
  user_id: string;
  telegram_chat_id: string;
  telegram_username: string | null;
  language: TelegramLang;
  preferred_karat: PreferredKarat;
  alert_signals_enabled: boolean;
  alert_price_enabled: boolean;
};

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
  text: string,
  extra?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const res = await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
  return res.ok ? { success: true } : { success: false, error: res.error };
}

export async function getEnabledTelegramConnection(userId: string): Promise<{
  chatId: string | null;
  username: string | null;
  language?: TelegramLang;
  preferredKarat?: PreferredKarat;
  alertSignalsEnabled?: boolean;
  alertPriceEnabled?: boolean;
}> {
  const { data } = await db.supabase
    .from('user_telegram_connections')
    .select('telegram_chat_id, telegram_username, language, preferred_karat, alert_signals_enabled, alert_price_enabled')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .maybeSingle();
  if (!data) return { chatId: null, username: null };
  return {
    chatId: String(data.telegram_chat_id),
    username: data.telegram_username ? String(data.telegram_username) : null,
    language: (data.language || 'en') as TelegramLang,
    preferredKarat: (data.preferred_karat || '21') as PreferredKarat,
    alertSignalsEnabled: data.alert_signals_enabled !== false,
    alertPriceEnabled: data.alert_price_enabled !== false,
  };
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com').replace(/\/$/, '');
}

function actionLink(type: 'signals' | 'gold' | 'portfolio' | 'home'): string {
  const base = appBaseUrl();
  if (type === 'signals') return `${base}/signals`;
  if (type === 'gold') return `${base}/gold`;
  if (type === 'portfolio') return `${base}/portfolio`;
  return base;
}

function cta(lang: TelegramLang, link: string): string {
  if (lang === 'ar') {
    return `👉 متفوتش الفرصة — شوف التحليل والأسعار لحظة بلحظة:\n${link}`;
  }
  return `👉 Don’t miss this opportunity — check live prices & full analysis:\n${link}`;
}

function prefLine(lang: TelegramLang, pref: PreferredKarat): string {
  if (lang === 'ar') {
    const v = pref === '24' ? 'متابعة عيار 24' : pref === 'global' ? 'متابعة السعر العالمي' : 'متابعة عيار 21';
    return `📊 إعدادك: ${v}`;
  }
  const v = pref === '24' ? '24k tracked' : pref === 'global' ? 'Global ounce tracked' : '21k tracked';
  return `📊 Your preference: ${v}`;
}

export function formatTelegramTestMessage(lang: TelegramLang = 'en'): string {
  if (lang === 'ar') return `✅ تم اختبار إشعار تيليجرام بنجاح\nتم ربط EgyptGold Pro بنجاح.`;
  return `✅ Telegram test notification\nEgyptGold Pro is connected successfully.`;
}

export function formatTelegramPriceAlert(args: {
  lang?: TelegramLang;
  preferredKarat?: PreferredKarat;
  country: Exclude<Country, 'GLOBAL'>;
  karat: number;
  price: number;
  currency: string;
  directionLabel: 'UP' | 'DOWN';
  pctChange: number;
}): string {
  const lang = args.lang || 'en';
  const move = `${args.directionLabel} ${(args.pctChange * 100).toFixed(2)}%`;
  const link = actionLink('gold');
  if (lang === 'ar') {
    return `🔔 تنبيه سعر
الدولة: ${args.country}
العيار: ${args.karat}
السعر: ${args.currency} ${args.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
الحركة: ${move}

${prefLine(lang, args.preferredKarat || '21')}

${cta(lang, link)}`;
  }
  return `🔔 PRICE ALERT
Country: ${args.country}
Karat: ${args.karat}k
Price: ${args.currency} ${args.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
Move: ${move}

${prefLine(lang, args.preferredKarat || '21')}

${cta(lang, link)}`;
}

export function formatTelegramSignalAlert(args: {
  lang?: TelegramLang;
  preferredKarat?: PreferredKarat;
  action: SignalAction;
  xauUsd: number;
  confidence?: number | null;
  country: Country;
  local24?: number | null;
  local21?: number | null;
  sourcesCount?: number | null;
  timestampIso?: string;
}): string {
  const lang = args.lang || 'en';
  const zone = getGoldSignalZone(args.xauUsd);
  const actionIcon = args.action === 'BUY' ? '🚀' : args.action === 'SELL' ? '📉' : '📊';
  const headline =
    lang === 'ar'
      ? args.action === 'BUY'
        ? 'إشارة شراء'
        : args.action === 'SELL'
        ? 'إشارة بيع'
        : 'تحديث إشارة'
      : args.action === 'BUY'
      ? 'BUY SIGNAL'
      : args.action === 'SELL'
      ? 'SELL SIGNAL'
      : 'SIGNAL UPDATE';
  const zoneLabel =
    lang === 'ar'
      ? zone?.label === 'Strong Buy'
        ? 'شراء قوي'
        : zone?.label === 'Buy'
        ? 'شراء'
        : zone?.label === 'Core Buy'
        ? 'شراء أساسي'
        : zone?.label === 'Partial Sell'
        ? 'بيع جزئي'
        : zone?.label === 'Strong Sell'
        ? 'بيع قوي'
        : 'خارج النطاق'
      : zone?.label || 'No zone';
  const suggestedAction =
    lang === 'ar'
      ? zone?.direction === 'buy'
        ? 'شراء'
        : zone?.direction === 'sell'
        ? 'بيع'
        : args.action === 'HOLD'
        ? 'انتظار'
        : args.action === 'BUY'
        ? 'شراء'
        : 'بيع'
      : zone?.action || (args.action === 'HOLD' ? 'Hold / Wait' : args.action);
  const strength = zone?.stars || '—';
  const whyNow = zone
    ? zoneWhyNow(zone, lang)
    : lang === 'ar'
    ? 'السعر خارج مناطق الاستراتيجية المحددة، لذلك هذه الإشارة مبنية على النموذج المباشر وليس على نطاق سعري.'
    : 'Price is outside configured strategy zones, so this signal is based on the live model output rather than a zone trigger.';

  const extra: string[] = [];
  if (typeof args.local24 === 'number' && isFinite(args.local24))
    extra.push(lang === 'ar' ? `محلي 24k (مصر): ${args.local24.toFixed(2)}` : `Local 24k (EG): ${args.local24.toFixed(2)}`);
  if (typeof args.local21 === 'number' && isFinite(args.local21))
    extra.push(lang === 'ar' ? `محلي 21k (مصر): ${args.local21.toFixed(2)}` : `Local 21k (EG): ${args.local21.toFixed(2)}`);
  if (typeof args.confidence === 'number' && isFinite(args.confidence))
    extra.push(lang === 'ar' ? `الثقة: ${(args.confidence * 100).toFixed(0)}%` : `Confidence: ${(args.confidence * 100).toFixed(0)}%`);
  if (typeof args.sourcesCount === 'number' && isFinite(args.sourcesCount))
    extra.push(lang === 'ar' ? `عدد المصادر: ${args.sourcesCount}` : `Sources: ${args.sourcesCount}`);
  if (args.timestampIso) extra.push(lang === 'ar' ? `الوقت: ${new Date(args.timestampIso).toISOString()}` : `Time: ${new Date(args.timestampIso).toISOString()}`);

  const link = actionLink('signals');
  const base = `${actionIcon} ${headline}
${lang === 'ar' ? 'سعر الذهب' : 'Gold Price'}: $${args.xauUsd.toFixed(2)}
${lang === 'ar' ? 'المنطقة' : 'Zone'}: ${zoneLabel}
${lang === 'ar' ? 'القوة' : 'Strength'}: ${strength}
${lang === 'ar' ? 'التوصية' : 'Suggested Action'}: ${suggestedAction}

${lang === 'ar' ? 'ليه دلوقتي؟' : 'Why now:'}
${whyNow}

${prefLine(lang, args.preferredKarat || '21')}`;
  return `${base}${extra.length ? `\n${extra.join('\n')}` : ''}\n\n${cta(lang, link)}`;
}

export async function sendTelegramMainMenu(chatId: string, lang: TelegramLang): Promise<void> {
  const keyboard = lang === 'ar'
    ? [['📊 أحدث إشارة', '📈 الأسعار'], ['⚙️ الإعدادات', '🌐 تغيير اللغة']]
    : [['📊 Latest Signal', '📈 Prices'], ['⚙️ Settings', '🌐 Change Language']];
  await sendTelegramMessage(
    chatId,
    lang === 'ar' ? 'اختر من القائمة:' : 'Choose from menu:',
    {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
      },
    }
  );
}

export async function sendTelegramLanguagePicker(chatId: string): Promise<void> {
  await sendTelegramMessage('' + chatId, 'Choose language / اختر اللغة', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇬🇧 English', callback_data: 'lang:en' }],
        [{ text: '🇪🇬 العربية', callback_data: 'lang:ar' }],
      ],
    },
  });
}

export async function sendTelegramSettingsPicker(chatId: string, lang: TelegramLang): Promise<void> {
  await sendTelegramMessage(chatId, lang === 'ar' ? '⚙️ إعدادات تيليجرام' : '⚙️ Telegram settings', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: lang === 'ar' ? '21k' : '21k', callback_data: 'pref:21' },
          { text: lang === 'ar' ? '24k' : '24k', callback_data: 'pref:24' },
          { text: lang === 'ar' ? 'Global' : 'Global', callback_data: 'pref:global' },
        ],
        [
          { text: lang === 'ar' ? 'تبديل إشارات' : 'Toggle signals', callback_data: 'toggle:signals' },
          { text: lang === 'ar' ? 'تبديل تنبيهات السعر' : 'Toggle price alerts', callback_data: 'toggle:price' },
        ],
      ],
    },
  });
}

export async function setTelegramPreferences(
  chatId: string,
  patch: Partial<Pick<TelegramConnectionPrefs, 'language' | 'preferred_karat' | 'alert_signals_enabled' | 'alert_price_enabled'>>
): Promise<void> {
  await db.supabase
    .from('user_telegram_connections')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('telegram_chat_id', chatId);
}

export async function getTelegramConnectionByChatId(chatId: string): Promise<TelegramConnectionPrefs | null> {
  const { data } = await db.supabase
    .from('user_telegram_connections')
    .select('user_id, telegram_chat_id, telegram_username, language, preferred_karat, alert_signals_enabled, alert_price_enabled')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  if (!data) return null;
  return {
    user_id: String(data.user_id),
    telegram_chat_id: String(data.telegram_chat_id),
    telegram_username: data.telegram_username ? String(data.telegram_username) : null,
    language: (data.language || 'en') as TelegramLang,
    preferred_karat: (data.preferred_karat || '21') as PreferredKarat,
    alert_signals_enabled: data.alert_signals_enabled !== false,
    alert_price_enabled: data.alert_price_enabled !== false,
  };
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
    .select('user_id, telegram_chat_id, language, preferred_karat, alert_signals_enabled')
    .eq('is_enabled', true);
  if (error) return { sent: 0, failed: 0, errors: [error.message] };
  const rows = (data || []).filter((r: any) => r.alert_signals_enabled !== false);
  if (rows.length === 0) return { sent: 0, failed: 0, errors: [] };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const row of rows as any[]) {
    const text = formatTelegramSignalAlert({
      ...args,
      lang: (row.language || 'en') as TelegramLang,
      preferredKarat: (row.preferred_karat || '21') as PreferredKarat,
    });
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
