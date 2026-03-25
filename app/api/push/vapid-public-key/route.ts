import { NextResponse } from 'next/server';

/**
 * Exposes the VAPID **public** key for Web Push subscription.
 * Cloudflare / OpenNext often omit `NEXT_PUBLIC_*` from the client bundle if it was not
 * present at **build** time; Worker `vars` are runtime-only, so the browser fetches this route.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    '';

  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: 'VAPID public key not configured (set VAPID_PUBLIC_KEY or NEXT_PUBLIC_VAPID_PUBLIC_KEY)' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { ok: true, publicKey },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
