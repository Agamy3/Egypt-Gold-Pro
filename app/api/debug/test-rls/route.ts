import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const slug = 'mohamed-agamy';
    
    console.log('[TEST-RLS] Testing RLS policies after migration');
    
    // Test 1: Check if migration was applied by listing all policies
    const { data: policies, error: policyError } = await supabase
      .from('pg_policies')
      .select('policyname, tablename, qual, cmd, roles')
      .eq('tablename', 'admin_business_cards');
    
    console.log('[TEST-RLS] Current policies:', { policies, policyError });
    
    // Test 2: Try to access public card with service role (should work)
    const { data: serviceCard, error: serviceError } = await supabase
      .from('admin_business_cards')
      .select('*')
      .eq('slug', slug)
      .single();
    
    console.log('[TEST-RLS] Service role result:', { serviceCard, serviceError });
    
    // Test 3: Try to access public card with anon client (should work after fix)
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    
    const { data: anonCard, error: anonError } = await anonClient
      .from('admin_business_cards')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .single();
    
    console.log('[TEST-RLS] Anon client result:', { anonCard, anonError });
    
    return NextResponse.json({
      success: true,
      slug,
      policies,
      service_role_result: serviceCard,
      service_role_error: serviceError,
      anon_client_result: anonCard,
      anon_client_error: anonError,
      debug_info: {
        migration_applied: policies && policies.some((p: any) => p.policyname === 'Public business cards are viewable by all'),
        service_role_works: !!serviceCard,
        anon_client_works: !!anonCard
      }
    });
    
  } catch (error) {
    console.error('[TEST-RLS] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
