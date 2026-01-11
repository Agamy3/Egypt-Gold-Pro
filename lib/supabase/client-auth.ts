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
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

