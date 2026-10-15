import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { createServerClient } from '@supabase/ssr';

jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }));
const create = createServerClient as jest.Mock;
const getUser = jest.fn().mockResolvedValue({ data: { user: null } });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  create.mockReturnValue({ auth: { getUser } });
});

test.each([undefined, 'consent=yes', 'sb-example-auth-token-code-verifier=pkce'])('anonymous/PKCE-only requests skip auth refresh (%s)', async cookie => {
  const response = await middleware(new NextRequest('https://egyptgoldpro.com/api/marketSnapshot', { headers: cookie ? { cookie } : {} }));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(create).not.toHaveBeenCalled();
});

test.each(['sb-example-auth-token=session', 'sb-example-auth-token.0=chunk', 'sb-access-token=legacy', 'sb-refresh-token=legacy'])('existing sessions still refresh (%s)', async cookie => {
  await middleware(new NextRequest('https://egyptgoldpro.com/account', { headers: { cookie } }));
  expect(getUser).toHaveBeenCalledTimes(1);
});

test('www canonicalization still precedes the anonymous bypass', async () => {
  const response = await middleware(new NextRequest('https://www.egyptgoldpro.com/account?next=portfolio'));
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe('https://egyptgoldpro.com/account?next=portfolio');
  expect(create).not.toHaveBeenCalled();
});
