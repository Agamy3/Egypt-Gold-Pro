import { NextRequest, NextResponse } from 'next/server';
import { consumeLinkToken, upsertTelegramConnection } from '@/lib/telegram/linking';
import { sendTelegramMessage } from '@/lib/telegram/service';
import db from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseStartToken(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith('/start')) return null;
  const parts = t.split(/\s+/);
  if (parts.length < 2) return null;
  return parts[1]?.trim() || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const msg = body?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  const text = typeof msg?.text === 'string' ? msg.text : '';
  const username = msg?.from?.username ? String(msg.from.username) : null;

  if (!chatId || !text) return NextResponse.json({ ok: true, ignored: true });

  const token = parseStartToken(text);
  if (token) {
    const consumed = await consumeLinkToken(token);
    if (!consumed.ok || !consumed.userId) {
      await sendTelegramMessage(chatId, 'Invalid or expired link token. Please generate a new link from your account settings.');
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
    return NextResponse.json({ ok: true, linked: true });
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
    const { data } = await db.supabase
      .from('user_telegram_connections')
      .select('is_enabled, linked_at, telegram_username')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();
    if (!data) {
      await sendTelegramMessage(chatId, 'No linked account found. Generate a link token in EgyptGold Pro settings and send /start <token>.');
      return NextResponse.json({ ok: true, linked: false });
    }
    await sendTelegramMessage(
      chatId,
      `Linked: yes\nEnabled: ${data.is_enabled ? 'yes' : 'no'}\nUsername: ${data.telegram_username ? '@' + data.telegram_username : 'n/a'}\nLinked at: ${data.linked_at || 'n/a'}`
    );
    return NextResponse.json({ ok: true, linked: true });
  }

  await sendTelegramMessage(
    chatId,
    'Use /start <token> to link your account, /status to check link status, or /stop to disable alerts.'
  );
  return NextResponse.json({ ok: true, ignored: false });
}
