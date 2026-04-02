import 'server-only';

import crypto from 'crypto';

function formatAmount(amount: number): string {
  // Geidea signature examples use 2 decimal places with invariant culture.
  return amount.toFixed(2);
}

export function geideaTimestampNow(): string {
  // Geidea examples use `YYYY/MM/DD HH:mm:ss`
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function buildGeideaCreateSessionSignature(args: {
  publicKey: string;
  apiPassword: string;
  amount: number;
  currency: string;
  merchantReferenceId: string;
  timestamp: string;
}): string {
  const data = `${args.publicKey}${formatAmount(args.amount)}${args.currency}${args.merchantReferenceId}${args.timestamp}`;
  const hmac = crypto.createHmac('sha256', args.apiPassword).update(data, 'utf8').digest();
  return hmac.toString('base64');
}

export function buildGeideaCallbackSignature(args: {
  publicKey: string;
  apiPassword: string;
  amount: number;
  currency: string;
  orderId: string;
  status: string;
  merchantReferenceId: string;
  timestamp: string;
}): string {
  // Docs: concat { MerchantPublicKey , OrderAmount, OrderCurrency, Orderid, Status, MerchantRefrenceId, timeStamp }
  const data = `${args.publicKey}${formatAmount(args.amount)}${args.currency}${args.orderId}${args.status}${args.merchantReferenceId}${args.timestamp}`;
  const hmac = crypto.createHmac('sha256', args.apiPassword).update(data, 'utf8').digest();
  return hmac.toString('base64');
}

export function verifyGeideaCallbackSignature(args: {
  providedSignature: string | null | undefined;
  publicKey: string;
  apiPassword: string;
  amount: number;
  currency: string;
  orderId: string;
  status: string;
  merchantReferenceId: string;
  timestamp: string;
}): { ok: true } | { ok: false; error: string } {
  const provided = String(args.providedSignature || '').trim();
  if (!provided) return { ok: false, error: 'missing_signature' };

  const computed = buildGeideaCallbackSignature({
    publicKey: args.publicKey,
    apiPassword: args.apiPassword,
    amount: args.amount,
    currency: args.currency,
    orderId: args.orderId,
    status: args.status,
    merchantReferenceId: args.merchantReferenceId,
    timestamp: args.timestamp,
  });

  // Timing-safe compare base64 strings by comparing the decoded buffers.
  try {
    const a = Buffer.from(computed, 'base64');
    const b = Buffer.from(provided, 'base64');
    if (a.length !== b.length) return { ok: false, error: 'signature_mismatch' };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: 'signature_mismatch' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'invalid_signature_encoding' };
  }
}
