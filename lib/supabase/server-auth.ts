/**
 * Supabase Server Auth Utilities (Next.js 14 App Router with @supabase/ssr)
 * 
 * For use in server components, API routes, and server actions
 * Uses user session, not service role (for RLS-respecting operations)
 */

import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a Supabase client for server-side operations with user session
 * This respects RLS policies based on the authenticated user
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase keys: set SUPABASE_URL + SUPABASE_ANON_KEY');
  }

  console.log('[Supabase] server auth init', {
    host: (() => {
      try {
        return new URL(supabaseUrl).host;
      } catch {
        return supabaseUrl;
      }
    })(),
    keyType: 'anon',
    keyPrefix: String(supabaseAnonKey).slice(0, 10),
  });

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Get the current user session
 */
export async function getServerSession() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Get the current user
 */
export async function getServerUser() {
  // SECURITY: prefer getUser() which verifies session with Supabase Auth server.
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

