import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    
    // Get all cards with user info
    const { data: allCards, error } = await supabase
      .from('admin_business_cards')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Check if any card belongs to our user
    const userCards = allCards?.filter(card => card.user_id === user.id) || [];
    
    // Check the database schema
    const { data: schemaInfo } = await supabase
      .from('admin_business_cards')
      .select('id, user_id, full_name, slug, created_at')
      .limit(3);
    
    return NextResponse.json({
      success: true,
      current_user_id: user.id,
      user_cards_count: userCards.length,
      user_cards: userCards,
      all_cards_count: allCards?.length || 0,
      sample_cards: schemaInfo,
      issue: userCards.length === 0 ? 'No cards found for current user' : 'Cards exist for user'
    });
    
  } catch (error) {
    return adminErrorToResponse(error);
  }
}
