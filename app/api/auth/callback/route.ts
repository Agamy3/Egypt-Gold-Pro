/**
 * Auth Callback Route
 * 
 * Handles OAuth redirects from Google/Apple
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');
    const errorDescription = requestUrl.searchParams.get('error_description');
    const next = requestUrl.searchParams.get('next') || '/';

    // Check for OAuth errors first
    if (error) {
      console.error('OAuth error in callback:', {
        error,
        errorDescription,
        url: request.url,
      });
      const errorUrl = new URL('/auth/auth-code-error', request.url);
      errorUrl.searchParams.set('error', error);
      if (errorDescription) {
        errorUrl.searchParams.set('message', decodeURIComponent(errorDescription));
      }
      return NextResponse.redirect(errorUrl);
    }

    if (!code) {
      console.error('No code parameter in callback URL:', request.url);
      return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase configuration missing in callback');
      return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
    }

    const response = NextResponse.redirect(new URL(next, request.url));
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

    const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (exchangeError) {
      console.error('Error exchanging code for session:', {
        error: exchangeError.message,
        code: exchangeError.code,
        status: exchangeError.status,
        fullError: exchangeError,
      });
      const errorUrl = new URL('/auth/auth-code-error', request.url);
      errorUrl.searchParams.set('error', exchangeError.message || 'unknown_error');
      return NextResponse.redirect(errorUrl);
    }

    if (!session) {
      console.error('No session returned after code exchange');
      const errorUrl = new URL('/auth/auth-code-error', request.url);
      errorUrl.searchParams.set('error', 'no_session');
      return NextResponse.redirect(errorUrl);
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
    return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
  }
}

