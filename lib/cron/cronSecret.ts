import 'server-only';

import type { NextRequest } from 'next/server';

export function getProvidedCronSecret(req: NextRequest | Request): string | null {
  // NextRequest has nextUrl, Request doesn't; only use headers here.
  const headers = (req as any).headers as Headers;
  const fromHeader = headers.get('x-cron-secret');
  if (fromHeader) return fromHeader;

  const auth = headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

  return null;
}

export function isCronSecretValid(provided: string | null | undefined): boolean {
  const expected = (process.env.CRON_SECRET ?? '').trim();
  if (!expected) return false;
  if (!provided) return false;
  return provided === expected;
}

/**
 * Vercel Cron requests include `x-vercel-cron: 1`.
 * This lets scheduled jobs run without hardcoding secrets into `vercel.json`.
 *
 * NOTE: We still allow CRON_SECRET (x-cron-secret / Bearer) for manual invocations.
 */
export function isAuthorizedVercelCron(req: NextRequest | Request): boolean {
  const headers = (req as any).headers as Headers;
  const vercelCron = headers.get('x-vercel-cron');
  const isVercelEnv = (process.env.VERCEL ?? '') === '1';
  return isVercelEnv && Boolean(vercelCron);
}

export function isCronRequestAuthorized(req: NextRequest | Request, providedSecret?: string | null): boolean {
  if (isCronSecretValid(providedSecret ?? getProvidedCronSecret(req))) return true;
  if (isAuthorizedVercelCron(req)) return true;
  return false;
}

