import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    const body = await request.json();
    
    // Test minimal business card creation
    const testCard = {
      user_id: user.id,
      full_name: body.full_name || 'Test Card',
      role_title: null,
      headline: null,
      bio: null,
      avatar_url: null,
      banner_url: null,
      company_name: null,
      email: null,
      phone: null,
      whatsapp: null,
      location: null,
      website_url: null,
      linkedin_url: null,
      github_url: null,
      telegram_url: null,
      twitter_url: null,
      instagram_url: null,
      tiktok_url: null,
      youtube_url: null,
      calendly_url: null,
      apps_json: [],
      skills_json: [],
      theme_color: '#000000',
      show_email: true,
      show_phone: true,
      show_location: true,
      show_company: true,
      noindex: false,
    };
    
    console.log('[DEBUG] Creating test card with data:', testCard);
    
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .insert(testCard)
      .select()
      .single();
    
    console.log('[DEBUG] Insert result:', { businessCard, error });
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error,
        debug: {
          user_id: user.id,
          test_data: testCard
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      data: businessCard,
      message: 'Test business card created successfully'
    });
    
  } catch (error) {
    console.error('[DEBUG] Test create error:', error);
    return adminErrorToResponse(error);
  }
}
