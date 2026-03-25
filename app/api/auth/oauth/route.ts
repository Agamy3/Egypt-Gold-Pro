/**
 * OAuth Sign In API (Google/Apple)
 * POST /api/auth/oauth
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getCanonicalOrigin } from '@/lib/canonical-site';

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
    // Prefer Cloudflare-injected SUPABASE_* values to avoid stale NEXT_PUBLIC_*.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    console.log('[Supabase] server auth init (oauth route):', {
      host: supabaseUrl ? (() => { try { return new URL(supabaseUrl).host; } catch { return supabaseUrl; } })() : null,
      keyType: 'anon',
      keyPrefix: supabaseAnonKey ? String(supabaseAnonKey).slice(0, 10) : null,
    });

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

    // Create response that we can modify
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
            // Set cookie in both request and response
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
            // Remove cookie from both request and response
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

    // Always use a single canonical origin to avoid root/www ambiguity.
    const canonicalOrigin = getCanonicalOrigin();
    const redirectUrl = `${canonicalOrigin}/api/auth/callback?next=/`;

    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_AUTH) {
      console.log('OAuth route - redirectTo:', {
        canonicalOrigin,
        redirectPath: new URL(redirectUrl).pathname,
      });
    }

    // Initiate OAuth flow - this will store PKCE code verifier in cookies
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

    // Return the OAuth URL with the response that has cookies set
    // The PKCE code verifier is now stored in cookies via the supabase client above
    return NextResponse.json({ url: data.url }, {
      headers: response.headers,
    });
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

