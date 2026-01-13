/**
 * Get User Status
 * 
 * Server-side helper to check user login, admin, and premium status
 */

import 'server-only';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export interface UserStatus {
  isLoggedIn: boolean;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  premiumFeatures: string[];
}

/**
 * Get user status (logged in, admin, premium)
 */
export async function getUserStatus(): Promise<UserStatus> {
  try {
    const user = await getServerUser();
    
    if (!user) {
      return {
        isLoggedIn: false,
        userId: null,
        email: null,
        isAdmin: false,
        isPremium: false,
        premiumExpiresAt: null,
        premiumFeatures: [],
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('is_premium, premium_expires_at, is_admin, premium_features, email')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      // Fallback to ADMIN_EMAILS env var for admin check
      const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
      const isAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
      
      return {
        isLoggedIn: true,
        userId: user.id,
        email: user.email || null,
        isAdmin,
        isPremium: false,
        premiumExpiresAt: null,
        premiumFeatures: [],
      };
    }

    // Check admin: DB is_admin OR email in ADMIN_EMAILS
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
    const isAdmin = profile.is_admin || (profile.email && adminEmails.includes(profile.email.toLowerCase())) || false;

    // Check premium: is_premium AND (premium_expires_at is null OR > now())
    const now = new Date();
    const premiumExpiresAt = profile.premium_expires_at ? new Date(profile.premium_expires_at) : null;
    const premiumExpired = premiumExpiresAt ? premiumExpiresAt < now : false;
    const isPremium = profile.is_premium && !premiumExpired;

    const premiumFeatures = (profile.premium_features as string[]) || [];

    return {
      isLoggedIn: true,
      userId: user.id,
      email: profile.email || user.email || null,
      isAdmin,
      isPremium,
      premiumExpiresAt: profile.premium_expires_at || null,
      premiumFeatures,
    };
  } catch (error) {
    console.error('[getUserStatus] Error:', error);
    return {
      isLoggedIn: false,
      userId: null,
      email: null,
      isAdmin: false,
      isPremium: false,
      premiumExpiresAt: null,
      premiumFeatures: [],
    };
  }
}

