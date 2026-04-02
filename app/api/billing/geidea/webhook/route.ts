import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { getServerClient } from '@/lib/supabase/server';
import { getGeideaConfig } from '@/lib/geidea/config';
import { verifyGeideaCallbackSignature } from '@/lib/geidea/signature';
import { applyPremiumEntitlementForUser } from '@/lib/billing/applyPremiumEntitlement';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function asText(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function asNumber(x: any): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === 'number' ? x : Number(String(x));
  return Number.isFinite(n) ? n : null;
}

function normalizeGeideaStatus(raw: string | null): 'paid' | 'failed' | 'pending' {
  const s = String(raw || '').toLowerCase();
  if (s === 'paid' || s === 'success' || s === 'successful' || s === 'completed' || s === 'captured') return 'paid';
  if (s === 'failed' || s === 'declined' || s === 'error' || s === 'cancelled' || s === 'canceled') return 'failed';
  return 'pending';
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const supabase = getServerClient();

  const rawText = await req.text();
  let payload: any = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }));
  }

  const cfg = getGeideaConfig();

  // Try to extract fields from various possible callback shapes.
  const amount = asNumber(payload?.amount ?? payload?.orderAmount ?? payload?.order?.amount);
  const currency = asText(payload?.currency ?? payload?.orderCurrency ?? payload?.order?.currency);
  const orderId = asText(payload?.orderId ?? payload?.order?.orderId ?? payload?.order?.id);
  const merchantReferenceId = asText(payload?.merchantReferenceId ?? payload?.merchantReferenceID ?? payload?.order?.merchantReferenceId);
  const statusRaw = asText(payload?.status ?? payload?.orderStatus ?? payload?.order?.status);
  const timestamp = asText(payload?.timestamp ?? payload?.timeStamp ?? payload?.time_stamp);
  const signature = asText(payload?.signature ?? payload?.Signature) || asText(req.headers.get('x-signature'));

  const verified =
    amount !== null &&
    currency &&
    orderId &&
    merchantReferenceId &&
    statusRaw &&
    timestamp &&
    signature
      ? verifyGeideaCallbackSignature({
          providedSignature: signature,
          publicKey: cfg.publicKey,
          apiPassword: cfg.apiPassword,
          amount,
          currency,
          orderId,
          status: statusRaw,
          merchantReferenceId,
          timestamp,
        })
      : { ok: false as const, error: 'missing_fields_for_signature' };

  if (!verified.ok) {
    console.warn('[geidea:webhook] signature rejected', { requestId, reason: verified.error });
    try {
      await supabase.from('paymob_webhook_events').insert({
        provider: 'geidea',
        event_type: 'callback',
        paymob_transaction_id: null,
        paymob_order_id: null,
        merchant_order_id: merchantReferenceId,
        geidea_order_id: orderId,
        geidea_status: statusRaw,
        raw: payload,
        verified_hmac: false,
        processed: false,
      });
    } catch {
      // ignore best-effort logging
    }
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  // Insert event with idempotency
  let eventId: number | null = null;
  try {
    const { data, error } = await supabase
      .from('paymob_webhook_events')
      .insert({
        provider: 'geidea',
        event_type: 'callback',
        paymob_transaction_id: null,
        paymob_order_id: null,
        merchant_order_id: merchantReferenceId,
        geidea_order_id: orderId,
        geidea_status: statusRaw,
        raw: payload,
        verified_hmac: true,
        processed: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    eventId = (data as any)?.id ?? null;
  } catch (e: any) {
    const code = e?.code || e?.details || e?.message;
    console.warn('[geidea:webhook] event insert failed (maybe duplicate)', { requestId, code });
    // If duplicate, treat as idempotent: we'll try to update order anyway.
  }

  const { data: orderRow } = await supabase
    .from('paymob_orders')
    .select('id, user_id, plan, status, merchant_order_id, entitlement_applied_at, entitlement_applied_until')
    .eq('merchant_order_id', merchantReferenceId)
    .maybeSingle();

  if (!orderRow) {
    console.warn('[geidea:webhook] order not found', { requestId, orderId, merchantReferenceId });
    if (eventId) await supabase.from('paymob_webhook_events').update({ processed: true }).eq('id', eventId);
    return withNoStoreHeaders(NextResponse.json({ ok: true }, { status: 200 }));
  }

  const newStatus = normalizeGeideaStatus(statusRaw);
  const currentStatus = String((orderRow as any).status || '');

  // Never downgrade paid unless explicit failure.
  const finalStatus = currentStatus === 'paid' && newStatus !== 'failed' ? 'paid' : newStatus;

  await supabase
    .from('paymob_orders')
    .update({
      status: finalStatus,
      provider: 'geidea',
      geidea_order_id: orderId,
      geidea_status: statusRaw,
    })
    .eq('id', (orderRow as any).id);

  if (finalStatus === 'paid') {
    try {
      if (!(orderRow as any).entitlement_applied_at) {
        const now = new Date();
        const { premiumUntil } = await applyPremiumEntitlementForUser({
          userId: String((orderRow as any).user_id),
          plan: (orderRow as any).plan,
          merchantOrderId: String((orderRow as any).merchant_order_id),
          now,
        });

        await supabase
          .from('paymob_orders')
          .update({
            entitlement_applied_at: now.toISOString(),
            entitlement_applied_until: premiumUntil,
          })
          .eq('id', (orderRow as any).id);

        console.log('[geidea:webhook] premium applied', {
          requestId,
          merchantOrderId: (orderRow as any).merchant_order_id,
          orderId,
        });
      }
    } catch (e) {
      console.error('[geidea:webhook] premium update failed', { requestId, error: e instanceof Error ? e.message : String(e) });
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'entitlement_update_failed' }, { status: 500 }));
    }
  }

  if (eventId) await supabase.from('paymob_webhook_events').update({ processed: true }).eq('id', eventId);

  console.log('[geidea:webhook] processed', {
    requestId,
    merchantReferenceId,
    orderId,
    status: finalStatus,
  });

  return withNoStoreHeaders(NextResponse.json({ ok: true }, { status: 200 }));
}
