// Server-side behaviour of the invitation routes with the database functions SCRIPTED. These tests cover only what
// the server itself can get wrong: argument shapes, hashing, which client it uses, error mapping, validation and
// rate limits. The functions' real behaviour (auth, expiry, single use, atomicity) is proven in test/db against real
// Postgres, and the full HTTP flow in test/db/flow.test.js. None of this replaces the live two-account test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, describe, test } from 'node:test';
import { INVITE_MESSAGES, TOKEN_RE, hashToken, inviteState, newToken } from '../server/lib/invites.js';
import { AUTH_COOKIE, fakeGateway, goodAuth, startServer } from './helpers.js';

const TRIP = '22222222-2222-4222-8222-222222222222';
const INV = '55555555-5555-4555-8555-555555555555';
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const row = (over = {}) => ({ id: INV, invitee_name: 'Ann', status: 'pending', email_status: 'not_sent', expires_at: iso(7 * 864e5), created_at: iso(0), ...over });
const err = (message, code = 'P0001') => ({ data: null, error: { message, code } });
const ok = (data) => ({ data, error: null });

let srv;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

/** Start a server whose database functions are `script(name, args, who)`; returns a call log too. */
async function serve(script, extra = {}) {
  const calls = [];
  const gateway = fakeGateway({ auth: goodAuth, rpc: async (name, args, who) => (calls.push({ name, args, who }), script(name, args, who)), ...extra });
  srv = await startServer(gateway, { publicUrl: 'http://localhost:3003', ...(extra.config ?? {}) });
  return { calls, gateway };
}
const asOrganiser = { cookie: AUTH_COOKIE };

describe('invite token helpers', () => {
  test('tokens are 32 URL-safe chars, unique, and hashing is stable and one-way', () => {
    const a = newToken();
    assert.match(a, TOKEN_RE);
    assert.notEqual(a, newToken());
    assert.equal(hashToken(a), createHash('sha256').update(a).digest('hex'));
    assert.match(hashToken(a), /^[0-9a-f]{64}$/);
    assert.notEqual(hashToken(a), a);
  });

  test('inviteState: valid, used, revoked, expired, invalid', () => {
    const future = iso(864e5);
    assert.equal(inviteState({ status: 'pending', expires_at: future }), 'valid');
    assert.equal(inviteState({ status: 'joined', expires_at: future }), 'used');
    assert.equal(inviteState({ status: 'revoked', expires_at: future }), 'revoked');
    assert.equal(inviteState({ status: 'pending', expires_at: iso(-1000) }), 'expired');
    assert.equal(inviteState(null), 'invalid');
    for (const k of ['used', 'revoked', 'expired', 'invalid']) assert.ok(INVITE_MESSAGES[k]);
  });
});

