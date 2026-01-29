/**
 * Admin auth utilities (server-only).
 *
 * IMPORTANT:
 * - Does not rely on client gating.
 * - Does not require service role on the client bundle.
 * - Uses the existing user session (cookies) via @supabase/ssr.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function isAdminUser(): Promise<boolean> {
  const user = await getServerUser();
  if (!user) return false;

  const supabase = await createServerSupabaseClient();

  // 1) Prefer user_profiles.is_admin (this repo already uses it)
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!error && profile && profile.is_admin === true) {
      return true;
    }
  } catch {
    // ignore and try fallback table
  }

  // 2) Fallback: admin_users allowlist table (recommended for admin-only features)
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data?.user_id) return true;
  } catch {
    // ignore
  }

  return false;
}

export async function requireAdmin() {
  const user = await getServerUser();
  if (!user) {
    throw new AdminAuthError('Unauthorized', 401);
  }

  const ok = await isAdminUser();
  if (!ok) {
    throw new AdminAuthError('Forbidden', 403);
  }

  // For RLS-safe reads under admin policy tables, we can use the session client.
  // For writes, route handlers may choose to use the service-role server client after passing this check.
  const supabase = await createServerSupabaseClient();
  return { supabase, user };
}

export function adminErrorToResponse(err: unknown) {
  const status = err instanceof AdminAuthError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Internal error';
  return NextResponse.json({ ok: false, error: message }, { status });
}

