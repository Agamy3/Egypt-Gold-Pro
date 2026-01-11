/**
 * OAuth Sign In API (Google/Apple)
 * POST /api/auth/oauth
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider } = body;

    if (!provider || !['google', 'apple'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider. Use "google" or "apple"' },
        { status: 400 }
      );
    }

    // Check environment variables - use explicit undefined check
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Log for debugging (only in non-production or if explicitly enabled)
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_AUTH) {
      console.log('OAuth route - Env check:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        urlLength: supabaseUrl?.length || 0,
        keyLength: supabaseAnonKey?.length || 0,
      });
    }

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '') {
      console.error('OAuth route - Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        urlEmpty: !supabaseUrl || supabaseUrl.trim() === '',
        keyEmpty: !supabaseAnonKey || supabaseAnonKey.trim() === '',
      });
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const response = NextResponse.json({});
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value,
              ...options,
            });
            response.cookies.set({
              name,
              value,
              ...options,
            });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value: '',
              ...options,
            });
            response.cookies.set({
              name,
              value: '',
              ...options,
            });
          },
        },
      }
    );

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get('origin') || 'http://localhost:3000';
    const redirectUrl = `${siteUrl}/api/auth/callback?next=/`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider as 'google' | 'apple',
      options: {
        redirectTo: redirectUrl,
        // Don't override queryParams for Google - let Supabase handle it
        // Supabase will use its own redirect_uri that matches the Google OAuth config
      },
    });

    if (error) {
      console.error('OAuth sign-in error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (!data || !data.url) {
      console.error('OAuth data missing:', data);
      return NextResponse.json(
        { error: 'Failed to generate OAuth URL' },
        { status: 500 }
      );
    }

    // Return the OAuth URL for the client to redirect to
    return NextResponse.json({ url: data.url });
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

