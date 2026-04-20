import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Test the exact same pattern as business-cards API
    await requireAdmin();
    const supabase = getServerClient();
    
    // Get current user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - No user in session' },
        { status: 401 }
      );
    }
    
    // Test simple query like business-cards GET
    const { data: testData, error } = await supabase
      .from('admin_business_cards')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    return NextResponse.json({ 
      success: true, 
      user_id: user.id,
      user_email: user.email,
      test_data: testData,
      error,
      message: 'Auth test successful'
    });
    
  } catch (error) {
    return adminErrorToResponse(error);
  }
}
