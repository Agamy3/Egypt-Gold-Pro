/**
 * Supabase Server Client (Server-Side Only)
 * 
 * For use in server components, API routes, and server actions
 * Uses service role key for admin operations
 */

import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Use NEXT_PUBLIC_SUPABASE_URL if SUPABASE_URL is not set (for consistency)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing Supabase URL: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set'
  );
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase service role key: SUPABASE_SERVICE_ROLE_KEY must be set (server-only, never expose to client)'
  );
}

/**
 * Create a Supabase client with service role key (bypasses RLS)
 * Use this for server-side operations that need admin privileges
 */
export const createServerClient = () => {
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
import type { SupabaseClient } from '@supabase/supabase-js';
let serverClient: SupabaseClient | null = null;

export const getServerClient = (): SupabaseClient => {
  if (!serverClient) {
    serverClient = createServerClient();
  }
  return serverClient;
};

/**
 * Export supabaseAdmin alias for consistency
 */
export const supabaseAdmin = getServerClient();

