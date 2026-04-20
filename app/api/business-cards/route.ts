import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    
    // Get current user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    return NextResponse.json({ 
      success: true, 
      data: businessCard 
    });
  } catch (error) {
    return adminErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    
    // Get current user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    
    // Validate required fields
    if (!body.full_name || typeof body.full_name !== 'string' || body.full_name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Full name is required' },
        { status: 400 }
      );
    }
    
    // Check if slug is available (if provided)
    if (body.slug && body.slug.trim()) {
      const { data: existing } = await supabase
        .from('admin_business_cards')
        .select('id')
        .eq('slug', body.slug.trim())
        .single();
      
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Slug is already taken' },
          { status: 409 }
        );
      }
    }
    
    // Prepare insert data
    const insertData = {
      user_id: user.id,
      full_name: body.full_name?.trim(),
      role_title: body.role_title?.trim() || null,
      headline: body.headline?.trim() || null,
      bio: body.bio?.trim() || null,
      avatar_url: body.avatar_url?.trim() || null,
      banner_url: body.banner_url?.trim() || null,
      company_name: body.company_name?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
      location: body.location?.trim() || null,
      website_url: body.website_url?.trim() || null,
      linkedin_url: body.linkedin_url?.trim() || null,
      github_url: body.github_url?.trim() || null,
      telegram_url: body.telegram_url?.trim() || null,
      twitter_url: body.twitter_url?.trim() || null,
      instagram_url: body.instagram_url?.trim() || null,
      tiktok_url: body.tiktok_url?.trim() || null,
      youtube_url: body.youtube_url?.trim() || null,
      calendly_url: body.calendly_url?.trim() || null,
      apps_json: body.apps || [],
      skills_json: body.skills || [],
      theme_color: body.theme_color?.trim() || '#000000',
      show_email: Boolean(body.show_email),
      show_phone: Boolean(body.show_phone),
      show_location: Boolean(body.show_location),
      show_company: Boolean(body.show_company),
      noindex: Boolean(body.noindex),
    };
    
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      console.error('[API POST /business-cards] DB Error:', error);
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
    return adminErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    
    // Get current user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    
    // Validate required fields
    if (!body.full_name || typeof body.full_name !== 'string' || body.full_name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Full name is required' },
        { status: 400 }
      );
    }
    
    // Check if business card exists
    const { data: existingCard } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (!existingCard) {
      return NextResponse.json(
        { success: false, error: 'Business card not found' },
        { status: 404 }
      );
    }
    
    // Check if slug is available (if provided and different from current)
    if (body.slug && body.slug.trim() && body.slug.trim() !== existingCard.slug) {
      const { data: slugCheck } = await supabase
        .from('admin_business_cards')
        .select('id')
        .eq('slug', body.slug.trim())
        .single();
      
      if (slugCheck) {
        return NextResponse.json(
          { success: false, error: 'Slug is already taken' },
          { status: 409 }
        );
      }
    }
    
    // Prepare update data
    const updateData: any = {
      full_name: body.full_name?.trim(),
      role_title: body.role_title?.trim() || null,
      headline: body.headline?.trim() || null,
      bio: body.bio?.trim() || null,
      avatar_url: body.avatar_url?.trim() || null,
      banner_url: body.banner_url?.trim() || null,
      company_name: body.company_name?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
      location: body.location?.trim() || null,
      website_url: body.website_url?.trim() || null,
      linkedin_url: body.linkedin_url?.trim() || null,
      github_url: body.github_url?.trim() || null,
      telegram_url: body.telegram_url?.trim() || null,
      twitter_url: body.twitter_url?.trim() || null,
      instagram_url: body.instagram_url?.trim() || null,
      tiktok_url: body.tiktok_url?.trim() || null,
      youtube_url: body.youtube_url?.trim() || null,
      calendly_url: body.calendly_url?.trim() || null,
      apps_json: body.apps || existingCard.apps_json,
      skills_json: body.skills || existingCard.skills_json,
      theme_color: body.theme_color?.trim() || existingCard.theme_color,
      show_email: Boolean(body.show_email),
      show_phone: Boolean(body.show_phone),
      show_location: Boolean(body.show_location),
      show_company: Boolean(body.show_company),
      noindex: Boolean(body.noindex),
    };
    
    if (body.slug && body.slug.trim()) {
      updateData.slug = body.slug.trim();
    }
    
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single();
    
    if (error) {
      console.error('[API PUT /business-cards] DB Error:', error);
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
    return adminErrorToResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();
    
    // Get current user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { error } = await supabase
      .from('admin_business_cards')
      .delete()
      .eq('user_id', user.id);
    
    if (error) {
      console.error('[API DELETE /business-cards] DB Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete business card' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true 
    });
  } catch (error) {
    return adminErrorToResponse(error);
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
