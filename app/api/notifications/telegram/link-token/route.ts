import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createLinkTokenForUser } from '@/lib/telegram/linking';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { token, expiresAt } = await createLinkTokenForUser(user.id, 15);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace('@', '') || '';
  const startCommand = `/start ${token}`;
  const botLink = botUsername ? `https://t.me/${botUsername}?start=${token}` : null;

  return NextResponse.json({
    ok: true,
    token,
    expiresAt,
    startCommand,
    botLink,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
  });
}
