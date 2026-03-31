/**
 * Supabase Server Client (Server-Side Only)
 *
 * For use in server components, API routes, and server actions
 * Uses service role key for admin operations
 */

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const debugAuth = process.env.SUPABASE_AUTH_DEBUG === '1' || process.env.NODE_ENV === 'development';

  if (!supabaseUrl) {
    throw new Error(
      'Missing Supabase URL: SUPABASE_URL must be set'
    );
  }
  if (!supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase service role key: SUPABASE_SERVICE_ROLE_KEY must be set (server-only, never expose to client)'
    );
  }
  if (debugAuth) {
    console.log('[Supabase] server admin init', {
      host: (() => {
        try {
          return new URL(supabaseUrl).host;
        } catch {
          return supabaseUrl;
        }
      })(),
      keyType: 'service_role',
    });
  }
  return { supabaseUrl, supabaseServiceRoleKey };
}

/**
 * Create a Supabase client with service role key (bypasses RLS)
 * Use this for server-side operations that need admin privileges
 */
export const createServerClient = () => {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseConfig();
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

/**
 * Get a singleton Supabase server client
 */
let serverClient: SupabaseClient | null = null;

export const getServerClient = (): SupabaseClient => {
  if (!serverClient) {
    serverClient = createServerClient();
  }
  return serverClient;
};
