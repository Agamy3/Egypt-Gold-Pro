/**
 * Sign Out API
 * POST /api/auth/signout
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  console.log('[Supabase] server auth init (signout route):', {
    host: (() => {
      const url = process.env.SUPABASE_URL;
      try {
        return url ? new URL(url).host : null;
      } catch {
        return url ?? null;
      }
    })(),
    keyType: 'anon',
    keyPrefix: process.env.SUPABASE_ANON_KEY ? String(process.env.SUPABASE_ANON_KEY).slice(0, 10) : null,
  });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
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

  await supabase.auth.signOut();

  return response;
}

