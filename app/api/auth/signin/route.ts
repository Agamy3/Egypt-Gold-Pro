/**
 * Email/Password Sign In API
 * POST /api/auth/signin
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '') {
      console.error('Signin route - Missing environment variables:', {
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

    console.log('[Supabase] server auth init (signin route):', {
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

    const response = NextResponse.json({ success: true });
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return response;
  } catch (error) {
    console.error('Signin error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

