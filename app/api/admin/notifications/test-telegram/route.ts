import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import db from '@/lib/supabase';
import { formatTelegramSignalAlert, formatTelegramTestMessage, sendTelegramMessage } from '@/lib/telegram/service';
import { zonePreview } from '@/lib/telegram/signal-zones';
import { ADMIN_BROADCAST_ALL_LIMIT } from '@/lib/admin/broadcast-limits';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TG_CUSTOM_ALL_LIMIT_MS = 5 * 60 * 1000;
const lastCustomAllByAdmin = new Map<string, number>();

function checkCustomAllRateLimit(adminId: string): { ok: boolean; retrySec?: number } {
  const now = Date.now();
  const prev = lastCustomAllByAdmin.get(adminId);
  if (prev && now - prev < TG_CUSTOM_ALL_LIMIT_MS) {
    return { ok: false, retrySec: Math.ceil((TG_CUSTOM_ALL_LIMIT_MS - (now - prev)) / 1000) };
  }
  return { ok: true };
}

function touchCustomAllRateLimit(adminId: string) {
  lastCustomAllByAdmin.set(adminId, Date.now());
}

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
      mode?: 'test' | 'signal' | 'custom';
      customText?: string;
      priceUsd?: number;
      action?: 'BUY' | 'SELL' | 'HOLD';
      language?: 'en' | 'ar';
      dryRun?: boolean;
    } | null;
    const target = body?.target || 'me';
    const mode = body?.mode || 'test';
    const dryRun = !!body?.dryRun;

    if (mode === 'custom') {
      const raw = typeof body?.customText === 'string' ? body.customText.trim() : '';
      if (!raw) {
        return NextResponse.json({ ok: false, error: 'customText is required for mode custom' }, { status: 400 });
      }
      if (raw.length > 4096) {
        return NextResponse.json({ ok: false, error: 'customText must be at most 4096 characters' }, { status: 400 });
      }
      if (target === 'user' && !body?.userId) {
        return NextResponse.json({ ok: false, error: 'userId is required when target is user' }, { status: 400 });
      }
      if (target === 'all' && !dryRun) {
        const rl = checkCustomAllRateLimit(user.id);
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: `Rate limit: custom broadcast to all allowed once per 5 minutes. Retry in ${rl.retrySec}s.` },
            { status: 429 }
          );
        }
      }
    }

    let query = db.supabase
      .from('user_telegram_connections')
      .select('user_id, telegram_chat_id, telegram_username, is_enabled, language, preferred_karat')
      .eq('is_enabled', true);

    if (target === 'me') query = query.eq('user_id', user.id);
    if (target === 'user' && body?.userId) query = query.eq('user_id', body.userId);
    if (target === 'all') query = query.limit(ADMIN_BROADCAST_ALL_LIMIT);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const rows = data || [];
    if (rows.length === 0) return NextResponse.json({ ok: false, error: 'No enabled Telegram connections found' }, { status: 404 });

    const sent: Array<{ user_id: string; ok: boolean; error?: string }> = [];
    const price = Number(body?.priceUsd);
    const action = body?.action || 'BUY';
    const overrideLang = body?.language;

    const customText =
      mode === 'custom' && typeof body?.customText === 'string' ? body.customText.trim() : '';

    for (const row of rows) {
      const lang = overrideLang || ((row as any).language || 'en');
      const preferredKarat = ((row as any).preferred_karat || '21') as '21' | '24' | 'global';
      const text =
        mode === 'custom'
          ? customText
          : mode === 'signal' && isFinite(price) && price > 0
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
      if (mode === 'custom' && !dryRun) {
        try {
          await db.supabase.from('notification_deliveries_log').insert({
            user_id: row.user_id,
            rule_id: null,
            channel: 'telegram',
            status: r.success ? 'sent' : 'failed',
            payload: {
              source: 'admin_custom',
              admin_user_id: user.id,
              text_preview: customText.slice(0, 160),
              text_length: customText.length,
            },
            error: r.error || null,
          });
        } catch {
          // best-effort audit
        }
      }
    }

    if (mode === 'custom' && target === 'all' && !dryRun) {
      touchCustomAllRateLimit(user.id);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      recipients: rows.length,
      sent: sent.filter((x) => x.ok).length,
      failed: sent.filter((x) => !x.ok).length,
      results: sent,
      preview:
        mode === 'signal' && isFinite(price) && price > 0
          ? zonePreview(price)
          : mode === 'custom'
            ? { mode: 'custom', length: customText.length }
            : null,
    });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}
