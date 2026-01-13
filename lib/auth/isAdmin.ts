/**
 * Admin Check Helper
 * 
 * Checks if a user is an admin based on email allowlist
 */

import 'server-only';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

/**
 * Check if user is admin
 * 
 * Checks user email against ADMIN_EMAILS env var (comma-separated)
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const user = await getServerUser();
    if (!user) return false;

    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
    if (adminEmails.length === 0) return false;

    // Get user email from user_profiles
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    if (!profile?.email) return false;

    return adminEmails.includes(profile.email.toLowerCase());
  } catch (error) {
    console.error('[isAdmin] Error:', error);
    return false;
  }
}

