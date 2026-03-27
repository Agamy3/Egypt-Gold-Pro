import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import db from '@/lib/supabase';
import { ADMIN_BROADCAST_ALL_LIMIT } from '@/lib/admin/broadcast-limits';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Target = 'me' | 'all' | 'user';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_ME = { max: 10, windowMs: 60 * 1000 };
const RATE_LIMIT_ALL = { max: 1, windowMs: 5 * 60 * 1000 };

function checkRateLimit(adminId: string, target: 'me' | 'all'): { allowed: boolean; resetIn?: number } {
  const now = Date.now();
  const limit = target === 'me' ? RATE_LIMIT_ME : RATE_LIMIT_ALL;
  const key = `${adminId}:${target}`;
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true };
  }
  if (record.count >= limit.max) {
    const resetIn = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, resetIn };
  }
  record.count++;
  return { allowed: true };
}

async function resolveRecipientIds(target: Target, adminUserId: string, targetUserId?: string): Promise<string[]> {
  if (target === 'me') return [adminUserId];
  if (target === 'user') {
    const uid = targetUserId?.trim();
    if (!uid) return [];
    const { data } = await db.supabase.from('user_profiles').select('id').eq('id', uid).maybeSingle();
    return data?.id ? [String(data.id)] : [];
  }
  const { data, error } = await db.supabase
    .from('user_profiles')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(ADMIN_BROADCAST_ALL_LIMIT);
  if (error) throw new Error(error.message);
  return (data || []).map((r: { id: string }) => String(r.id));
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdmin();
    const body = (await request.json().catch(() => null)) as {
      target?: Target;
      userId?: string;
      title?: string;
      body?: string;
      url?: string | null;
      dryRun?: boolean;
    } | null;

    const target = body?.target || 'me';
    if (!['me', 'all', 'user'].includes(target)) {
      return NextResponse.json({ ok: false, error: 'Invalid target' }, { status: 400 });
    }
    if (target === 'user' && !body?.userId?.trim()) {
      return NextResponse.json({ ok: false, error: 'userId is required when target is user' }, { status: 400 });
    }

    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!title) return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 });
    if (!text) return NextResponse.json({ ok: false, error: 'body is required' }, { status: 400 });

    const dryRun = !!body?.dryRun;
    const urlRaw = body?.url;
    const url = urlRaw === null || urlRaw === undefined ? null : String(urlRaw).trim() || null;

    const recipientIds = await resolveRecipientIds(target, user.id, body?.userId);
    if (recipientIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'No matching user profiles for this target.' }, { status: 404 });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        recipients: recipientIds.length,
        inserted: 0,
      });
    }

    const rateLimit = checkRateLimit(user.id, target === 'all' ? 'all' : 'me');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.` },
        { status: 429 }
      );
    }

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      country: null,
      title,
      body: text,
      url,
      kind: 'alert' as const,
    }));

    const { error: insertErr } = await db.supabase.from('in_app_notifications').insert(rows);
    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    const logRows = recipientIds.map((uid) => ({
      user_id: uid,
      rule_id: null as number | null,
      channel: 'inapp' as const,
      status: 'sent' as const,
      payload: { source: 'admin_custom', admin_user_id: user.id, title },
      error: null as string | null,
    }));

    try {
      await db.supabase.from('notification_deliveries_log').insert(logRows);
    } catch {
      // best-effort
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      recipients: recipientIds.length,
      inserted: recipientIds.length,
    });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}
