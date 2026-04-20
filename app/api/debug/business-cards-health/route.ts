import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      checks: {} as Record<string, any>
    };

    // Check 1: Service role client
    try {
      const serviceClient = getServerClient();
      const { data, error } = await serviceClient
        .from('admin_business_cards')
        .select('count')
        .limit(1);
      
      results.checks.service_client = {
        status: error ? 'error' : 'success',
        error: error?.message,
        data: data
      };
    } catch (err) {
      results.checks.service_client = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }

    // Check 2: Server auth client
    try {
      const authClient = await createServerSupabaseClient();
      const { data, error } = await authClient
        .from('admin_business_cards')
        .select('count')
        .limit(1);
      
      results.checks.auth_client = {
        status: error ? 'error' : 'success',
        error: error?.message,
        data: data
      };
    } catch (err) {
      results.checks.auth_client = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }

    // Check 3: Table structure
    try {
      const serviceClient = getServerClient();
      const { data, error } = await serviceClient
        .from('admin_business_cards')
        .select('*')
        .limit(1);
      
      if (error) {
        results.checks.table_structure = {
          status: 'error',
          error: error.message
        };
      } else {
        results.checks.table_structure = {
          status: 'success',
          columns: data && data.length > 0 ? Object.keys(data[0]) : [],
          sample_row: data
        };
      }
    } catch (err) {
      results.checks.table_structure = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }

    // Check 4: Environment variables
    results.checks.environment = {
      supabase_url: !!process.env.SUPABASE_URL,
      supabase_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase_service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      node_env: process.env.NODE_ENV
    };

    return NextResponse.json(results);

  } catch (error) {
    return NextResponse.json({
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
