import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    
    console.log('[CHECK-ALL-POLICIES] Comprehensive RLS policy check');
    
    // Test 1: Get ALL RLS policies for admin_business_cards table
    const { data: allPolicies, error: policyError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'admin_business_cards')
      .order('policyname');
    
    console.log('[CHECK-ALL-POLICIES] All policies:', { allPolicies, policyError });
    
    // Test 2: Check if RLS is enabled
    const { data: rlsStatus, error: rlsError } = await supabase
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .eq('tablename', 'admin_business_cards')
      .single();
    
    console.log('[CHECK-ALL-POLICIES] RLS status:', { rlsStatus, rlsError });
    
    // Test 3: Try a direct SQL query to see what happens
    const { data: directQuery, error: directError } = await supabase
      .from('admin_business_cards')
      .select('slug, is_public, full_name')
      .eq('slug', 'mohamed-agamy');
    
    console.log('[CHECK-ALL-POLICIES] Direct query:', { directQuery, directError });
    
    // Test 4: Check if there are any policies that might be blocking
    const { data: blockingPolicies, error: blockingError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'admin_business_cards')
      .eq('cmd', 'SELECT');
    
    console.log('[CHECK-ALL-POLICIES] SELECT policies:', { blockingPolicies, blockingError });
    
    return NextResponse.json({
      success: true,
      all_policies: allPolicies,
      policy_error: policyError,
      rls_status: rlsStatus,
      rls_error: rlsError,
      direct_query_result: directQuery,
      direct_query_error: directError,
      select_policies: blockingPolicies,
      select_policies_error: blockingError,
      debug_info: {
        has_policies: !!(allPolicies && allPolicies.length > 0),
        rls_enabled: rlsStatus?.rowsecurity === true,
        card_exists: !!(directQuery && directQuery.length > 0),
        has_public_policy: !!(blockingPolicies && blockingPolicies.some((p: any) => p.policyname.includes('Public')))
      }
    });
    
  } catch (error) {
    console.error('[CHECK-ALL-POLICIES] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
