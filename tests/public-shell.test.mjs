import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicHomeShell } from '../lib/worker/public-shell.mjs';
const request = (path = '/', headers = {}) => new Request('https://egyptgoldpro.com' + path, { headers: { accept: 'text/html', ...headers } });
function environment(status = 200) {
  let calls = 0;
  return { env: { NEXT_PUBLIC_SITE_URL: 'https://egyptgoldpro.com', ASSETS: { fetch: async req => {
    calls++; assert.equal(new URL(req.url).pathname, '/__egp-shell/homepage.bin');
    assert.equal(req.headers.get('cookie'), null);
    return new Response('<html>verified public shell</html>', { status, headers: { 'content-type': 'application/octet-stream' } });
  } } }, calls: () => calls };
}

test('anonymous home and consent-only visitors get a verified HTML asset', async () => {
  const h = environment();
  for (const req of [request('/?country=US&currency=USD'), request('/', { cookie: 'cookie_consent=accepted' })]) {
    const res = await publicHomeShell(req, h.env);
    assert.equal(res.headers.get('x-egp-page'), 'static-shell');
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('cache-control'), /no-cache/);
    assert.equal(await res.text(), '<html>verified public shell</html>');
  }
});

test('sessions, actions, Next navigation, other hosts and non-home routes use Next', async () => {
  const h = environment();
  for (const headers of [{ cookie: 'sb-x-auth-token=session' }, { cookie: 'other=unknown' }, { authorization: 'Bearer test' }, { rsc: '1' }, { 'next-router-prefetch': '1' }, { 'next-action': 'action' }, { accept: 'text/x-component' }, { range: 'bytes=0-1' }]) {
    assert.equal(await publicHomeShell(request('/', headers), h.env), null);
  }
  for (const req of [request('/account'), new Request('https://www.egyptgoldpro.com/', { headers: { accept: 'text/html' } }), new Request('http://egyptgoldpro.com/', { headers: { accept: 'text/html' } }), new Request('https://egyptgoldpro.com/', { method: 'POST', headers: { accept: 'text/html' } })]) {
    assert.equal(await publicHomeShell(req, h.env), null);
  }
  assert.equal(h.calls(), 0);
});

test('missing assets and unavailable bindings fall back without failing the page', async () => {
  assert.equal(await publicHomeShell(request(), environment(404).env), null);
  assert.equal(await publicHomeShell(request(), {}), null);
  assert.equal(await publicHomeShell(request(), { NEXT_PUBLIC_SITE_URL: 'https://egyptgoldpro.com', ASSETS: { fetch() { throw Error('unavailable'); } } }), null);
});
