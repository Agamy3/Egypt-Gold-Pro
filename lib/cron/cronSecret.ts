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

