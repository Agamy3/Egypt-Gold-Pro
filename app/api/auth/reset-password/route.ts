/**
 * Password Reset API
 * POST /api/auth/reset-password
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getCanonicalOrigin } from '@/lib/canonical-site';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const response = NextResponse.json({});
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    console.log('[Supabase] server auth init (reset-password route):', {
      host: (() => {
        try {
          return new URL(supabaseUrl).host;
        } catch {
          return supabaseUrl;
        }
      })(),
      keyType: 'anon',
      keyPrefix: supabaseAnonKey ? String(supabaseAnonKey).slice(0, 10) : null,
    });

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

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getCanonicalOrigin()}/auth/reset-password`,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      message: 'Password reset email sent. Please check your inbox.' 
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

