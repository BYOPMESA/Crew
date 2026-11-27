import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rule = (dest) => vercel.rewrites.filter((r) => r.destination === dest).map((r) => new RegExp(`^${r.source}$`));
const toShell = rule('/index.html');
const toFunction = rule('/api');
const firstMatch = (p) => vercel.rewrites.find((r) => new RegExp(`^${r.source}$`).test(p))?.destination;

test('vercel.json: client pages fall back to the app shell; API and health go to the function', () => {
  assert.equal(toShell.length, 1);
  for (const p of ['/login', '/signup', '/profile', '/trips/abc', '/trips/abc/invite', '/join/AbC_123-token'])
    assert.equal(firstMatch(p), '/index.html', `${p} should serve the app shell`);
  for (const p of ['/api/me', '/api/auth/login', '/api/invitations/abc', '/healthz'])
    assert.equal(firstMatch(p), '/api', `${p} must reach the function`);
  assert.ok(toFunction.length >= 2);
});

test('api/index.js (the Vercel function) is the same Express app as the root entry', async () => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example-ref.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
    CREW_PUBLIC_URL: 'https://crew-demo.vercel.app',
    COOKIE_SECURE: '1',
  });
  const root = await import('../index.js');
  const fn = await import('../api/index.js');
  assert.equal(fn.default, root.default);
});

test('root entry exports the Express app without listening, and its headers match vercel.json', async () => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example-ref.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
    CREW_PUBLIC_URL: 'https://crew-demo.vercel.app',
    COOKIE_SECURE: '1',
  });
  const { default: app } = await import('../index.js');
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');

  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/nope`);
    assert.equal(res.status, 404);
    const expected = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key.toLowerCase(), h.value]));
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(res.headers.get(key), value, `${key} must match between vercel.json and the server`);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});
