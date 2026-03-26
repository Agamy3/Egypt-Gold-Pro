import { NextRequest, NextResponse } from 'next/server';
import { consumeLinkToken, upsertTelegramConnection } from '@/lib/telegram/linking';
import {
  getTelegramConnectionByChatId,
  sendTelegramLanguagePicker,
  sendTelegramMainMenu,
  sendTelegramMessage,
  sendTelegramSettingsPicker,
  setTelegramPreferences,
} from '@/lib/telegram/service';
import db from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com').replace(/\/$/, '');
}

function parseStartToken(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith('/start')) return null;
  const parts = t.split(/\s+/);
  if (parts.length < 2) return null;
  return parts[1]?.trim() || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const callback = body?.callback_query;
  if (callback?.id && callback?.data) {
    const chatId = callback?.message?.chat?.id ? String(callback.message.chat.id) : null;
    const data = String(callback.data);
    if (!chatId) return NextResponse.json({ ok: true, ignored: true });
    const conn = await getTelegramConnectionByChatId(chatId);
    const lang = conn?.language || 'en';

    if (data.startsWith('lang:')) {
      const selected = data.slice(5) === 'ar' ? 'ar' : 'en';
      await setTelegramPreferences(chatId, { language: selected });
      await sendTelegramMessage(chatId, selected === 'ar' ? 'تم تحديث اللغة بنجاح.' : 'Language updated successfully.');
      await sendTelegramMainMenu(chatId, selected);
      return NextResponse.json({ ok: true, callback: true });
    }
    if (data.startsWith('pref:')) {
      const pref = data.slice(5);
      if (pref === '21' || pref === '24' || pref === 'global') {
        await setTelegramPreferences(chatId, { preferred_karat: pref as '21' | '24' | 'global' });
        await sendTelegramMessage(chatId, lang === 'ar' ? `تم تحديث المتابعة إلى ${pref}.` : `Preference updated to ${pref}.`);
      }
      return NextResponse.json({ ok: true, callback: true });
    }
    if (data === 'toggle:signals') {
      if (conn) {
        const next = !conn.alert_signals_enabled;
        await setTelegramPreferences(chatId, { alert_signals_enabled: next });
        await sendTelegramMessage(chatId, lang === 'ar' ? `إشارات: ${next ? 'مفعّل' : 'موقوف'}` : `Signals: ${next ? 'enabled' : 'disabled'}`);
      }
      return NextResponse.json({ ok: true, callback: true });
    }
    if (data === 'toggle:price') {
      if (conn) {
        const next = !conn.alert_price_enabled;
        await setTelegramPreferences(chatId, { alert_price_enabled: next });
        await sendTelegramMessage(chatId, lang === 'ar' ? `تنبيهات السعر: ${next ? 'مفعّل' : 'موقوف'}` : `Price alerts: ${next ? 'enabled' : 'disabled'}`);
      }
      return NextResponse.json({ ok: true, callback: true });
    }
  }

  const msg = body?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  const text = typeof msg?.text === 'string' ? msg.text : '';
  const username = msg?.from?.username ? String(msg.from.username) : null;

  if (!chatId || !text) return NextResponse.json({ ok: true, ignored: true });

  const token = parseStartToken(text);
  if (token) {
    const consumed = await consumeLinkToken(token);
    if (!consumed.ok || !consumed.userId) {
      if (consumed.error === 'token_used') {
        await sendTelegramMessage(
          chatId,
          'This link token was already used. If you already saw "connected successfully", your Telegram is linked. Otherwise generate a fresh link token in account settings.'
        );
      } else if (consumed.error === 'token_expired') {
        await sendTelegramMessage(chatId, 'This link token has expired. Please generate a new link token from your account settings.');
      } else {
        await sendTelegramMessage(chatId, 'Invalid link token. Please generate a new link token from your account settings.');
      }
      return NextResponse.json({ ok: true, linked: false, reason: consumed.error || 'invalid_token' });
    }
    const up = await upsertTelegramConnection({
      userId: consumed.userId,
      chatId,
      username,
    });
    if (!up.ok) {
      await sendTelegramMessage(chatId, `Failed to link account: ${up.error || 'unknown_error'}`);
      return NextResponse.json({ ok: true, linked: false, reason: up.error || 'upsert_failed' });
    }
    await sendTelegramMessage(chatId, 'Telegram connected successfully. You will now receive enabled EgyptGold Pro alerts here.');
    await sendTelegramLanguagePicker(chatId);
    return NextResponse.json({ ok: true, linked: true });
  }

  if (text.trim() === '/start') {
    const conn = await getTelegramConnectionByChatId(chatId);
    if (!conn) {
      await sendTelegramMessage(chatId, 'Use /start <token> from your account connect button to link your EgyptGold Pro account first.');
      return NextResponse.json({ ok: true, linked: false });
    }
    await sendTelegramLanguagePicker(chatId);
    await sendTelegramMainMenu(chatId, conn.language || 'en');
    return NextResponse.json({ ok: true, started: true });
  }

  if (text.trim().startsWith('/language') || text.trim() === '🌐 Change Language' || text.trim() === '🌐 تغيير اللغة') {
    await sendTelegramLanguagePicker(chatId);
    return NextResponse.json({ ok: true, language_picker: true });
  }

  if (text.trim().startsWith('/settings') || text.trim() === '⚙️ Settings' || text.trim() === '⚙️ الإعدادات') {
    const conn = await getTelegramConnectionByChatId(chatId);
    await sendTelegramSettingsPicker(chatId, conn?.language || 'en');
    return NextResponse.json({ ok: true, settings: true });
  }

  if (text.trim().startsWith('/stop')) {
    const { error } = await db.supabase
      .from('user_telegram_connections')
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq('telegram_chat_id', chatId);
    if (error) {
      await sendTelegramMessage(chatId, 'Failed to disable alerts. Please try again later.');
      return NextResponse.json({ ok: true, disabled: false, error: error.message });
    }
    await sendTelegramMessage(chatId, 'Telegram alerts are now disabled. Use account settings to re-enable.');
    return NextResponse.json({ ok: true, disabled: true });
  }

  if (text.trim().startsWith('/status')) {
    const conn = await getTelegramConnectionByChatId(chatId);
    if (!conn) {
      await sendTelegramMessage(chatId, 'No linked account found. Generate a link token in EgyptGold Pro settings and send /start <token>.');
      return NextResponse.json({ ok: true, linked: false });
    }
    const { data } = await db.supabase
      .from('user_telegram_connections')
      .select('is_enabled, linked_at, telegram_username, language, preferred_karat, alert_signals_enabled, alert_price_enabled')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();
    await sendTelegramMessage(
      chatId,
      `Linked: yes\nEnabled: ${data?.is_enabled ? 'yes' : 'no'}\nUsername: ${data?.telegram_username ? '@' + data.telegram_username : 'n/a'}\nLanguage: ${data?.language || 'en'}\nPreference: ${data?.preferred_karat || '21'}\nSignals: ${data?.alert_signals_enabled === false ? 'off' : 'on'}\nPrice alerts: ${data?.alert_price_enabled === false ? 'off' : 'on'}\nLinked at: ${data?.linked_at || 'n/a'}`
    );
    await sendTelegramMainMenu(chatId, (data?.language || 'en') as 'en' | 'ar');
    return NextResponse.json({ ok: true, linked: true });
  }

  if (text.trim() === '📊 Latest Signal' || text.trim() === '📊 أحدث إشارة') {
    const conn = await getTelegramConnectionByChatId(chatId);
    await sendTelegramMessage(
      chatId,
      conn?.language === 'ar'
        ? `آخر إشارة متاحة في التطبيق.\n${appBaseUrl()}/signals`
        : `Latest signal is available in the app.\n${appBaseUrl()}/signals`
    );
    return NextResponse.json({ ok: true, latest_signal: true });
  }

  if (text.trim() === '📈 Prices' || text.trim() === '📈 الأسعار') {
    const conn = await getTelegramConnectionByChatId(chatId);
    await sendTelegramMessage(
      chatId,
      conn?.language === 'ar'
        ? `الأسعار الحية:\n${appBaseUrl()}/gold`
        : `Live prices:\n${appBaseUrl()}/gold`
    );
    return NextResponse.json({ ok: true, prices: true });
  }

  await sendTelegramMessage(
    chatId,
    'Use /start <token> to link your account, /status to check status, /language to change language, /settings to configure alerts, or /stop to disable alerts.'
  );
  return NextResponse.json({ ok: true, ignored: false });
}
