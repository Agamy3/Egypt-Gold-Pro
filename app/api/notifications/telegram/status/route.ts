import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('user_telegram_connections')
    .select('telegram_chat_id, telegram_username, is_enabled, linked_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({
    ok: true,
    connected: !!data,
    connection: data
      ? {
          chat_id: data.telegram_chat_id ? String(data.telegram_chat_id) : null,
          username: data.telegram_username || null,
          is_enabled: !!data.is_enabled,
          linked_at: data.linked_at || null,
        }
      : null,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
  });
}
