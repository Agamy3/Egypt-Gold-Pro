import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { getServerClient } from '@/lib/supabase/server';
import { verifyPaymobHmac, type PaymobWebhookPayload } from '@/lib/paymob/verifyHmac';
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

function pickObj(payload: any): any | null {
  if (!payload) return null;
  if (payload.obj && typeof payload.obj === 'object') return payload.obj;
  if (payload.data?.obj && typeof payload.data.obj === 'object') return payload.data.obj;
  if (payload.transaction && typeof payload.transaction === 'object') return payload.transaction;
  return null;
}

function asText(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const supabase = getServerClient();

  const hmacSecret = process.env.PAYMOB_HMAC_SECRET || '';
  if (!hmacSecret) {
    console.error('[paymob:webhook] missing PAYMOB_HMAC_SECRET', { requestId });
    return withNoStoreHeaders(NextResponse.json({ ok: false }, { status: 500 }));
  }

  const url = new URL(req.url);
  const providedHmac = url.searchParams.get('hmac') || (req.headers.get('x-paymob-hmac') ?? null);

  const rawText = await req.text();
  let payload: any = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }));
  }

  // Support payload-provided hmac if present
  const providedFromBody = asText(payload?.hmac);
  const provided = asText(providedHmac) || providedFromBody;

  const verify = verifyPaymobHmac({
    payload: payload as PaymobWebhookPayload,
    providedHmac: provided,
    secret: hmacSecret,
  });
  const verified = verify.ok;
  if (!verified) {
    console.warn('[paymob:webhook] hmac rejected', { requestId, reason: verify.error });
    // still store unverified event for audit? requirement says insert with verified_hmac flag; reject.
    try {
      await supabase.from('paymob_webhook_events').insert({
        event_type: 'transaction',
        paymob_transaction_id: null,
        paymob_order_id: null,
        merchant_order_id: null,
        raw: payload,
        verified_hmac: false,
        processed: false,
      });
    } catch {
      // ignore best-effort logging failure
    }
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  const obj = pickObj(payload);
  const txnId = asText(obj?.id) || asText(payload?.id);
  const paymobOrderId = asText(obj?.order?.id ?? obj?.order_id ?? payload?.order_id);
  const merchantOrderId =
    asText(obj?.order?.merchant_order_id) || asText(obj?.merchant_order_id) || asText(payload?.merchant_order_id);

  // Insert event with idempotency
  let eventId: number | null = null;
  try {
    const { data, error } = await supabase
      .from('paymob_webhook_events')
      .insert({
        event_type: 'transaction',
        paymob_transaction_id: txnId,
        paymob_order_id: paymobOrderId,
        merchant_order_id: merchantOrderId,
        raw: payload,
        verified_hmac: true,
        processed: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    eventId = (data as any)?.id ?? null;
  } catch (e: any) {
    // Likely duplicate delivery - treat as idempotent
    const code = e?.code || e?.details || e?.message;
    console.warn('[paymob:webhook] event insert failed (maybe duplicate)', { requestId, code });
    // If duplicate, try to find existing
    const q = supabase.from('paymob_webhook_events').select('id, processed').order('created_at', { ascending: false }).limit(1);
    const { data: existing } = txnId
      ? await q.eq('paymob_transaction_id', txnId).maybeSingle()
      : merchantOrderId && paymobOrderId
        ? await q.eq('merchant_order_id', merchantOrderId).eq('paymob_order_id', paymobOrderId).maybeSingle()
        : await q.maybeSingle();
    if ((existing as any)?.processed) {
      return withNoStoreHeaders(NextResponse.json({ ok: true, deduped: true }, { status: 200 }));
    }
    eventId = (existing as any)?.id ?? null;
  }

  // Find our order
  const { data: orderRow } = await (merchantOrderId
    ? supabase
        .from('paymob_orders')
        .select('id, user_id, plan, status, merchant_order_id, paymob_order_id, entitlement_applied_at, entitlement_applied_until')
        .eq('merchant_order_id', merchantOrderId)
        .maybeSingle()
    : paymobOrderId
      ? supabase
          .from('paymob_orders')
          .select('id, user_id, plan, status, merchant_order_id, paymob_order_id, entitlement_applied_at, entitlement_applied_until')
          .eq('paymob_order_id', paymobOrderId)
          .maybeSingle()
      : supabase
          .from('paymob_orders')
          .select('id, user_id, plan, status, merchant_order_id, paymob_order_id, entitlement_applied_at, entitlement_applied_until')
          .limit(1)
          .maybeSingle());

  if (!orderRow) {
    console.warn('[paymob:webhook] order not found', { requestId, txnId, paymobOrderId, merchantOrderId });
    if (eventId) {
      await supabase.from('paymob_webhook_events').update({ processed: true }).eq('id', eventId);
    }
    return withNoStoreHeaders(NextResponse.json({ ok: true }, { status: 200 }));
  }

  const success = obj?.success === true;
  const pending = obj?.pending === true;
  const isAuth = obj?.is_auth === true;
  const isCapture = obj?.is_capture === true;
  const isVoided = obj?.is_voided === true;
  const isRefunded = obj?.is_refunded === true;

  // If we've already applied entitlement for this order, treat retries/duplicates as idempotent.
  if ((orderRow as any).status === 'paid' && (orderRow as any).entitlement_applied_at) {
    if (eventId) {
      await supabase.from('paymob_webhook_events').update({ processed: true }).eq('id', eventId);
    }
    return withNoStoreHeaders(NextResponse.json({ ok: true, deduped: true }, { status: 200 }));
  }

  let newStatus: 'paid' | 'failed' | 'pending' = 'pending';
  // Treat a transaction as paid only when it is successful AND fully authorized+captured.
  if (success && isAuth && isCapture && !pending && !isVoided && !isRefunded) newStatus = 'paid';
  else if ((!success && !pending) || isVoided || isRefunded) newStatus = 'failed';

  // Never downgrade a paid order to pending/failed unless we received an explicit void/refund signal.
  const currentStatus = String((orderRow as any).status || '');
  if (currentStatus === 'paid' && !isVoided && !isRefunded) {
    newStatus = 'paid';
  }

  // Update paymob order status + paymob_order_id if missing
  await supabase
    .from('paymob_orders')
    .update({
      status: newStatus,
      paymob_order_id: orderRow.paymob_order_id || paymobOrderId,
    })
    .eq('id', (orderRow as any).id);

  // Activate premium (idempotent)
  if (newStatus === 'paid') {
    try {
      // If we've already applied entitlement for this merchant_order_id, don't extend again.
      if ((orderRow as any).entitlement_applied_at) {
        if (eventId) {
          await supabase.from('paymob_webhook_events').update({ processed: true }).eq('id', eventId);
        }
        return withNoStoreHeaders(NextResponse.json({ ok: true, deduped: true }, { status: 200 }));
      }

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
    } catch (e) {
      console.error('[paymob:webhook] premium update failed', { requestId, error: e instanceof Error ? e.message : String(e) });
      // Return non-2xx so Paymob retries. Webhook insert is idempotent.
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'entitlement_update_failed' }, { status: 500 }));
    }
  }

  if (eventId) {
    await supabase.from('paymob_webhook_events').update({ processed: true }).eq('id', eventId);
  }

  console.log('[paymob:webhook] processed', {
    requestId,
    txnId,
    paymobOrderId,
    merchantOrderId: (orderRow as any).merchant_order_id,
    status: newStatus,
  });

  return withNoStoreHeaders(NextResponse.json({ ok: true }, { status: 200 }));
}

