import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import db from '@/lib/supabase';
import { formatTelegramSignalAlert, formatTelegramTestMessage, sendTelegramMessage } from '@/lib/telegram/service';
import { zonePreview } from '@/lib/telegram/signal-zones';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await requireAdmin();
    const [{ count: linked }, { count: enabled }, { count: active }, { count: failedSends }, { data: latest }] = await Promise.all([
      db.supabase.from('user_telegram_connections').select('*', { count: 'exact', head: true }),
      db.supabase.from('user_telegram_connections').select('*', { count: 'exact', head: true }).eq('is_enabled', true),
      db.supabase.from('user_telegram_connections').select('*', { count: 'exact', head: true }).eq('is_enabled', true).or('alert_signals_enabled.eq.true,alert_price_enabled.eq.true'),
      db.supabase.from('notification_deliveries_log').select('*', { count: 'exact', head: true }).eq('channel', 'telegram').eq('status', 'failed'),
      db.supabase
        .from('notification_deliveries_log')
        .select('status, error, created_at')
        .eq('channel', 'telegram')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({
      ok: true,
      linkedUsers: linked || 0,
      enabledUsers: enabled || 0,
      activeUsers: active || 0,
      failedSends: failedSends || 0,
      latestDeliveries: latest || [],
    });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdmin();
    const body = (await req.json().catch(() => null)) as {
      target?: 'me' | 'all' | 'user';
      userId?: string;
      mode?: 'test' | 'signal';
      priceUsd?: number;
      action?: 'BUY' | 'SELL' | 'HOLD';
      language?: 'en' | 'ar';
      dryRun?: boolean;
    } | null;
    const target = body?.target || 'me';
    const mode = body?.mode || 'test';
    const dryRun = !!body?.dryRun;

    let query = db.supabase
      .from('user_telegram_connections')
      .select('user_id, telegram_chat_id, telegram_username, is_enabled, language, preferred_karat')
      .eq('is_enabled', true);

    if (target === 'me') query = query.eq('user_id', user.id);
    if (target === 'user' && body?.userId) query = query.eq('user_id', body.userId);
    if (target === 'all') query = query.limit(50);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const rows = data || [];
    if (rows.length === 0) return NextResponse.json({ ok: false, error: 'No enabled Telegram connections found' }, { status: 404 });

    const sent: Array<{ user_id: string; ok: boolean; error?: string }> = [];
    const price = Number(body?.priceUsd);
    const action = body?.action || 'BUY';
    const overrideLang = body?.language;

    for (const row of rows) {
      const lang = overrideLang || ((row as any).language || 'en');
      const preferredKarat = ((row as any).preferred_karat || '21') as '21' | '24' | 'global';
      const text =
        mode === 'signal' && isFinite(price) && price > 0
          ? formatTelegramSignalAlert({
              action,
              xauUsd: price,
              confidence: 0.78,
              country: 'EG',
              timestampIso: new Date().toISOString(),
              lang,
              preferredKarat,
            })
          : formatTelegramTestMessage(lang);
      if (dryRun) {
        sent.push({ user_id: String(row.user_id), ok: true });
        continue;
      }
      const r = await sendTelegramMessage(String(row.telegram_chat_id), text);
      sent.push({ user_id: String(row.user_id), ok: r.success, error: r.error });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      recipients: rows.length,
      sent: sent.filter((x) => x.ok).length,
      failed: sent.filter((x) => !x.ok).length,
      results: sent,
      preview: mode === 'signal' && isFinite(price) && price > 0 ? zonePreview(price) : null,
    });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}
