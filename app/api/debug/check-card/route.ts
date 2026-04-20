import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    // Check if business card exists for this user
    const { data: businessCard, error } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    // Check all business cards in the database
    const { data: allCards } = await supabase
      .from('admin_business_cards')
      .select('*')
      .limit(10);
    
    return NextResponse.json({
      success: true,
      user_card: businessCard,
      all_cards: allCards,
      user_id: user.id,
      has_card: !!businessCard,
      card_slug: businessCard?.slug,
      card_is_public: businessCard?.is_public
    });
    
  } catch (error) {
    return adminErrorToResponse(error);
  }
}
