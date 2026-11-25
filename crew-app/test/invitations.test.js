import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, describe, test } from 'node:test';
import { INVITE_MESSAGES, TOKEN_RE, hashToken, inviteState, newToken } from '../server/lib/invites.js';
import { makeDb } from './fakedb.js';
import { AUTH_COOKIE, OTHER_COOKIE, USER, USER2, fakeGateway, goodAuth, startServer } from './helpers.js';

const TRIP = '22222222-2222-4222-8222-222222222222';
const OTHER_TRIP = '44444444-4444-4444-8444-444444444444';
const day = 864e5;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

function setup({ invitations = [], noAdmin = false } = {}) {
  const db = makeDb(
    {
      trips: [
        { id: TRIP, name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', organiser_id: USER.id },
        { id: OTHER_TRIP, name: 'Someone elses', organiser_id: '99999999-9999-4999-8999-999999999999' },
      ],
      profiles: [
        { id: USER.id, display_name: 'Chris Mathew' },
        { id: USER2.id, display_name: 'Saqeeb Chand' },
      ],
      trip_members: [{ trip_id: TRIP, user_id: USER.id, role: 'organiser' }],
      invitations,
    },
    { unique: { trip_members: ['trip_id', 'user_id'] } },
  );
  return { db, gateway: fakeGateway({ auth: goodAuth, db, admin: noAdmin ? null : db }) };
}

/** An invitation row whose plain token we know, so tests can hit the public endpoints. */
function seeded(overrides = {}) {
  const token = newToken();
  const row = {
    id: `55555555-5555-4555-8555-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`,
    trip_id: TRIP,
    invitee_name: 'Saqeeb',
    token_hash: hashToken(token),
    status: 'pending',
    email_status: 'not_sent',
    expires_at: iso(7 * day),
    created_at: iso(0),
    created_by: USER.id,
    ...overrides,
  };
  return { token, row };
}

let srv;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

describe('invite token helpers', () => {
  test('tokens are 32 URL-safe chars, unique, and hashing is stable', () => {
    const a = newToken();
    assert.match(a, TOKEN_RE);
    assert.notEqual(a, newToken());
    assert.equal(hashToken(a), createHash('sha256').update(a).digest('hex'));
    assert.notEqual(hashToken(a), a);
  });

  test('inviteState: valid, used, revoked, expired, invalid', () => {
    const future = iso(day);
    assert.equal(inviteState({ status: 'pending', expires_at: future }), 'valid');
    assert.equal(inviteState({ status: 'joined', expires_at: future }), 'used');
    assert.equal(inviteState({ status: 'revoked', expires_at: future }), 'revoked');
    assert.equal(inviteState({ status: 'pending', expires_at: iso(-1000) }), 'expired');
    assert.equal(inviteState(null), 'invalid');
    for (const k of ['used', 'revoked', 'expired', 'invalid']) assert.ok(INVITE_MESSAGES[k]);
  });
});

describe('organiser: create, list, replace, revoke', () => {
  test('creates a one-time link; only the HASH is stored; the response never has token_hash', async () => {
    const { db, gateway } = setup();
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers: { cookie: AUTH_COOKIE }, body: { invitee_name: ' Saqeeb ' } });
    assert.equal(res.status, 201);
    const body = await res.json();
    const token = body.link.split('/join/')[1];
    assert.match(token, TOKEN_RE);
    assert.equal(body.invitation.invitee_name, 'Saqeeb');
    assert.equal(body.invitation.state, 'valid');
    assert.ok(!('token_hash' in body.invitation));
    const stored = db.tables.invitations;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].token_hash, hashToken(token));
    assert.ok(!JSON.stringify(stored).includes(token), 'plain token is never stored');
    assert.equal(stored[0].created_by, USER.id);
  });

  test('non-organiser gets 404 and nothing is created', async () => {
    const { db, gateway } = setup();
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/trips/${OTHER_TRIP}/invitations`, { headers: { cookie: AUTH_COOKIE }, body: { invitee_name: 'X' } });
    assert.equal(res.status, 404);
    assert.equal(db.tables.invitations.length, 0);
  });

  test('validates name, UUID and auth; reports 503 when the service key is missing', async () => {
    const { gateway } = setup();
    srv = await startServer(gateway);
    const headers = { cookie: AUTH_COOKIE };
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers, body: { invitee_name: '   ' } })).status, 400);
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers, body: { invitee_name: 'A', email: 'x@y.z' } })).status, 400);
    assert.equal((await srv.request('POST', `/api/trips/nope/invitations`, { headers, body: { invitee_name: 'A' } })).status, 404);
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations`, { body: { invitee_name: 'A' } })).status, 401);
    await srv.close();

    const noKey = setup({ noAdmin: true });
    srv = await startServer(noKey.gateway);
    const res = await srv.request('POST', `/api/trips/${TRIP}/invitations`, { headers, body: { invitee_name: 'A' } });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'invites_unavailable');
  });

  test('list hides revoked invites, adds a derived state, and never returns token_hash or email', async () => {
    const pending = seeded({ email: 'private@x.com' });
    const revoked = seeded({ status: 'revoked', invitee_name: 'Gone' });
    const expired = seeded({ expires_at: iso(-day), invitee_name: 'Late' });
    const { gateway } = setup({ invitations: [pending.row, revoked.row, expired.row] });
    srv = await startServer(gateway);
    const res = await srv.request('GET', `/api/trips/${TRIP}/invitations`, { headers: { cookie: AUTH_COOKIE } });
    const list = await res.json();
    assert.deepEqual(list.map((i) => i.invitee_name).sort(), ['Late', 'Saqeeb']);
    assert.deepEqual(list.map((i) => i.state).sort(), ['expired', 'valid']);
    const text = JSON.stringify(list);
    assert.ok(!text.includes('token_hash') && !text.includes('private@x.com'));
  });

  test('replace: the old link dies immediately, a new one works', async () => {
    const old = seeded();
    const { db, gateway } = setup({ invitations: [old.row] });
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/trips/${TRIP}/invitations/${old.row.id}/replace`, { headers: { cookie: AUTH_COOKIE } });
    assert.equal(res.status, 201);
    const { link, invitation } = await res.json();
    const newTok = link.split('/join/')[1];
    assert.notEqual(newTok, old.token);
    assert.equal(invitation.invitee_name, 'Saqeeb');

    const oldLookup = await (await srv.request('GET', `/api/invitations/${old.token}`)).json();
    assert.equal(oldLookup.state, 'revoked');
    const newLookup = await (await srv.request('GET', `/api/invitations/${newTok}`)).json();
    assert.equal(newLookup.state, 'valid');
    assert.equal(db.tables.invitations.find((i) => i.id === old.row.id).status, 'revoked');
  });

  test('replace/revoke on an already-joined invite is a 409; revoke cancels a pending one', async () => {
    const joined = seeded({ status: 'joined', used_by: USER2.id });
    const pending = seeded({ invitee_name: 'Manas' });
    const { db, gateway } = setup({ invitations: [joined.row, pending.row] });
    srv = await startServer(gateway);
    const headers = { cookie: AUTH_COOKIE };
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations/${joined.row.id}/replace`, { headers })).status, 409);
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations/${joined.row.id}/revoke`, { headers })).status, 409);
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations/${pending.row.id}/revoke`, { headers })).status, 200);
    assert.equal(db.tables.invitations.find((i) => i.id === pending.row.id).status, 'revoked');
    assert.equal((await srv.request('POST', `/api/trips/${TRIP}/invitations/not-a-uuid/revoke`, { headers })).status, 404);
  });

  test('another trip\'s invite id cannot be replaced through this trip', async () => {
    const foreign = seeded({ trip_id: OTHER_TRIP });
    const { gateway } = setup({ invitations: [foreign.row] });
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/trips/${TRIP}/invitations/${foreign.row.id}/replace`, { headers: { cookie: AUTH_COOKIE } });
    assert.equal(res.status, 404);
  });
});

describe('public landing (no login)', () => {
  test('valid link shows only organiser, trip name, destination, dates and crew size', async () => {
    const inv = seeded({ email: 'secret@x.com' });
    const { gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    const res = await srv.request('GET', `/api/invitations/${inv.token}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      state: 'valid',
      invitee_name: 'Saqeeb',
      organiser: 'Chris',
      trip: { name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23' },
      crew_in: 1,
      member: false,
    });
    assert.ok(!JSON.stringify(body).includes('secret@x.com'));
  });

  test('signed-in visitors: members get an "Open trip" state; non-members and bad cookies do not', async () => {
    const inv = seeded();
    const { gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    const lookup = async (cookie) => (await srv.request('GET', `/api/invitations/${inv.token}`, { headers: cookie ? { cookie } : {} })).json();

    const organiser = await lookup(AUTH_COOKIE); // USER is the organiser, so already a member
    assert.equal(organiser.member, true);
    assert.equal(organiser.trip_id, TRIP);

    const stranger = await lookup(OTHER_COOKIE); // USER2 has not joined
    assert.equal(stranger.member, false);
    assert.ok(!('trip_id' in stranger), 'no trip id is revealed to non-members');

    const anonymous = await lookup();
    assert.equal(anonymous.member, false);
    assert.ok(!('trip_id' in anonymous));

    const forged = await lookup('crew_at=not-a-real-token');
    assert.equal(forged.member, false, 'an invalid session never counts as a member');
    assert.equal(forged.state, 'valid');
  });

  test('a member-flagged lookup does not consume the link or add anyone', async () => {
    const inv = seeded();
    const { db, gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    await srv.request('GET', `/api/invitations/${inv.token}`, { headers: { cookie: AUTH_COOKIE } });
    assert.equal(db.tables.invitations[0].status, 'pending');
    assert.equal(db.tables.trip_members.length, 1);
  });

  test('used, revoked, expired and malformed links are clear dead-ends that reveal nothing', async () => {
    const cases = {
      used: seeded({ status: 'joined' }),
      revoked: seeded({ status: 'revoked' }),
      expired: seeded({ expires_at: iso(-1000) }),
    };
    const { gateway } = setup({ invitations: Object.values(cases).map((c) => c.row) });
    srv = await startServer(gateway);
    for (const [state, c] of Object.entries(cases)) {
      const body = await (await srv.request('GET', `/api/invitations/${c.token}`)).json();
      assert.deepEqual(body, { state, message: INVITE_MESSAGES[state] });
    }
    for (const bad of ['short', 'x'.repeat(32), `${newToken()}extra`]) {
      const body = await (await srv.request('GET', `/api/invitations/${bad}`)).json();
      assert.equal(body.state, 'invalid');
    }
  });

  test('lookups are rate limited', async () => {
    const { gateway } = setup();
    srv = await startServer(gateway);
    let last;
    for (let i = 0; i < 61; i += 1) last = await srv.request('GET', `/api/invitations/${newToken()}`);
    assert.equal(last.status, 429);
  });
});

