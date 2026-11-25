// The invite flow end to end through HTTP: the real Express app, the real SQL functions and RLS in real Postgres.
// Everything except Supabase Auth and the PostgREST transport is real. admin() throws, so the flow provably
// works WITHOUT a service-role key. This is the strongest local check; the hosted two-account test is still required.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { startServer } from '../helpers.js';
import { actAs, addUser, admin, freshDb } from './pg.js';
import { pgliteGateway } from './gateway.js';

const sha = (t) => createHash('sha256').update(t).digest('hex');
const tokenOf = (link) => link.split('/join/')[1];

let db, gw, srv, org, trip, counter = 0;
const tokens = new Map();
const cookie = (name) => ({ cookie: `crew_at=${name}` });
const hit = (method, path, who, body) => srv.request(method, path, { headers: who ? cookie(who) : {}, body });
const json = async (res) => ({ status: res.status, body: await res.json() });

/** A brand-new signed-in person (registers a session token for them). */
async function person(label) {
  const name = `${label} ${(counter += 1)}`;
  const id = await addUser(db, name);
  const t = `tok-${counter}`;
  tokens.set(t, { id, email: `${counter}@example.test` });
  return { id, name, token: t };
}
const invite = async (name = 'Friend') => {
  const r = await json(await hit('POST', `/api/trips/${trip}/invitations`, 'org', { invitee_name: name }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { ...r.body, token: tokenOf(r.body.link) };
};
const dbq = { rows: (...args) => admin(db).rows(...args) }; // table-owner access, for arranging/inspecting test data only
const state = async (token) => json(await hit('GET', `/api/invitations/${token}`, null));

before(async () => {
  db = await freshDb();
  gw = pgliteGateway(db, tokens);
  // High invite rate limit here because this file legitimately creates many invites as one organiser;
  // the default (40/hour) has its own test below.
  srv = await startServer(gw, { publicUrl: 'http://localhost:3003', inviteRateLimit: 100_000 });
  org = await person('Chris Mathew');
  tokens.set('org', { id: org.id, email: 'org@example.test' });
  trip = (await actAs(db, org.id).rows(`insert into public.trips (organiser_id, name, destination, start_date, end_date, expected_size) values ($1, 'Goa gang', 'Goa', '2026-12-20', '2026-12-23', 4) returning id`, [org.id]))[0].id;
});

after(async () => {
  await srv.close();
  await db.close(); // an open PGlite instance keeps the test process alive
});

describe('1-2: organiser creates an invite and a real link comes back', () => {
  test('201, a real join URL, the plain token is shown once and is NOT stored (only its hash)', async () => {
    const r = await invite('Ann');
    assert.match(r.link, /^http:\/\/localhost:3003\/join\/[A-Za-z0-9_-]{32}$/);
    assert.equal(r.invitation.invitee_name, 'Ann');
    assert.equal(r.invitation.state, 'valid');
    assert.ok(!('token_hash' in r.invitation));
    const [row] = await dbq.rows('select token_hash from public.invitations where id = $1', [r.invitation.id]);
    assert.equal(row.token_hash, sha(r.token));
    assert.equal((await dbq.rows('select count(*)::int n from public.invitations where token_hash = $1', [r.token]))[0].n, 0);
  });

  test('only the organiser can: a stranger gets 404 and no row is created; no session gets 401', async () => {
    const stranger = await person('Stranger');
    const before = (await dbq.rows('select count(*)::int n from public.invitations'))[0].n;
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations`, stranger.token, { invitee_name: 'x' })).status, 404);
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations`, null, { invitee_name: 'x' })).status, 401);
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations`, 'org', { invitee_name: '   ' })).status, 400);
    assert.equal((await dbq.rows('select count(*)::int n from public.invitations'))[0].n, before);
  });
});

describe('3: the link opens for someone who is not logged in (separate browser / incognito)', () => {
  test('the public landing shows only the allowed facts', async () => {
    const { token } = await invite('Public');
    const r = await state(token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      state: 'valid',
      invitee_name: 'Public',
      organiser: 'Chris',
      trip: { name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23' },
      crew_in: 1,
      member: false,
    });
    const text = JSON.stringify(r.body);
    assert.ok(!/token|hash|email|budget|created_by|_id|"id"/i.test(text), `leaked: ${text}`);
  });

  test('a malformed link is "invalid" and a random well-formed one is too', async () => {
    assert.equal((await state('short')).body.state, 'invalid');
    assert.equal((await state('A'.repeat(32))).body.state, 'invalid');
  });
});

describe('4-5: a person signs up/logs in and joins the correct trip', () => {
  test('before joining they cannot see the trip; accepting needs a login; after accepting they are a member', async () => {
    const friend = await person('Friend');
    const { token } = await invite('Friend');
    assert.equal((await hit('GET', `/api/trips/${trip}`, friend.token)).status, 404, 'RLS hides the trip from non-members');
    assert.equal((await hit('POST', `/api/invitations/${token}/accept`, null)).status, 401);

    const joined = await json(await hit('POST', `/api/invitations/${token}/accept`, friend.token));
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.body, { trip_id: trip, already_member: false });

    const view = await json(await hit('GET', `/api/trips/${trip}`, friend.token));
    assert.equal(view.status, 200);
    assert.equal(view.body.is_organiser, false);
    assert.ok(view.body.members.some((m) => m.display_name === friend.name && m.role === 'member'));
    assert.ok(view.body.members.some((m) => m.role === 'organiser'));
    assert.equal(view.body.trip.name, 'Goa gang');
  });

  test('the person joined the CORRECT trip and only that one', async () => {
    const other = (await actAs(db, org.id).rows(`insert into public.trips (organiser_id, name) values ($1, 'Second trip') returning id`, [org.id]))[0].id;
    const friend = await person('Careful');
    const { token } = await invite('Careful');
    await hit('POST', `/api/invitations/${token}/accept`, friend.token);
    assert.equal((await hit('GET', `/api/trips/${trip}`, friend.token)).status, 200);
    assert.equal((await hit('GET', `/api/trips/${other}`, friend.token)).status, 404, 'not a member of the organiser\'s other trip');
  });
});

describe('6: one-time use and expiry are enforced', () => {
  test('a used link cannot be reused by anyone else, and the landing page says so', async () => {
    const first = await person('First'), second = await person('Second');
    const { token } = await invite('OneTime');
    assert.equal((await hit('POST', `/api/invitations/${token}/accept`, first.token)).status, 200);
    const reuse = await json(await hit('POST', `/api/invitations/${token}/accept`, second.token));
    assert.equal(reuse.status, 410);
    assert.equal(reuse.body.error, 'invite_used');
    assert.match(reuse.body.message, /already been used/);
    assert.equal((await dbq.rows('select count(*)::int n from public.trip_members where user_id = $1', [second.id]))[0].n, 0);
    const landing = await state(token);
    assert.equal(landing.body.state, 'used');
    assert.deepEqual(Object.keys(landing.body).sort(), ['message', 'state'], 'a dead link reveals nothing about the trip');
  });

  test('an expired link is refused, then a replacement works', async () => {
    const friend = await person('Late');
    const made = await invite('Slow');
    await dbq.rows(`update public.invitations set expires_at = now() - interval '1 second' where id = $1`, [made.invitation.id]);
    assert.equal((await state(made.token)).body.state, 'expired');
    const refused = await json(await hit('POST', `/api/invitations/${made.token}/accept`, friend.token));
    assert.equal(refused.status, 410);
    assert.equal(refused.body.error, 'invite_expired');
    assert.match(refused.body.message, /expired/);

    const replaced = await json(await hit('POST', `/api/trips/${trip}/invitations/${made.invitation.id}/replace`, 'org'));
    assert.equal(replaced.status, 201);
    assert.notEqual(tokenOf(replaced.body.link), made.token);
    assert.equal((await state(tokenOf(replaced.body.link))).body.state, 'valid');
    assert.equal((await hit('POST', `/api/invitations/${tokenOf(replaced.body.link)}/accept`, friend.token)).status, 200);
  });

  test('replacing kills the old link at once; cancelling makes a link "revoked"', async () => {
    const a = await invite('Replace');
    const r = await json(await hit('POST', `/api/trips/${trip}/invitations/${a.invitation.id}/replace`, 'org'));
    assert.equal((await state(a.token)).body.state, 'revoked');
    const stranger = await person('Old');
    assert.equal((await json(await hit('POST', `/api/invitations/${a.token}/accept`, stranger.token))).body.error, 'invite_revoked');
    const b = await invite('Cancel');
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations/${b.invitation.id}/revoke`, 'org')).status, 200);
    assert.equal((await state(b.token)).body.state, 'revoked');
    assert.equal(r.status, 201);
  });

  test('a joined invite cannot be replaced or cancelled (409)', async () => {
    const friend = await person('Joined');
    const made = await invite('Joined');
    await hit('POST', `/api/invitations/${made.token}/accept`, friend.token);
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations/${made.invitation.id}/replace`, 'org')).status, 409);
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations/${made.invitation.id}/revoke`, 'org')).status, 409);
  });

  test('a stranger cannot replace or cancel the organiser\'s invites (404)', async () => {
    const made = await invite('Mine');
    const stranger = await person('Meddler');
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations/${made.invitation.id}/replace`, stranger.token)).status, 404);
    assert.equal((await hit('POST', `/api/trips/${trip}/invitations/${made.invitation.id}/revoke`, stranger.token)).status, 404);
    assert.equal((await state(made.token)).body.state, 'valid');
  });
});

describe('7: existing members get "Open trip"', () => {
  test('the landing flags a signed-in member (with the trip id); non-members and anonymous do not get it', async () => {
    const member = await person('Member'), outsider = await person('Outsider');
    const first = await invite('Member');
    await hit('POST', `/api/invitations/${first.token}/accept`, member.token);
    const spare = await invite('Spare');

    const asMember = (await json(await hit('GET', `/api/invitations/${spare.token}`, member.token))).body;
    assert.equal(asMember.member, true);
    assert.equal(asMember.trip_id, trip);
    const asOutsider = (await json(await hit('GET', `/api/invitations/${spare.token}`, outsider.token))).body;
    assert.equal(asOutsider.member, false);
    assert.ok(!('trip_id' in asOutsider));
    assert.equal((await state(spare.token)).body.member, false);

    // opening the trip must not use the link up
    const again = await json(await hit('POST', `/api/invitations/${spare.token}/accept`, member.token));
    assert.deepEqual(again.body, { trip_id: trip, already_member: true });
    assert.equal((await state(spare.token)).body.state, 'valid');
    assert.equal((await json(await hit('POST', `/api/invitations/${spare.token}/accept`, org.token ?? 'org'))).body.already_member, true, 'the organiser too');
  });
});

describe('8: invalid, expired, used and interrupted links all say something clear', () => {
  test('every dead-end carries a human message (and never a stack, SQL or internal id)', async () => {
    const friend = await person('Msg');
    const used = await invite('U'); await hit('POST', `/api/invitations/${used.token}/accept`, friend.token);
    const gone = await invite('R'); await hit('POST', `/api/trips/${trip}/invitations/${gone.invitation.id}/revoke`, 'org');
    const old = await invite('E'); await dbq.rows(`update public.invitations set expires_at = now() - interval '1 day' where id = $1`, [old.invitation.id]);
    const cases = [[used.token, 'used'], [gone.token, 'revoked'], [old.token, 'expired'], ['A'.repeat(32), 'invalid'], ['nope', 'invalid']];
    const stranger = await person('Reader');
    for (const [t, expected] of cases) {
      const landing = (await state(t)).body;
      assert.equal(landing.state, expected);
      assert.ok(landing.message.length > 20, `${expected}: ${landing.message}`);
      const accept = await json(await hit('POST', `/api/invitations/${t}/accept`, stranger.token));
      assert.equal(accept.status, 410, `${expected} accept`);
      assert.equal(accept.body.error, expected === 'invalid' ? 'invite_invalid' : `invite_${expected}`);
      assert.ok(!/select |from public|pgrst|error:|at \w+ \(/i.test(JSON.stringify(accept.body)), JSON.stringify(accept.body));
    }
  });
});

describe('listing, cap, and the service-role key', () => {
  test('members can list invitation names and states, never token hashes or emails', async () => {
    const friend = await person('Lister');
    await hit('POST', `/api/invitations/${(await invite('ListMe')).token}/accept`, friend.token);
    const r = await json(await hit('GET', `/api/trips/${trip}/invitations`, friend.token));
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0);
    assert.ok(r.body.some((i) => i.invitee_name === 'ListMe' && i.state === 'used'));
    assert.ok(!/token_hash|email"/.test(JSON.stringify(r.body)));
    assert.ok(!r.body.some((i) => i.status === 'revoked'), 'revoked invites are hidden');
    assert.equal((await hit('GET', `/api/trips/${trip}/invitations`, (await person('Nope')).token)).status, 200, 'a stranger gets an empty list via RLS, not data');
    assert.deepEqual((await json(await hit('GET', `/api/trips/${trip}/invitations`, (await person('Nope2')).token))).body, []);
  });

  test('a trip is capped at 30 live invites, reported clearly', async () => {
    const capTrip = (await actAs(db, org.id).rows(`insert into public.trips (organiser_id, name) values ($1, 'Cap') returning id`, [org.id]))[0].id;
    let last;
    for (let i = 0; i < 31; i += 1) last = await json(await hit('POST', `/api/trips/${capTrip}/invitations`, 'org', { invitee_name: `F${i}` }));
    assert.equal(last.status, 400);
    assert.equal(last.body.error, 'too_many_invites');
  });

  test('the default rate limit (40 invites per organiser per hour) is enforced, with a clear message', async () => {
    const limited = await startServer(gw); // default limit
    try {
      const tripA = (await actAs(db, org.id).rows(`insert into public.trips (organiser_id, name) values ($1, 'RL-A') returning id`, [org.id]))[0].id;
      const tripB = (await actAs(db, org.id).rows(`insert into public.trips (organiser_id, name) values ($1, 'RL-B') returning id`, [org.id]))[0].id;
      const statuses = [];
      for (let i = 0; i < 41; i += 1) {
        const res = await limited.request('POST', `/api/trips/${i % 2 ? tripB : tripA}/invitations`, { headers: cookie('org'), body: { invitee_name: `Spam ${i}` } });
        statuses.push(res.status);
        if (res.status === 429) assert.match((await res.json()).message, /Too many invites/);
      }
      assert.equal(statuses.slice(0, 40).every((s) => s === 201), true);
      assert.equal(statuses[40], 429);
    } finally {
      await limited.close();
    }
  });

  test('THE WHOLE FLOW NEVER TOUCHED the service-role client', () => {
    assert.equal(gw.calls.filter((c) => c.kind === 'admin').length, 0);
    assert.ok(gw.calls.filter((c) => c.kind === 'rpc').length > 20, 'the invite functions were really called');
    assert.ok(gw.calls.some((c) => c.fn === 'invitation_preview' && c.as === 'anon'), 'the landing used the anonymous role');
    assert.ok(gw.calls.some((c) => c.fn === 'create_invitation' && c.as === 'user'), 'organiser actions used the user\'s own session');
  });
});

describe('health and the missing-migration case', () => {
  test('/healthz reports invites:true when the functions are deployed', async () => {
    assert.deepEqual(await json(await hit('GET', '/healthz', null)), { status: 200, body: { ok: true, invites: true } });
  });

  test('on a database WITHOUT the migration: /healthz says invites:false and Invite explains why (503), not a crash', async () => {
    const old = await freshDb({ upTo: '20261125044305_grant_table_privileges.sql' });
    const owner = await addUser(old, 'Old Org');
    const t2 = new Map([['o', { id: owner, email: 'o@example.test' }]]);
    const s = await startServer(pgliteGateway(old, t2));
    try {
      const health = await (await s.request('GET', '/healthz')).json();
      assert.deepEqual(health, { ok: true, invites: false });
      const tripId = (await actAs(old, owner).rows(`insert into public.trips (organiser_id, name) values ($1, 'T') returning id`, [owner]))[0].id;
      const res = await s.request('POST', `/api/trips/${tripId}/invitations`, { headers: { cookie: 'crew_at=o' }, body: { invitee_name: 'x' } });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'invites_unavailable');
      assert.match(body.message, /database update/);
      assert.equal((await (await s.request('GET', `/api/invitations/${'A'.repeat(32)}`)).status), 503);
    } finally {
      await s.close();
      await old.close();
    }
  });
});
