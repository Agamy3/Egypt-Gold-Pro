import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';

export async function POST(request: NextRequest) {
  try {
    console.log('[FULL-TEST] Starting business card creation test');
    
    const { supabase, user } = await requireAdmin();
    console.log('[FULL-TEST] Auth successful, user:', user.id);
    
    const body = await request.json();
    console.log('[FULL-TEST] Request body:', body);
    
    // Test the exact same data structure as the real API
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
    
    console.log('[FULL-TEST] Insert data prepared:', insertData);
    
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .insert(insertData)
      .select()
      .single();
    
    console.log('[FULL-TEST] Insert result:', { businessCard, error });
    
    if (error) {
      console.error('[FULL-TEST] Database error:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error,
        debug: {
          user_id: user.id,
          insert_data: insertData,
          error_code: error.code,
          error_details: error.details
        }
      });
    }
    
    console.log('[FULL-TEST] Success! Business card created:', businessCard);
    
    return NextResponse.json({
      success: true,
      data: businessCard,
      message: 'Business card created successfully'
    });
    
  } catch (error) {
    console.error('[FULL-TEST] Catch block error:', error);
    return adminErrorToResponse(error);
  }
}
