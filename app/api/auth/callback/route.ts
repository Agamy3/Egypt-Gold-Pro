/**
 * Auth Callback Route
 * 
 * Handles OAuth redirects from Google/Apple
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    const response = NextResponse.redirect(new URL(next, request.url));
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code);
    
    // Create profile if user was created (OAuth sign-in)
    if (session?.user) {
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
    }

    return response;
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
}