describe('accepting an invite', () => {
  test('requires a session', async () => {
    const inv = seeded();
    const { gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    assert.equal((await srv.request('POST', `/api/invitations/${inv.token}/accept`)).status, 401);
  });

  test('joins once: member created, link consumed, second use by someone else is refused', async () => {
    const inv = seeded();
    const { db, gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/invitations/${inv.token}/accept`, { headers: { cookie: OTHER_COOKIE } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { trip_id: TRIP, already_member: false });
    assert.ok(db.tables.trip_members.some((m) => m.trip_id === TRIP && m.user_id === USER2.id && m.role === 'member'));
    const row = db.tables.invitations[0];
    assert.equal(row.status, 'joined');
    assert.equal(row.used_by, USER2.id);

    // The same person opening the link again is already a member: they get "Open trip", not an error.
    const again = await srv.request('POST', `/api/invitations/${inv.token}/accept`, { headers: { cookie: OTHER_COOKIE } });
    assert.deepEqual(await again.json(), { trip_id: TRIP, already_member: true }, 'same person re-opening gets Open trip');
  });

  test('a used link is refused for a different, non-member user (410)', async () => {
    const inv = seeded({ status: 'joined', used_by: '99999999-9999-4999-8999-999999999999' });
    const { db, gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/invitations/${inv.token}/accept`, { headers: { cookie: OTHER_COOKIE } });
    assert.equal(res.status, 410);
    assert.equal((await res.json()).error, 'invite_used');
    assert.equal(db.tables.trip_members.length, 1, 'no member added');
  });

  test('existing members get "Open trip" and the invite is not consumed', async () => {
    const inv = seeded();
    const { db, gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/invitations/${inv.token}/accept`, { headers: { cookie: AUTH_COOKIE } }); // organiser
    assert.deepEqual(await res.json(), { trip_id: TRIP, already_member: true });
    assert.equal(db.tables.invitations[0].status, 'pending');
    assert.equal(db.tables.trip_members.length, 1);
  });

  test('expired, revoked and unknown links are 410 with a helpful message and add nobody', async () => {
    const expired = seeded({ expires_at: iso(-1000) });
    const revoked = seeded({ status: 'revoked' });
    const { db, gateway } = setup({ invitations: [expired.row, revoked.row] });
    srv = await startServer(gateway);
    for (const [tok, code] of [[expired.token, 'invite_expired'], [revoked.token, 'invite_revoked'], [newToken(), 'invite_invalid'], ['bad', 'invite_invalid']]) {
      const res = await srv.request('POST', `/api/invitations/${tok}/accept`, { headers: { cookie: OTHER_COOKIE } });
      assert.equal(res.status, 410, tok);
      assert.equal((await res.json()).error, code);
    }
    assert.equal(db.tables.trip_members.length, 1);
  });

  test('two people racing for one link: exactly one wins', async () => {
    const inv = seeded();
    const { db, gateway } = setup({ invitations: [inv.row] });
    srv = await startServer(gateway);
    const third = '66666666-6666-4666-8666-666666666666';
    // reuse the fake auth with a third identity
    const gw = fakeGateway({
      auth: { getUser: async (t) => ({ data: { user: { good: USER, other: USER2, third: { id: third, email: 't@x.com' } }[t.replace('-token', '')] ?? null }, error: null }) },
      db,
      admin: db,
    });
    await srv.close();
    srv = await startServer(gw);
    const results = await Promise.all(
      ['other-token', 'third-token'].map((t) => srv.request('POST', `/api/invitations/${inv.token}/accept`, { headers: { cookie: `crew_at=${t}` } })),
    );
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 410]);
    assert.equal(db.tables.trip_members.filter((m) => m.role === 'member').length, 1);
  });

  test('if adding the member fails, the link is given back so the person can retry', async () => {
    const inv = seeded();
    const { db, gateway } = setup({ invitations: [inv.row] });
    // Force the member insert to fail with a database error.
    const realFrom = db.from;
    db.from = (table) => {
      const b = realFrom(table);
      if (table === 'trip_members') {
        b.insert = () => ({ then: (resolve) => resolve({ data: null, error: { code: '23503', message: 'fk' } }) });
      }
      return b;
    };
    srv = await startServer(gateway);
    const res = await srv.request('POST', `/api/invitations/${inv.token}/accept`, { headers: { cookie: OTHER_COOKIE } });
    assert.equal(res.status, 400);
    assert.equal(db.tables.invitations[0].status, 'pending');
    assert.equal(db.tables.invitations[0].used_by, null);
  });
});
