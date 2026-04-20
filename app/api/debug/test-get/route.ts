import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';

export async function GET(request: NextRequest) {
  try {
    console.log('[TEST-GET] Starting business card GET test');
    
    const { supabase, user } = await requireAdmin();
    console.log('[TEST-GET] Auth successful, user:', user.id);
    
    // Test the exact same query as the business-cards GET endpoint
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    console.log('[TEST-GET] Query result:', { businessCard, error });
    
    // Also test with maybeSingle to see if there are multiple cards
    const { data: allUserCards, error: allError } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('user_id', user.id);
    
    console.log('[TEST-GET] All user cards:', { allUserCards, allError });
    
    return NextResponse.json({
      success: true,
      single_result: businessCard,
      single_error: error,
      all_cards: allUserCards,
      all_error: allError,
      user_id: user.id,
      debug_info: {
        has_single_card: !!businessCard,
        has_multiple_cards: !!(allUserCards && allUserCards.length > 0),
        card_count: allUserCards?.length || 0
      }
    });
    
  } catch (error) {
    console.error('[TEST-GET] Error:', error);
    return adminErrorToResponse(error);
  }
}