describe('create / replace / revoke', () => {
  test('create: calls create_invitation with the USER\'s session, sends only the token\'s hash, returns the link once', async () => {
    const { calls } = await serve(() => ok([row()]));
    const res = await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser, body: { invitee_name: '  Ann  ' } });
    assert.equal(res.status, 201);
    const body = await res.json();
    const token = body.link.split('/join/')[1];
    assert.match(token, TOKEN_RE);
    assert.equal(body.link, `http://localhost:3003/join/${token}`);
    assert.deepEqual(calls.map((c) => [c.name, c.who]), [['create_invitation', 'user']]);
    assert.deepEqual(calls[0].args, { p_trip: TRIP, p_invitee_name: 'Ann', p_token_hash: hashToken(token) });
    assert.ok(!JSON.stringify(calls).includes(token), 'the plain token never reaches the database');
    assert.equal(body.invitation.state, 'valid');
    assert.ok(!('token_hash' in body.invitation));
  });

  test('every error code from the database becomes a clear HTTP response', async () => {
    const cases = {
      not_found: [404, { error: 'not_found' }],
      invalid_name: [400, { error: 'invalid_name', message: "Enter your friend's name (up to 60 characters)." }],
      too_many_invites: [400, { error: 'too_many_invites', message: 'A trip can have up to 30 invites. Cancel one to add another.' }],
      already_joined: [409, { error: 'already_joined', message: 'That person has already joined with this invite.' }],
      not_authenticated: [401, { error: 'not_authenticated', message: 'Please log in first.' }],
    };
    for (const [message, [status, body]] of Object.entries(cases)) {
      await serve(() => err(message));
      const res = await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser, body: { invitee_name: 'Ann' } });
      assert.equal(res.status, status, message);
      assert.deepEqual(await res.json(), body, message);
      await srv.close();
      srv = undefined;
    }
  });

  test('when the migration is missing the answer is a plain 503, not a crash or a SQL error', async () => {
    for (const code of ['PGRST202', '42883']) {
      await serve(() => err('Could not find the function public.create_invitation', code));
      const res = await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser, body: { invitee_name: 'Ann' } });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'invites_unavailable');
      assert.match(body.message, /database update/);
      assert.ok(!/function|public\./i.test(body.message), 'no internals');
      await srv.close();
      srv = undefined;
    }
  });

  test('unexpected database errors never leak details', async () => {
    await serve(() => err('relation "public.secret" does not exist', 'XX000'));
    const res = await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser, body: { invitee_name: 'Ann' } });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'server_error' });
  });

  test('bad input is rejected before the database is called', async () => {
    const { calls } = await serve(() => ok([row()]));
    for (const [path, body] of [
      [`/api/trips/${TRIP}/invitations`, { invitee_name: '   ' }],
      [`/api/trips/${TRIP}/invitations`, { invitee_name: 'x'.repeat(61) }],
      [`/api/trips/${TRIP}/invitations`, { invitee_name: 'Ann', email: 'a@b.c' }],
      [`/api/trips/${TRIP}/invitations`, {}],
      ['/api/trips/not-a-uuid/invitations', { invitee_name: 'Ann' }],
      [`/api/trips/${TRIP}/invitations/not-a-uuid/replace`, undefined],
      [`/api/trips/${TRIP}/invitations/not-a-uuid/revoke`, undefined],
    ]) {
      const res = await srv.request('POST', path, { headers: asOrganiser, body });
      assert.ok([400, 404].includes(res.status), `${path} -> ${res.status}`);
    }
    assert.equal(calls.length, 0);
  });

  test('no session means 401 everywhere and no database call', async () => {
    const { calls } = await serve(() => ok([row()]));
    for (const path of [`/api/trips/${TRIP}/invitations`, `/api/trips/${TRIP}/invitations/${INV}/replace`, `/api/trips/${TRIP}/invitations/${INV}/revoke`]) {
      assert.equal((await srv.request('POST', path, { body: { invitee_name: 'Ann' } })).status, 401, path);
    }
    assert.equal(calls.length, 0);
  });

  test('replace: a NEW token is generated and only its hash is sent; revoke sends no token at all', async () => {
    const { calls } = await serve((name) => (name === 'replace_invitation' ? ok([row({ id: 'new' })]) : ok(null)));
    const rep = await srv.request('POST', `/api/trips/${TRIP}/invitations/${INV}/replace`, { headers: asOrganiser });
    assert.equal(rep.status, 201);
    const token = (await rep.json()).link.split('/join/')[1];
    assert.deepEqual(calls[0].args, { p_trip: TRIP, p_invitation: INV, p_token_hash: hashToken(token) });
    const rev = await srv.request('POST', `/api/trips/${TRIP}/invitations/${INV}/revoke`, { headers: asOrganiser });
    assert.equal(rev.status, 200);
    assert.deepEqual(calls[1], { name: 'revoke_invitation', args: { p_trip: TRIP, p_invitation: INV }, who: 'user' });
  });

  test('replace/revoke map not_found (404) and already_joined (409)', async () => {
    for (const [message, status] of [['not_found', 404], ['already_joined', 409]]) {
      await serve(() => err(message));
      for (const action of ['replace', 'revoke']) {
        assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations/${INV}/${action}`, { headers: asOrganiser })).status, status, `${action} ${message}`);
      }
      await srv.close();
      srv = undefined;
    }
  });

  test('the per-organiser creation limit is configurable and returns 429 with a clear message', async () => {
    await serve(() => ok([row()]), { config: { inviteRateLimit: 2 } });
    const make = () => srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser, body: { invitee_name: 'Ann' } });
    assert.equal((await make()).status, 201);
    assert.equal((await make()).status, 201);
    const third = await make();
    assert.equal(third.status, 429);
    assert.match((await third.json()).message, /Too many invites/);
  });
});

describe('listing', () => {
  test('members see names and derived states; the select never asks for secret columns', async () => {
    const selected = [];
    const db = {
      from: () => ({
        select: (cols) => (selected.push(cols), { eq: () => ({ neq: () => ({ order: async () => ok([row({ expires_at: iso(-1000) }), row({ id: 'b', invitee_name: 'Bob', status: 'joined' }), row({ id: 'c', invitee_name: 'Cy' })]) }) }) }),
      }),
    };
    await serve(() => ok(null), { db });
    const res = await srv.request('GET', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser });
    assert.deepEqual((await res.json()).map((i) => i.state), ['expired', 'used', 'valid']);
    assert.ok(selected.every((c) => !/token_hash|email(?!_status)/.test(c)), selected.join('|'));
  });
});

describe('public landing', () => {
  const previewRow = (over = {}) => ({ state: 'valid', invitee_name: 'Ann', organiser: 'Chris', trip_name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', crew_in: 2, member: false, trip_id: null, ...over });
  const link = () => newToken();

  test('anonymous visitors use the ANONYMOUS client; the hash (not the token) is sent', async () => {
    const { calls } = await serve(() => ok([previewRow()]));
    const t = link();
    const res = await srv.request('GET', `/api/invitations/${t}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      state: 'valid',
      invitee_name: 'Ann',
      organiser: 'Chris',
      trip: { name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23' },
      crew_in: 2,
      member: false,
    });
    assert.deepEqual(calls, [{ name: 'invitation_preview', args: { p_token_hash: hashToken(t) }, who: 'anon' }]);
  });

  test('a signed-in visitor is previewed with THEIR session; an invalid session falls back to anonymous', async () => {
    const { calls } = await serve(() => ok([previewRow({ member: true, trip_id: TRIP })]));
    const t = link();
    const asMember = await (await srv.request('GET', `/api/invitations/${t}`, { headers: asOrganiser })).json();
    assert.equal(asMember.member, true);
    assert.equal(asMember.trip_id, TRIP);
    await srv.request('GET', `/api/invitations/${t}`, { headers: { cookie: 'crew_at=forged' } });
    assert.deepEqual(calls.map((c) => c.who), ['user', 'anon']);
  });

  test('dead, unknown and empty answers reveal only the state and a message', async () => {
    for (const state of ['used', 'revoked', 'expired', 'invalid']) {
      await serve(() => ok([{ ...previewRow({ state }), trip_name: 'LEAK', organiser: 'LEAK' }]));
      const body = await (await srv.request('GET', `/api/invitations/${link()}`)).json();
      assert.deepEqual(body, { state, message: INVITE_MESSAGES[state] });
      await srv.close();
      srv = undefined;
    }
    await serve(() => ok([]));
    assert.equal((await (await srv.request('GET', `/api/invitations/${link()}`)).json()).state, 'invalid');
  });

  test('a malformed link is answered without any database call', async () => {
    const { calls } = await serve(() => ok([previewRow()]));
    for (const bad of ['short', 'x'.repeat(31), `${link()}extra`, 'a b'.padEnd(32, 'c')]) {
      const body = await (await srv.request('GET', `/api/invitations/${encodeURIComponent(bad)}`)).json();
      assert.equal(body.state, 'invalid', bad);
    }
    assert.equal(calls.length, 0);
  });

  test('lookups are rate limited', async () => {
    await serve(() => ok([previewRow()]));
    let last;
    for (let i = 0; i < 61; i += 1) last = await srv.request('GET', `/api/invitations/${link()}`);
    assert.equal(last.status, 429);
  });

  test('missing migration: 503 with the same plain message', async () => {
    await serve(() => err('not found', 'PGRST202'));
    assert.equal((await srv.request('GET', `/api/invitations/${link()}`)).status, 503);
  });
});

