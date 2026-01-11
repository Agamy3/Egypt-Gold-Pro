/**
 * Debug endpoint to check auth configuration
 * GET /api/auth/check-config
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Don't expose actual values, just check if they exist
  return NextResponse.json({
    configured: hasSupabaseUrl && hasSupabaseAnonKey,
    hasSupabaseUrl,
    hasSupabaseAnonKey,
    hasServiceRoleKey,
    supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
    anonKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0,
    nodeEnv: process.env.NODE_ENV,
  });
}

