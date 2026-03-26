import { NextResponse } from 'next/server';
import { adminErrorToResponse, requireAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await requireAdmin();
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 503 }
      );
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: Record<string, unknown>; description?: string }
      | null;

    if (!res.ok || !json?.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: json?.description || `Telegram API error (${res.status})`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      webhook: json.result || null,
    });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}
