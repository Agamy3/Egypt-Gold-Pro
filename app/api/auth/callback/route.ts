/**
 * Auth Callback Route
 * 
 * Handles OAuth redirects from Google/Apple
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getCanonicalOrigin } from '@/lib/canonical-site';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');
    const errorDescription = requestUrl.searchParams.get('error_description');
    const type = requestUrl.searchParams.get('type'); // 'signup' for email confirmation
    const next = requestUrl.searchParams.get('next') || '/';
    const canonicalOrigin = getCanonicalOrigin();
    const safeNext = next.startsWith('/') ? next : '/';

    // Targeted callback logging (do not log the OAuth `code` itself).
    console.log('[AuthCallback] incoming', {
      pathname: requestUrl.pathname,
      hasCode: !!code,
      hasOAuthError: !!error,
      oauthError: error || null,
      type,
      next: safeNext,
      canonicalOrigin,
    });

    // Check for OAuth errors first
    if (error) {
      console.error('OAuth error in callback:', {
        error,
        errorDescription,
        url: request.url,
      });
      const errorUrl = new URL('/auth/auth-code-error', canonicalOrigin);
      errorUrl.searchParams.set('error', error);
      if (errorDescription) {
        errorUrl.searchParams.set('message', decodeURIComponent(errorDescription));
      }
      return NextResponse.redirect(errorUrl);
    }

    if (!code) {
      console.error('No code parameter in callback URL:', request.url);
      return NextResponse.redirect(new URL('/auth/auth-code-error', canonicalOrigin));
    }

    // Cloudflare Workers may inject `SUPABASE_*` (non-NEXT_PUBLIC) env vars.
    // Prefer them to avoid stale Vercel-era NEXT_PUBLIC values.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const debugAuth = process.env.SUPABASE_AUTH_DEBUG === '1' || process.env.NODE_ENV === 'development';

    const supabaseHost = (() => {
      if (!supabaseUrl) return null;
      try {
        return new URL(supabaseUrl).host;
      } catch {
        return null;
      }
    })();

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase configuration missing in callback');
      return NextResponse.redirect(new URL('/auth/auth-code-error', canonicalOrigin));
    }

    if (debugAuth) {
      console.log('[AuthCallback] supabase env', {
        supabaseHost,
        anonKeyLength: supabaseAnonKey?.length ?? 0,
        canonicalOrigin,
      });
    }

    // Create redirect response that we can modify
    const response = NextResponse.redirect(new URL(safeNext, canonicalOrigin));
    
    // Create Supabase client that reads PKCE code verifier from cookies
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            // Read cookie from request - this includes PKCE code verifier
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

    let session: any = null;
    let exchangeError: any = null;
    try {
      const exchangeResult = await supabase.auth.exchangeCodeForSession(code);
      session = exchangeResult.data?.session ?? null;
      exchangeError = exchangeResult.error ?? null;
    } catch (e) {
      exchangeError = e;
    }

    if (exchangeError) {
      const exchangeMessage = exchangeError instanceof Error ? exchangeError.message : String(exchangeError);
      console.error('Error exchanging code for session:', {
        exchangeMessage,
        exchangeCode: exchangeError && (exchangeError as any).code ? (exchangeError as any).code : null,
        exchangeStatus: exchangeError && (exchangeError as any).status ? (exchangeError as any).status : null,
      });
      const errorUrl = new URL('/auth/auth-code-error', canonicalOrigin);
      errorUrl.searchParams.set('error', exchangeMessage || 'unknown_error');
      return NextResponse.redirect(errorUrl);
    }

    if (!session) {
      console.error('No session returned after code exchange');
      const errorUrl = new URL('/auth/auth-code-error', canonicalOrigin);
      errorUrl.searchParams.set('error', 'no_session');
      return NextResponse.redirect(errorUrl);
    }

    // Check if this is an email confirmation
    // Supabase sends type=signup for email confirmation links
    const isEmailConfirmation = type === 'signup';
    
    // Also check if user just confirmed their email (email_confirmed_at is set)
    if (session?.user && session.user.email_confirmed_at) {
      // Check if this is likely a new confirmation by checking if we should redirect to confirmed page
      // For email confirmations, redirect to confirmed page
      if (isEmailConfirmation) {
        const confirmedUrl = new URL('/auth/confirmed', canonicalOrigin);
        return NextResponse.redirect(confirmedUrl);
      }
    }
    
    // Create profile if user was created (OAuth sign-in)
    if (session?.user) {
      try {
        const supabaseAdmin = getServerClient();
        const { data: existingProfile } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('id', session.user.id)
          .single();

        if (!existingProfile) {
          // Create profile for new OAuth user
          const { error: insertError } = await supabaseAdmin.from('user_profiles').insert({
            id: session.user.id,
            email: session.user.email!,
            display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || null,
          });
          if (insertError) {
            console.error('Error creating profile in OAuth callback:', insertError);
            // Don't fail the auth flow if profile creation fails
          }
        }
      } catch (profileError) {
        console.error('Error handling profile creation:', profileError);
        // Don't fail the auth flow if profile creation fails
      }
    }

    return response;
  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.redirect(new URL('/auth/auth-code-error', getCanonicalOrigin()));
  }
}

