import 'server-only';

import crypto from 'crypto';

/**
 * Paymob webhook HMAC verification.
 *
 * Paymob typically provides `hmac` as a query param, and the payload includes `obj` (transaction object).
 * The canonical HMAC string for transaction webhooks is a concatenation of specific fields in a fixed order.
 *
 * This verifier is strict:
 * - If required fields are missing or we can't compute a canonical string, it returns {ok:false}.
 * - If computed HMAC doesn't match, returns {ok:false}.
 */

export type PaymobWebhookPayload = Record<string, unknown>;

/** Transaction object fields used in Paymob HMAC concatenation (best-effort structural typing). */
type PaymobTxnObj = {
  amount_cents?: unknown;
  created_at?: unknown;
  currency?: unknown;
  error_occured?: unknown;
  has_parent_transaction?: unknown;
  id?: unknown;
  integration_id?: unknown;
  is_3d_secure?: unknown;
  is_auth?: unknown;
  is_capture?: unknown;
  is_refunded?: unknown;
  is_standalone_payment?: unknown;
  is_voided?: unknown;
  order?: { id?: unknown } | null;
  order_id?: unknown;
  owner?: unknown;
  pending?: unknown;
  source_data?: { pan?: unknown; sub_type?: unknown; type?: unknown } | null;
  success?: unknown;
};

function coerce(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v);
}

function safeEqHex(a: string, b: string): boolean {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(aa, 'utf8'), Buffer.from(bb, 'utf8'));
  } catch {
    return false;
  }
}

function getTransactionObj(payload: PaymobWebhookPayload): PaymobTxnObj | null {
  if (!payload) return null;
  const pick = (v: unknown): PaymobTxnObj | null =>
    v && typeof v === 'object' ? (v as PaymobTxnObj) : null;
  return (
    pick(payload.obj) ??
    pick((payload.data as Record<string, unknown> | undefined)?.obj) ??
    pick(payload.transaction)
  );
}

/**
 * Paymob "transaction" HMAC string fields order (commonly documented/used):
 * amount_cents, created_at, currency, error_occured, has_parent_transaction, id, integration_id,
 * is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided, order.id,
 * owner, pending, source_data.pan, source_data.sub_type, source_data.type, success
 */
export function computeTransactionHmacString(payload: PaymobWebhookPayload): { ok: true; str: string } | { ok: false; reason: string } {
  const obj = getTransactionObj(payload);
  if (!obj) return { ok: false, reason: 'missing_obj' };

  const orderId = obj.order?.id ?? obj.order_id ?? null;
  const sourcePan = obj.source_data?.pan ?? '';
  const sourceSubType = obj.source_data?.sub_type ?? '';
  const sourceType = obj.source_data?.type ?? '';

  const parts = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    orderId,
    obj.owner,
    obj.pending,
    sourcePan,
    sourceSubType,
    sourceType,
    obj.success,
  ].map(coerce);

  // If we don't even have transaction id + order id, verification is meaningless.
  const hasTxnId = parts[5].length > 0;
  const hasOrderId = parts[13].length > 0;
  if (!hasTxnId || !hasOrderId) return { ok: false, reason: 'missing_ids' };

  return { ok: true, str: parts.join('') };
}

export function verifyPaymobHmac(args: {
  payload: PaymobWebhookPayload;
  providedHmac: string | null;
  secret: string;
}): { ok: true; computed: string; mode: 'transaction' } | { ok: false; error: string } {
  const provided = (args.providedHmac || '').trim();
  if (!provided) return { ok: false, error: 'missing_hmac' };
  if (!args.secret) return { ok: false, error: 'missing_hmac_secret' };

  const computedStr = computeTransactionHmacString(args.payload);
  if (!computedStr.ok) return { ok: false, error: `cannot_compute:${computedStr.reason}` };

  const computed = crypto.createHmac('sha512', args.secret).update(computedStr.str, 'utf8').digest('hex');
  const match = safeEqHex(computed, provided);
  if (!match) return { ok: false, error: 'hmac_mismatch' };
  return { ok: true, computed, mode: 'transaction' };
}
