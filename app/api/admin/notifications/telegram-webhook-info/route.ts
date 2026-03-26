import { NextResponse } from 'next/server';
import { adminErrorToResponse, requireAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token && token.length > 20 ? token : null;
}

async function getWebhookInfo(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
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
    if (!token) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, { status: 503 });
    }

    const { res, json } = await getWebhookInfo(token);

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

export async function POST() {
  try {
    await requireAdmin();
    const token = getToken();
    if (!token) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, { status: 503 });
    }

    const webhookUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com').replace(/\/$/, '')}/api/telegram/webhook`;
    const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const setJson = (await setRes.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: unknown }
      | null;
    if (!setRes.ok || !setJson?.ok) {
      return NextResponse.json(
        { ok: false, error: setJson?.description || `Telegram API error (${setRes.status})`, webhookUrl },
        { status: 502 }
      );
    }

    const info = await getWebhookInfo(token);
    return NextResponse.json({
      ok: true,
      webhookUrl,
      setWebhook: setJson,
      webhook: info.json?.result || null,
    });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}
