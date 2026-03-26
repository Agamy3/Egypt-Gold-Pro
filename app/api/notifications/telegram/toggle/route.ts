import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const enabled = typeof body?.enabled === 'boolean' ? body.enabled : undefined;
  const language = body?.language === 'ar' ? 'ar' : body?.language === 'en' ? 'en' : undefined;
  const preferredKarat =
    body?.preferred_karat === '24' || body?.preferred_karat === 'global' || body?.preferred_karat === '21'
      ? body.preferred_karat
      : undefined;
  const alertSignalsEnabled = typeof body?.alert_signals_enabled === 'boolean' ? body.alert_signals_enabled : undefined;
  const alertPriceEnabled = typeof body?.alert_price_enabled === 'boolean' ? body.alert_price_enabled : undefined;

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from('user_telegram_connections')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ ok: false, error: 'No Telegram connection' }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof enabled === 'boolean') updates.is_enabled = enabled;
  if (language) updates.language = language;
  if (preferredKarat) updates.preferred_karat = preferredKarat;
  if (typeof alertSignalsEnabled === 'boolean') updates.alert_signals_enabled = alertSignalsEnabled;
  if (typeof alertPriceEnabled === 'boolean') updates.alert_price_enabled = alertPriceEnabled;

  const { error } = await supabase
    .from('user_telegram_connections')
    .update(updates)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, updates });
}