describe('accept', () => {
  test('requires a session and never calls the database without one', async () => {
    const { calls } = await serve(() => ok([{ trip_id: TRIP, already_member: false }]));
    assert.equal((await srv.request('POST', `/api/invitations/${newToken()}/accept`)).status, 401);
    assert.equal(calls.length, 0);
  });

  test('joins: calls accept_invitation as the user with the token\'s hash and returns the trip', async () => {
    const { calls } = await serve(() => ok([{ trip_id: TRIP, already_member: false }]));
    const t = newToken();
    const res = await srv.request('POST', `/api/invitations/${t}/accept`, { headers: asOrganiser });
    assert.deepEqual(await res.json(), { trip_id: TRIP, already_member: false });
    assert.deepEqual(calls, [{ name: 'accept_invitation', args: { p_token_hash: hashToken(t) }, who: 'user' }]);
  });

  test('an existing member is told so (open the trip)', async () => {
    await serve(() => ok([{ trip_id: TRIP, already_member: true }]));
    const res = await srv.request('POST', `/api/invitations/${newToken()}/accept`, { headers: asOrganiser });
    assert.deepEqual(await res.json(), { trip_id: TRIP, already_member: true });
  });

  test('used / revoked / expired / invalid links are 410 with a human message', async () => {
    for (const code of ['used', 'revoked', 'expired', 'invalid']) {
      await serve(() => err(`invite_${code}`));
      const res = await srv.request('POST', `/api/invitations/${newToken()}/accept`, { headers: asOrganiser });
      assert.equal(res.status, 410, code);
      assert.deepEqual(await res.json(), { error: `invite_${code}`, message: INVITE_MESSAGES[code] });
      await srv.close();
      srv = undefined;
    }
  });

  test('a malformed link is 410 invite_invalid with no database call', async () => {
    const { calls } = await serve(() => ok([{ trip_id: TRIP, already_member: false }]));
    const res = await srv.request('POST', '/api/invitations/not-a-token/accept', { headers: asOrganiser });
    assert.equal(res.status, 410);
    assert.equal((await res.json()).error, 'invite_invalid');
    assert.equal(calls.length, 0);
  });

  test('cross-site accepts are blocked', async () => {
    const { calls } = await serve(() => ok([{ trip_id: TRIP, already_member: false }]));
    const res = await srv.request('POST', `/api/invitations/${newToken()}/accept`, { headers: { ...asOrganiser, origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });
});

describe('no service-role key anywhere in the invite path', () => {
  test('every route works while gateway.admin() throws', async () => {
    const { gateway } = await serve((name) => (name === 'invitation_preview' ? ok([{ state: 'invalid' }]) : ok([row()])));
    let adminCalls = 0;
    gateway.admin = () => {
      adminCalls += 1;
      throw new Error('no admin');
    };
    const t = newToken();
    await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: asOrganiser, body: { invitee_name: 'A' } });
    await srv.request('POST', `/api/trips/${TRIP}/invitations/${INV}/replace`, { headers: asOrganiser });
    await srv.request('POST', `/api/trips/${TRIP}/invitations/${INV}/revoke`, { headers: asOrganiser });
    await srv.request('GET', `/api/invitations/${t}`);
    await srv.request('POST', `/api/invitations/${t}/accept`, { headers: asOrganiser });
    assert.equal(adminCalls, 0);
  });
});
