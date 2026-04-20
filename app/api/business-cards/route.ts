import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { createBusinessCard, updateBusinessCard, deleteBusinessCard, getMyBusinessCard, isSlugAvailable } from '@/lib/supabase/business-cards';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    const businessCard = await getMyBusinessCard(user.id);
    
    return NextResponse.json({ 
      success: true, 
      data: businessCard 
    });
  } catch (error) {
    console.error('[API GET /business-cards] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    const body = await request.json();
    
    // Validate required fields
    if (!body.full_name || typeof body.full_name !== 'string' || body.full_name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Full name is required' },
        { status: 400 }
      );
    }
    
    // Sanitize input
    const sanitizedData = {
      full_name: sanitizeText(body.full_name),
      role_title: sanitizeText(body.role_title),
      headline: sanitizeText(body.headline),
      bio: sanitizeText(body.bio),
      avatar_url: sanitizeUrl(body.avatar_url),
      banner_url: sanitizeUrl(body.banner_url),
      company_name: sanitizeText(body.company_name),
      email: sanitizeEmail(body.email),
      phone: sanitizeText(body.phone),
      whatsapp: sanitizeText(body.whatsapp),
      location: sanitizeText(body.location),
      website_url: sanitizeUrl(body.website_url),
      linkedin_url: sanitizeUrl(body.linkedin_url),
      github_url: sanitizeUrl(body.github_url),
      telegram_url: sanitizeUrl(body.telegram_url),
      twitter_url: sanitizeUrl(body.twitter_url),
      instagram_url: sanitizeUrl(body.instagram_url),
      tiktok_url: sanitizeUrl(body.tiktok_url),
      youtube_url: sanitizeUrl(body.youtube_url),
      calendly_url: sanitizeUrl(body.calendly_url),
      apps: Array.isArray(body.apps) ? body.apps.filter((app: any) => 
        app && typeof app.label === 'string' && typeof app.url === 'string' && typeof app.icon === 'string'
      ).map((app: any) => ({
        ...app,
        label: sanitizeText(app.label),
        url: sanitizeUrl(app.url),
        icon: sanitizeText(app.icon)
      })) : [],
      skills: Array.isArray(body.skills) ? body.skills.filter((skill: any) => 
        typeof skill === 'string' && skill.trim().length > 0
      ).map((skill: any) => sanitizeText(skill)) : [],
      theme_color: sanitizeColor(body.theme_color),
      show_email: Boolean(body.show_email),
      show_phone: Boolean(body.show_phone),
      show_location: Boolean(body.show_location),
      show_company: Boolean(body.show_company),
      noindex: Boolean(body.noindex),
      is_public: Boolean(body.is_public),
      slug: sanitizeSlug(body.slug),
    };
    
    // Check slug availability if provided
    if (sanitizedData.slug) {
      const slugAvailable = await isSlugAvailable(sanitizedData.slug);
      if (!slugAvailable) {
        return NextResponse.json(
          { success: false, error: 'Slug is already taken' },
          { status: 409 }
        );
      }
    }
    
    const businessCard = await createBusinessCard(user.id, sanitizedData);
    
    if (!businessCard) {
      return NextResponse.json(
        { success: false, error: 'Failed to create business card' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      data: businessCard 
    });
  } catch (error) {
    console.error('[API POST /business-cards] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    const body = await request.json();
    
    // Validate required fields
    if (body.full_name && (typeof body.full_name !== 'string' || body.full_name.trim().length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Full name must be a non-empty string' },
        { status: 400 }
      );
    }
    
    // Sanitize input
    const sanitizedData = {
      full_name: body.full_name ? sanitizeText(body.full_name) : undefined,
      role_title: body.role_title !== undefined ? sanitizeText(body.role_title) : undefined,
      headline: body.headline !== undefined ? sanitizeText(body.headline) : undefined,
      bio: body.bio !== undefined ? sanitizeText(body.bio) : undefined,
      avatar_url: body.avatar_url !== undefined ? sanitizeUrl(body.avatar_url) : undefined,
      banner_url: body.banner_url !== undefined ? sanitizeUrl(body.banner_url) : undefined,
      company_name: body.company_name !== undefined ? sanitizeText(body.company_name) : undefined,
      email: body.email !== undefined ? sanitizeEmail(body.email) : undefined,
      phone: body.phone !== undefined ? sanitizeText(body.phone) : undefined,
      whatsapp: body.whatsapp !== undefined ? sanitizeText(body.whatsapp) : undefined,
      location: body.location !== undefined ? sanitizeText(body.location) : undefined,
      website_url: body.website_url !== undefined ? sanitizeUrl(body.website_url) : undefined,
      linkedin_url: body.linkedin_url !== undefined ? sanitizeUrl(body.linkedin_url) : undefined,
      github_url: body.github_url !== undefined ? sanitizeUrl(body.github_url) : undefined,
      telegram_url: body.telegram_url !== undefined ? sanitizeUrl(body.telegram_url) : undefined,
      twitter_url: body.twitter_url !== undefined ? sanitizeUrl(body.twitter_url) : undefined,
      instagram_url: body.instagram_url !== undefined ? sanitizeUrl(body.instagram_url) : undefined,
      tiktok_url: body.tiktok_url !== undefined ? sanitizeUrl(body.tiktok_url) : undefined,
      youtube_url: body.youtube_url !== undefined ? sanitizeUrl(body.youtube_url) : undefined,
      calendly_url: body.calendly_url !== undefined ? sanitizeUrl(body.calendly_url) : undefined,
      apps: body.apps !== undefined ? (Array.isArray(body.apps) ? body.apps.filter((app: any) => 
        app && typeof app.label === 'string' && typeof app.url === 'string' && typeof app.icon === 'string'
      ).map((app: any) => ({
        ...app,
        label: sanitizeText(app.label),
        url: sanitizeUrl(app.url),
        icon: sanitizeText(app.icon)
      })) : []) : undefined,
      skills: body.skills !== undefined ? (Array.isArray(body.skills) ? body.skills.filter((skill: any) => 
        typeof skill === 'string' && skill.trim().length > 0
      ).map((skill: any) => sanitizeText(skill)) : []) : undefined,
      theme_color: body.theme_color !== undefined ? sanitizeColor(body.theme_color) : undefined,
      show_email: body.show_email !== undefined ? Boolean(body.show_email) : undefined,
      show_phone: body.show_phone !== undefined ? Boolean(body.show_phone) : undefined,
      show_location: body.show_location !== undefined ? Boolean(body.show_location) : undefined,
      show_company: body.show_company !== undefined ? Boolean(body.show_company) : undefined,
      noindex: body.noindex !== undefined ? Boolean(body.noindex) : undefined,
      is_public: body.is_public !== undefined ? Boolean(body.is_public) : undefined,
      slug: body.slug !== undefined ? sanitizeSlug(body.slug) : undefined,
    };
    
    // Check slug availability if provided
    if (sanitizedData.slug) {
      const existingCard = await getMyBusinessCard(user.id);
      const slugAvailable = await isSlugAvailable(sanitizedData.slug, existingCard?.user_id);
      if (!slugAvailable) {
        return NextResponse.json(
          { success: false, error: 'Slug is already taken' },
          { status: 409 }
        );
      }
    }
    
    const businessCard = await updateBusinessCard(user.id, sanitizedData);
    
    if (!businessCard) {
      return NextResponse.json(
        { success: false, error: 'Failed to update business card' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      data: businessCard 
    });
  } catch (error) {
    console.error('[API PUT /business-cards] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    const success = await deleteBusinessCard(user.id);
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete business card' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true 
    });
  } catch (error) {
    console.error('[API DELETE /business-cards] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Utility functions for sanitization
function sanitizeText(input: any): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 500); // Limit length
}

function sanitizeEmail(input: any): string {
  if (typeof input !== 'string') return '';
  const email = input.trim().toLowerCase();
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : '';
}

function sanitizeUrl(input: any): string {
  if (typeof input !== 'string') return '';
  const url = input.trim();
  
  // If it doesn't start with http/https, add https://
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  
  return url;
}

function sanitizeColor(input: any): string {
  if (typeof input !== 'string') return '#000000';
  
  // Basic hex color validation
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (hexRegex.test(input)) {
    return input;
  }
  
  return '#000000';
}

function sanitizeSlug(input: any): string {
  if (typeof input !== 'string') return '';
  
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Only allow alphanumeric, spaces, and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove multiple hyphens
    .trim()
    .substring(0, 50); // Limit length
}
