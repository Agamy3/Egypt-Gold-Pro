import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const slug = 'mohamed-agamy'; // Your known slug
    
    console.log('[TEST-PUBLIC] Testing public card access for slug:', slug);
    
    // Test the exact same query as the public page
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .single();
    
    console.log('[TEST-PUBLIC] Query result:', { businessCard, error });
    
    // Also test without the is_public filter
    const { data: allCards, error: allError } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('slug', slug);
    
    console.log('[TEST-PUBLIC] All cards with slug:', { allCards, allError });
    
    // Test with RLS-respecting client
    const { createClient } = await import('@supabase/supabase-js');
    const publicClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    
    const { data: publicCard, error: publicError } = await publicClient
      .from('admin_business_cards')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .single();
    
    console.log('[TEST-PUBLIC] Public client result:', { publicCard, publicError });
    
    return NextResponse.json({
      success: true,
      slug,
      service_role_result: businessCard,
      service_role_error: error,
      all_cards_result: allCards,
      all_cards_error: allError,
      public_client_result: publicCard,
      public_client_error: publicError,
      debug_info: {
        found_with_service_role: !!businessCard,
        found_with_public_client: !!publicCard,
        total_cards_with_slug: allCards?.length || 0
      }
    });
    
  } catch (error) {
    console.error('[TEST-PUBLIC] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
