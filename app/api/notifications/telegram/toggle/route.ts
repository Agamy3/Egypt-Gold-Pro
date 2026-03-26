import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const enabled = !!body?.enabled;

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from('user_telegram_connections')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ ok: false, error: 'No Telegram connection' }, { status: 404 });

  const { error } = await supabase
    .from('user_telegram_connections')
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, enabled });
}
