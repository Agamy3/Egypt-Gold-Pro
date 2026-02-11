import 'server-only';

import { getServerClient } from '@/lib/supabase/server';

export type PremiumPlan = 'premium_monthly' | 'premium_yearly';

function addDaysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Apply/extend Premium for a user using `public.user_entitlements` as source of truth.
 *
 * - If current entitlement is lifetime (premium_until is NULL and is_premium=true), it is not modified.
 * - Otherwise extends from max(now, current premium_until) by 30/365 days.
 * - Also best-effort syncs legacy `public.user_profiles` fields for backward compatibility.
 *
 * Returns the resulting premium_until ISO string (or null for lifetime).
 */
export async function applyPremiumEntitlementForUser(args: {
  userId: string;
  plan: PremiumPlan;
  merchantOrderId?: string | null;
  now?: Date;
}): Promise<{ premiumUntil: string | null }> {
  const supabase = getServerClient();
  const now = args.now ?? new Date();

  const { data: currentEnt, error: entErr } = await supabase
    .from('user_entitlements')
    .select('is_premium, premium_until')
    .eq('user_id', args.userId)
    .maybeSingle();

  // If the table doesn't exist yet in an environment, don't hard-fail the whole webhook.
  if (entErr && String(entErr.message || '').toLowerCase().includes('user_entitlements')) {
    throw new Error('user_entitlements_missing');
  }

  const isLifetime = Boolean(currentEnt?.is_premium) && currentEnt?.premium_until === null;
  if (isLifetime) {
    return { premiumUntil: null };
  }

  const currentUntilMs = currentEnt?.premium_until ? Date.parse(String(currentEnt.premium_until)) : NaN;
  const base = Number.isFinite(currentUntilMs) && currentUntilMs > now.getTime() ? new Date(currentUntilMs) : now;
  const days = args.plan === 'premium_yearly' ? 365 : 30;
  const newUntil = addDaysFrom(base, days);
  const newUntilIso = newUntil.toISOString();

  const { error: upsertErr } = await supabase.from('user_entitlements').upsert(
    {
      user_id: args.userId,
      is_premium: true,
      premium_until: newUntilIso,
      plan: args.plan,
      last_merchant_order_id: args.merchantOrderId ?? null,
    },
    { onConflict: 'user_id' }
  );
  if (upsertErr) throw new Error(upsertErr.message);

  // Back-compat: keep legacy columns in sync for the rest of the app.
  const { data: legacyProfile } = await supabase
    .from('user_profiles')
    .select('is_premium, premium_expires_at')
    .eq('id', args.userId)
    .maybeSingle();

  const legacyLifetime = Boolean(legacyProfile?.is_premium) && legacyProfile?.premium_expires_at === null;
  if (!legacyLifetime) {
    await supabase
      .from('user_profiles')
      .update({ is_premium: true, premium_expires_at: newUntilIso })
      .eq('id', args.userId);
  }

  return { premiumUntil: newUntilIso };
}

