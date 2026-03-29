import { NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function getToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token && token.length > 20 ? token : null;
}

async function getWebhookInfo(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: Record<string, unknown>; description?: string }
    | null;
  return { res, json };
}

export async function GET() {
  try {
    await requireAdmin();

    const token = getToken();
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || null;

    let webhook: Record<string, unknown> | null = null;
    let webhookError: string | null = null;

    if (token) {
      const info = await getWebhookInfo(token);
      if (!info.res.ok || !info.json?.ok) {
        webhookError = info.json?.description || `Telegram API error (${info.res.status})`;
      } else {
        webhook = (info.json.result as Record<string, unknown>) || null;
      }
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        configured: !!token,
        botTokenPresent: !!token,
        botUsername,
        webhook,
        webhookError,
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
