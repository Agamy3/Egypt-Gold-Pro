/**
 * Supabase Client Auth Utilities (Browser/Client-Side)
 * 
 * For use in client components
 * Uses @supabase/ssr for proper cookie handling
 */

'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for client-side operations
 */
export function createClientSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

