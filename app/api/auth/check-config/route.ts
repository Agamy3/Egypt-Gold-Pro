/**
 * Debug endpoint to check auth configuration
 * GET /api/auth/check-config
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const hasSupabaseUrl = !!supabaseUrl;
  const hasSupabaseAnonKey = !!supabaseAnonKey;
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Don't expose actual values, just check if they exist
  return NextResponse.json({
    configured: hasSupabaseUrl && hasSupabaseAnonKey,
    hasSupabaseUrl,
    hasSupabaseAnonKey,
    hasServiceRoleKey,
    supabaseUrlLength: supabaseUrl?.length || 0,
    anonKeyLength: supabaseAnonKey?.length || 0,
    nodeEnv: process.env.NODE_ENV,
  });
}

