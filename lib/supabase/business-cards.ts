/**
 * Business Cards Database Utilities
 * 
 * Server-side utilities for managing admin business cards
 */

import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export interface BusinessCard {
  id: string;
  user_id: string;
  slug: string;
  is_public: boolean;
  full_name: string;
  role_title?: string;
  headline?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  company_name?: string;
  company_logo_url?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  location?: string;
  website_url?: string;
  linkedin_url?: string;
  github_url?: string;
  telegram_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  calendly_url?: string;
  apps_json?: any[];
  skills_json?: string[];
  theme_color?: string;
  show_email: boolean;
  show_phone: boolean;
  show_location: boolean;
  show_company: boolean;
  noindex: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppPlatformLink {
  id: string;
  label: string;
  url: string;
  icon: string;
}

export interface CreateBusinessCardData {
  slug?: string;
  is_public?: boolean;
  full_name: string;
  role_title?: string;
  headline?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  company_name?: string;
  company_logo_url?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  location?: string;
  website_url?: string;
  linkedin_url?: string;
  github_url?: string;
  telegram_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  calendly_url?: string;
  apps?: AppPlatformLink[];
  skills?: string[];
  theme_color?: string;
  show_email?: boolean;
  show_phone?: boolean;
  show_location?: boolean;
  show_company?: boolean;
  noindex?: boolean;
}

export type UpdateBusinessCardData = Partial<CreateBusinessCardData>;

/**
 * Get business card by slug (public access)
 */
export async function getBusinessCardBySlug(slug: string): Promise<BusinessCard | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('admin_business_cards')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();
  
  if (error) {
    console.error('[getBusinessCardBySlug] Error:', error);
    return null;
  }
  
  // Handle missing company_logo_url column gracefully
  if (data && !('company_logo_url' in data)) {
    (data as any).company_logo_url = null;
  }
  
  return data;
}

/**
 * Get business card for current admin user
 */
export async function getMyBusinessCard(userId: string): Promise<BusinessCard | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('admin_business_cards')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (error) {
    console.error('[getMyBusinessCard] Error:', error);
    return null;
  }
  
  // Handle missing company_logo_url column gracefully
  if (data && !('company_logo_url' in data)) {
    (data as any).company_logo_url = null;
  }
  
  return data;
}

/**
 * Create new business card for admin user
 */
export async function createBusinessCard(
  userId: string, 
  cardData: CreateBusinessCardData
): Promise<BusinessCard | null> {
  const supabase = await createServerSupabaseClient();
  
  // Handle missing company_logo_url column gracefully
  const insertData: any = {
    user_id: userId,
    ...cardData,
    apps_json: cardData.apps || [],
    skills_json: cardData.skills || [],
  };
  
  // Only include company_logo_url if the column exists
  if (cardData.company_logo_url) {
    insertData.company_logo_url = cardData.company_logo_url;
  }
  
  const { data, error } = await supabase
    .from('admin_business_cards')
    .insert(insertData)
    .select()
    .single();
  
  if (error) {
    console.error('[createBusinessCard] Error:', error);
    return null;
  }
  
  // Handle missing company_logo_url column gracefully in response
  if (data && !('company_logo_url' in data)) {
    (data as any).company_logo_url = null;
  }
  
  return data;
}

/**
 * Update business card
 */
export async function updateBusinessCard(
  userId: string,
  cardData: UpdateBusinessCardData
): Promise<BusinessCard | null> {
  const supabase = await createServerSupabaseClient();
  
  // Handle missing company_logo_url column gracefully
  const updateData: any = {
    ...cardData,
    ...(cardData.apps !== undefined && { apps_json: cardData.apps }),
    ...(cardData.skills !== undefined && { skills_json: cardData.skills }),
    updated_at: new Date().toISOString(),
  };
  
  // Only include company_logo_url if it's provided and the column exists
  if ('company_logo_url' in cardData && cardData.company_logo_url !== undefined) {
    updateData.company_logo_url = cardData.company_logo_url;
  }
  
  const { data, error } = await supabase
    .from('admin_business_cards')
    .update(updateData)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    console.error('[updateBusinessCard] Error:', error);
    return null;
  }
  
  // Handle missing company_logo_url column gracefully in response
  if (data && !('company_logo_url' in data)) {
    (data as any).company_logo_url = null;
  }
  
  return data;
}

/**
 * Delete business card
 */
export async function deleteBusinessCard(userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  
  const { error } = await supabase
    .from('admin_business_cards')
    .delete()
    .eq('user_id', userId);
  
  if (error) {
    console.error('[deleteBusinessCard] Error:', error);
    return false;
  }
  
  return true;
}

/**
 * Check if slug is available
 */
export async function isSlugAvailable(slug: string, excludeUserId?: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  
  let query = supabase
    .from('admin_business_cards')
    .select('id')
    .eq('slug', slug);
  
  if (excludeUserId) {
    query = query.neq('user_id', excludeUserId);
  }
  
  const { data, error } = await query.maybeSingle();
  
  if (error) {
    console.error('[isSlugAvailable] Error:', error);
    return false;
  }
  
  return !data;
}

/**
 * Generate slug from name
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Get all public business cards (for admin overview)
 */
export async function getAllPublicBusinessCards(): Promise<BusinessCard[]> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('admin_business_cards')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[getAllPublicBusinessCards] Error:', error);
    return [];
  }
  
  return data || [];
}
