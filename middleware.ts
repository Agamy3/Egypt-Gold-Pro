/**
 * Next.js Middleware for Supabase Auth
 * 
 * Refreshes user sessions on each request
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canonicalizeHost, getCanonicalSiteUrl } from '@/lib/canonical-site';

export async function middleware(request: NextRequest) {
  // Canonicalize www -> root to keep Supabase PKCE/session cookies consistent.
  // If OAuth starts on www and the callback lands on root (or vice versa),
  // the PKCE verifier cookie can be missing.
  const requestUrl = new URL(request.url);
  const host = requestUrl.hostname;
  const canonicalHost = canonicalizeHost(host);
  if (canonicalHost !== host) {
    requestUrl.hostname = canonicalHost;
    requestUrl.protocol = 'https:';
    return NextResponse.redirect(requestUrl, 308);
  }

  // Check if Supabase env vars are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If env vars are missing, just pass through without auth
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
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
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
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
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
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

    // Refresh session if expired (don't throw if this fails)
    await supabase.auth.getUser().catch(() => {
      // Silently handle auth errors in middleware
    });
  } catch (error) {
    // If middleware fails, just pass through
    console.error('Middleware error:', error);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - crawler/static files at the public root (e.g. ads.txt)
     * - PWA assets (manifest, service worker, offline page, icons)
     */
    '/((?!_next/static|_next/image|favicon.ico|ads\\.txt|robots\\.txt|sitemap\\.xml|manifest\\.json|manifest\\.webmanifest|sw\\.js|offline\\.html|apple-touch-icon\\.png|icons/|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

