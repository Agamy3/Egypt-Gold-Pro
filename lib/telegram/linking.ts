import 'server-only';

import { randomBytes } from 'crypto';
import db from '@/lib/supabase';

export function createTelegramLinkToken(): string {
  return randomBytes(24).toString('hex');
}

export async function createLinkTokenForUser(userId: string, ttlMinutes = 15): Promise<{ token: string; expiresAt: string }> {
  const token = createTelegramLinkToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await db.supabase.from('telegram_link_tokens').insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
    used_at: null,
  });
  return { token, expiresAt };
}

export async function consumeLinkToken(token: string): Promise<{
  ok: boolean;
  userId?: string;
  error?: string;
}> {
  const { data } = await db.supabase
    .from('telegram_link_tokens')
    .select('token, user_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();
  if (!data) return { ok: false, error: 'invalid_token' };
  if (data.used_at) return { ok: false, error: 'token_used' };
  const exp = new Date(String(data.expires_at)).getTime();
  if (!isFinite(exp) || exp < Date.now()) return { ok: false, error: 'token_expired' };

  await db.supabase
    .from('telegram_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null);

  return { ok: true, userId: String(data.user_id) };
}

export async function upsertTelegramConnection(args: {
  userId: string;
  chatId: string;
  username?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.supabase
    .from('user_telegram_connections')
    .upsert(
      {
        user_id: args.userId,
        telegram_chat_id: args.chatId,
        telegram_username: args.username || null,
        is_enabled: true,
        language: 'en',
        preferred_karat: '21',
        alert_signals_enabled: true,
        alert_price_enabled: true,
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
