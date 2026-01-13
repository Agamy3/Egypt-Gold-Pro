/**
 * User Profile Utilities
 * 
 * Functions for managing user profiles and preferences
 */

import 'server-only';
import { createServerSupabaseClient } from './server-auth';
import { createServerClient as createAdminClient } from './server';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  preferred_country: 'EG' | 'AE' | 'SA' | 'US' | null;
  preferred_currency: 'EGP' | 'USD' | 'AED' | 'SAR' | null;
  is_premium?: boolean;
  ads_disabled?: boolean;
  role?: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

/**
 * Get user profile by user ID (server-side)
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data as UserProfile | null;
}

/**
 * Create or update user profile
 * Uses admin client to allow creating profile on first sign-in
 */
export async function upsertUserProfile(
  userId: string,
  email: string,
  updates?: {
    display_name?: string | null;
    preferred_country?: 'EG' | 'AE' | 'SA' | 'US' | null;
    preferred_currency?: 'EGP' | 'USD' | 'AED' | 'SAR' | null;
  }
): Promise<UserProfile | null> {
  const supabaseAdmin = createAdminClient();
  
  const profileData = {
    id: userId,
    email,
    ...updates,
  };

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .upsert(profileData, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting user profile:', error);
    return null;
  }

  return data as UserProfile | null;
}

/**
 * Update user preferences (country/currency)
 */
export async function updateUserPreferences(
  userId: string,
  preferences: {
    preferred_country?: 'EG' | 'AE' | 'SA' | 'US' | null;
    preferred_currency?: 'EGP' | 'USD' | 'AED' | 'SAR' | null;
  }
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  
  const { error } = await supabase
    .from('user_profiles')
    .update(preferences)
    .eq('id', userId);

  if (error) {
    console.error('Error updating user preferences:', error);
    return false;
  }

  return true;
}

