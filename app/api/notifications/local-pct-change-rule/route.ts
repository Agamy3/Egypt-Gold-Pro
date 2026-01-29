/**
 * Local price % change rule toggle (v1 rules table).
 *
 * GET  -> returns { enabled, rule }
 * POST -> upserts rule (enabled + params)
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RULE_TYPE = 'local_pct_change';

function noStore(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET() {
  const user = await getServerUser();
  if (!user) return noStore(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('user_notification_rules')
    .select('*')
    .eq('user_id', user.id)
    .eq('rule_type', RULE_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return noStore(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));

  return noStore(
    NextResponse.json({
      ok: true,
      enabled: Boolean((data as any)?.enabled),
      rule: data ?? null,
    })
  );
}

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return noStore(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

  const body = (await req.json().catch(() => null)) as any;
  const enabled = Boolean(body?.enabled);
  const params = (body?.params && typeof body.params === 'object') ? body.params : {};

  const supabase = await createServerSupabaseClient();

  // Find existing rule if any.
  const { data: existing } = await supabase
    .from('user_notification_rules')
    .select('id')
    .eq('user_id', user.id)
    .eq('rule_type', RULE_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('user_notification_rules')
      .update({ enabled, params })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return noStore(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));
    return noStore(NextResponse.json({ ok: true, rule: data }));
  }

  // Create new rule row. Defaults for legacy required columns:
  // country/karat/currency/side/direction/threshold are irrelevant for this rule_type.
  const { data, error } = await supabase
    .from('user_notification_rules')
    .insert({
      user_id: user.id,
      rule_type: RULE_TYPE,
      params,
      enabled,
      // legacy-required fields (safe defaults)
      country: (params.country ?? 'EG'),
      karat: Number(params.karat ?? 24),
      side: 'buy',
      currency: 'EGP',
      direction: 'above',
      threshold: 0,
      cooldown_minutes: 180,
    })
    .select()
    .single();

  if (error) return noStore(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));
  return noStore(NextResponse.json({ ok: true, rule: data }));
}

