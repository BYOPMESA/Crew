import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { AUTH_COOKIE, USER, fakeGateway, goodAuth, startServer } from './helpers.js';

const TRIP_ID = '22222222-2222-4222-8222-222222222222';

describe('security headers and static', () => {
  let srv;
  before(async () => (srv = await startServer(fakeGateway())));
  after(() => srv.close());

  test('health check has no secrets and sets security headers', async () => {
    const res = await srv.request('GET', '/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('code revalidates on every load; fonts and photos are cacheable', async () => {
    for (const path of ['/js/main.js', '/app.css', '/style.css']) {
      assert.equal((await srv.request('GET', path)).headers.get('cache-control'), 'no-cache', path);
    }
    assert.match((await srv.request('GET', '/assets/photos/beach.jpg')).headers.get('cache-control'), /max-age=86400/);
    // the single-page shell is served for deep links such as an invite URL
    const shell = await srv.request('GET', '/join/AbCdEfGhIjKlMnOpQrStUvWxYz012345');
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /<div id="app">/);
  });

  test('cross-site writes are blocked, same-origin writes pass the gate', async () => {
    const evil = await srv.request('POST', '/api/auth/logout', { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    const site = await srv.request('POST', '/api/auth/logout', { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(site.status, 403);
    const same = await srv.request('POST', '/api/auth/logout', {
      headers: { origin: srv.base },
    });
    assert.equal(same.status, 200);
  });

  test('unknown API routes 404 as JSON; invalid JSON is a 400', async () => {
    assert.equal((await srv.request('GET', '/api/nope')).status, 404);
    const res = await fetch(`${srv.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    assert.equal(res.status, 400);
  });
});

describe('auth routes', () => {
  test('login: success sets HttpOnly cookies and never returns tokens in the body', async () => {
    const srv = await startServer(
      fakeGateway({
        auth: {
          signInWithPassword: async () => ({
            data: { session: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: USER } },
            error: null,
          }),
        },
      }),
    );
    const res = await srv.request('POST', '/api/auth/login', { body: { email: 'A@Example.com', password: 'pw123456' } });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('AT') && !text.includes('RT'));
    const cookies = res.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    for (const c of cookies) {
      assert.match(c, /HttpOnly/i);
      assert.match(c, /SameSite=Lax/i);
    }
    await srv.close();
  });

  test('login: wrong password and unknown email give the same generic 401', async () => {
    const srv = await startServer(fakeGateway());
    const a = await srv.request('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'wrong-pass' } });
    assert.equal(a.status, 401);
    assert.deepEqual(await a.json(), { error: 'invalid_credentials', message: 'Invalid email or password.' });
    await srv.close();
  });

  test('login: throttled after 10 failed attempts', async () => {
    const srv = await startServer(fakeGateway());
    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await srv.request('POST', '/api/auth/login', { body: { email: 'x@example.com', password: 'bad-bad-bad' } });
    }
    assert.equal(last.status, 429);
    assert.ok(last.headers.get('retry-after'));
    await srv.close();
  });

  test('signup: validates input; reports confirmation-needed; sets cookies when a session is returned', async () => {
    const srv = await startServer(fakeGateway({ auth: { signUp: async () => ({ data: { session: null }, error: null }) } }));
    const bad = await srv.request('POST', '/api/auth/signup', { body: { email: 'nope', password: 'short', display_name: '' } });
    assert.equal(bad.status, 400);
    const ok = await srv.request('POST', '/api/auth/signup', {
      body: { email: 'new@example.com', password: 'longenough1', display_name: 'New Person' },
    });
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json(), { needsConfirmation: true });
    await srv.close();

    const srv2 = await startServer(
      fakeGateway({
        auth: {
          signUp: async () => ({
            data: { session: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: USER } },
            error: null,
          }),
        },
      }),
    );
    const ok2 = await srv2.request('POST', '/api/auth/signup', {
      body: { email: 'new@example.com', password: 'longenough1', display_name: 'New Person' },
    });
    assert.equal(ok2.status, 201);
    assert.equal(ok2.headers.getSetCookie().length, 2);
    await srv2.close();
  });

  test('protected routes: 401 without a valid session, and bad cookies are cleared', async () => {
    const srv = await startServer(fakeGateway());
    for (const path of ['/api/me', '/api/trips', `/api/trips/${TRIP_ID}`]) {
      const res = await srv.request('GET', path);
      assert.equal(res.status, 401, path);
    }
    const stale = await srv.request('GET', '/api/me', { headers: { cookie: 'crew_at=expired; crew_rt=also-bad' } });
    assert.equal(stale.status, 401);
    assert.ok(stale.headers.getSetCookie().some((c) => c.startsWith('crew_at=;')));
    await srv.close();
  });

  test('protected routes: an expired access token is refreshed from the refresh cookie', async () => {
    const srv = await startServer(
      fakeGateway({
        auth: {
          getUser: async (t) => (t === 'new-at' ? { data: { user: USER }, error: null } : { data: { user: null }, error: { message: 'expired' } }),
          refreshSession: async ({ refresh_token }) =>
            refresh_token === 'good-rt'
              ? { data: { session: { access_token: 'new-at', refresh_token: 'rt2', expires_in: 3600, user: USER } }, error: null }
              : { data: { session: null }, error: { message: 'bad' } },
        },
        db: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: USER.id, display_name: 'A' }, error: null }) }) }) }) },
      }),
    );
    const res = await srv.request('GET', '/api/me', { headers: { cookie: 'crew_at=old; crew_rt=good-rt' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).display_name, 'A');
    assert.ok(res.headers.getSetCookie().some((c) => c.startsWith('crew_at=new-at')));
    await srv.close();
  });
});

describe('trip routes (validation and error mapping)', () => {
  let srv;
  const dbError = { code: '42501', message: 'rls' };
  before(
    async () =>
      (srv = await startServer(
        fakeGateway({
          auth: goodAuth,
          db: {
            from: () => ({
              update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
              insert: () => ({ select: () => ({ single: async () => ({ data: null, error: dbError }) }) }),
            }),
          },
        }),
      )),
  );
  after(() => srv.close());
  const headers = { cookie: AUTH_COOKIE };

  test('non-UUID trip ids are 404 before touching the database', async () => {
    assert.equal((await srv.request('GET', '/api/trips/not-a-uuid', { headers })).status, 404);
  });

  test('PATCH rejects bad payloads and unknown fields', async () => {
    const path = `/api/trips/${TRIP_ID}`;
    assert.equal((await srv.request('PATCH', path, { headers, body: { name: '' } })).status, 400);
    assert.equal((await srv.request('PATCH', path, { headers, body: { organiser_id: USER.id } })).status, 400);
    assert.equal((await srv.request('PATCH', path, { headers, body: {} })).status, 400);
  });

  test('PATCH on a trip the caller cannot change returns 404 (not a leak)', async () => {
    const res = await srv.request('PATCH', `/api/trips/${TRIP_ID}`, { headers, body: { name: 'Mine now' } });
    assert.equal(res.status, 404);
  });

  test('database permission errors map to 403', async () => {
    const res = await srv.request('POST', '/api/trips', { headers, body: {} });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'forbidden' });
  });

  test('preferences and budget validate before writing', async () => {
    const prefs = await srv.request('PUT', `/api/trips/${TRIP_ID}/preferences`, {
      headers,
      body: { interests: ['Skydiving'], vibe: 'chill', stay_styles: [], must_visit: null },
    });
    assert.equal(prefs.status, 400);
    const budget = await srv.request('PUT', `/api/trips/${TRIP_ID}/budget`, { headers, body: { amount_rupees: -1 } });
    assert.equal(budget.status, 400);
  });
});
