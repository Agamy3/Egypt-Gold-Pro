import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export async function tryAdvisoryLock(
  supabase: SupabaseClient,
  lockKey: number
): Promise<{ ok: true; acquired: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('try_advisory_lock', { lock_key: lockKey });
  if (error) return { ok: false, error: error.message };
  return { ok: true, acquired: Boolean(data) };
}

export async function advisoryUnlock(
  supabase: SupabaseClient,
  lockKey: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('advisory_unlock', { lock_key: lockKey });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

