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
import { getServerClient } from '@/lib/supabase/server';

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

  const supabase = getServerClient();

  // Only check user_profiles.is_admin field using service role client (bypasses RLS)
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!error && profile && profile.is_admin === true) {
    return true;
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

