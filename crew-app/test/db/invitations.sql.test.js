// The invite functions, run for real: real Postgres (PGlite), the project's real migrations, real roles and RLS.
// These prove the SQL's behaviour. They are not the hosted project: the live two-account test still has to pass.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { actAs, addUser, admin, freshDb } from './pg.js';

const sha = (t) => createHash('sha256').update(t).digest('hex');
const token = () => randomBytes(24).toString('base64url');

let db, org, ann, bob, eve, trip, otherTrip;
const A = (id) => actAs(db, id);
// Every test that needs "a person who has not joined yet" makes a brand-new user: reusing one would make the
// function (correctly) answer "already a member" and hide what the test means to check.
let counter = 0;
const fresh = (label) => addUser(db, `${label} ${(counter += 1)}`);

before(async () => {
  db = await freshDb();
  org = await addUser(db, 'Chris Mathew');
  ann = await addUser(db, 'Ann Friend');
  bob = await addUser(db, 'Bob Friend');
  eve = await addUser(db, 'Eve Stranger');
  const mk = async (user, name, dest) =>
    (await A(user).rows(`insert into public.trips (organiser_id, name, destination, start_date, end_date, expected_size) values ($1, $2, $3, '2026-12-20', '2026-12-23', 4) returning id`, [user, name, dest]))[0].id;
  trip = await mk(org, 'Goa gang', 'Goa');
  otherTrip = await mk(eve, 'Eve trip', 'Hampi');
});
after(() => db.close()); // an open PGlite instance keeps the test process alive

const adm = () => admin(db);
const create = async (user, tripId, name) => {
  const t = token();
  const r = await A(user).try('select * from public.create_invitation($1, $2, $3)', [tripId, name, sha(t)]);
  return { t, hash: sha(t), ...r, row: r.rows?.[0] };
};
const preview = async (user, t) =>
  (await A(user).rows(`select state, invitee_name, organiser, trip_name, destination, start_date::text start_date, end_date::text end_date, crew_in, member, trip_id from public.invitation_preview($1)`, [sha(t)]))[0];
const accept = (user, t) => A(user).try('select * from public.accept_invitation($1)', [sha(t)]);
const inviteRow = async (hash) => (await adm().rows('select status, used_by, used_at is not null as has_used_at from public.invitations where token_hash = $1', [hash]))[0];
const memberCount = async (tripId = trip) => (await adm().rows('select count(*)::int n from public.trip_members where trip_id = $1', [tripId]))[0].n;

describe('create_invitation', () => {
  test('the organiser gets a pending, one-time invite with a 7-day expiry; only the hash is stored', async () => {
    const r = await create(org, trip, '  Ann  ');
    assert.equal(r.ok, true, r.message);
    assert.equal(r.row.invitee_name, 'Ann', 'name is trimmed');
    assert.equal(r.row.status, 'pending');
    assert.equal(r.row.email_status, 'not_sent');
    assert.ok(!('token_hash' in r.row), 'the hash is never returned');
    const [stored] = await adm().rows(`select token_hash, created_by, (expires_at > now() + interval '6 days 23 hours' and expires_at < now() + interval '7 days 1 hour') as seven_days from public.invitations where id = $1`, [r.row.id]);
    assert.equal(stored.token_hash, r.hash);
    assert.notEqual(stored.token_hash, r.t, 'the plain token is not stored');
    assert.equal(stored.created_by, org);
    assert.equal(stored.seven_days, true);
  });

  test('a member or a stranger cannot create invites for someone else\'s trip (same answer as "not found")', async () => {
    const before = (await adm().rows('select count(*)::int n from public.invitations'))[0].n;
    for (const user of [eve, ann]) {
      const r = await create(user, trip, 'Sneaky');
      assert.equal(r.ok, false);
      assert.equal(r.message, 'not_found');
    }
    assert.equal((await adm().rows('select count(*)::int n from public.invitations'))[0].n, before);
  });

  test('anonymous callers cannot execute it at all', async () => {
    const r = await A(null).try('select * from public.create_invitation($1, $2, $3)', [trip, 'x', sha('x')]);
    assert.equal(r.ok, false);
    assert.match(r.message, /permission denied for function create_invitation/);
  });

  test('validates the name and the token hash', async () => {
    assert.equal((await create(org, trip, '   ')).message, 'invalid_name');
    assert.equal((await create(org, trip, 'x'.repeat(61))).message, 'invalid_name');
    const bad = await A(org).try('select * from public.create_invitation($1, $2, $3)', [trip, 'Ok', 'not-a-sha256']);
    assert.equal(bad.message, 'invalid_token');
    assert.equal((await A(org).try('select * from public.create_invitation($1, $2, $3)', [trip, 'Ok', 'A'.repeat(64)])).message, 'invalid_token', 'uppercase is not a valid hash');
  });

  test('a link can only exist once (duplicate hash rejected)', async () => {
    const t = token();
    assert.equal((await A(org).try('select * from public.create_invitation($1,$2,$3)', [trip, 'One', sha(t)])).ok, true);
    const dup = await A(org).try('select * from public.create_invitation($1,$2,$3)', [trip, 'Two', sha(t)]);
    assert.equal(dup.ok, false);
    assert.equal(dup.code, '23505');
  });

  test('a trip is capped at 30 live invites; revoked ones do not count', async () => {
    const capTrip = (await A(org).rows(`insert into public.trips (organiser_id, name) values ($1, 'Cap trip') returning id`, [org]))[0].id;
    const made = [];
    for (let i = 0; i < 30; i += 1) made.push(await create(org, capTrip, `Friend ${i}`));
    assert.ok(made.every((m) => m.ok));
    assert.equal((await create(org, capTrip, 'One too many')).message, 'too_many_invites');
    await A(org).rows('select public.revoke_invitation($1, $2)', [capTrip, made[0].row.id]);
    assert.equal((await create(org, capTrip, 'Now it fits')).ok, true);
  });
});

describe('invitation_preview (public landing)', () => {
  test('a live link shows ONLY the allowed facts, without logging in', async () => {
    const { t } = await create(org, trip, 'Ann');
    const p = await preview(null, t);
    assert.deepEqual(p, {
      state: 'valid',
      invitee_name: 'Ann',
      organiser: 'Chris',
      trip_name: 'Goa gang',
      destination: 'Goa',
      start_date: '2026-12-20',
      end_date: '2026-12-23',
      crew_in: 1,
      member: false,
      trip_id: null,
    });
  });

  test('dead and unknown links reveal nothing but their state', async () => {
    const used = await create(org, trip, 'Used');
    await accept(bob, used.t);
    const revoked = await create(org, trip, 'Revoked');
    await A(org).rows('select public.revoke_invitation($1,$2)', [trip, revoked.row.id]);
    const expired = await create(org, trip, 'Expired');
    await adm().rows(`update public.invitations set expires_at = now() - interval '1 second' where token_hash = $1`, [expired.hash]);

    for (const [t, state] of [[used.t, 'used'], [revoked.t, 'revoked'], [expired.t, 'expired'], [token(), 'invalid'], ['not-a-token', 'invalid']]) {
      const p = await preview(null, t);
      assert.equal(p.state, state);
      assert.deepEqual(Object.entries(p).filter(([k, v]) => k !== 'state' && v !== null && v !== false), [], `${state} leaks nothing`);
    }
    const nul = await A(null).rows('select state from public.invitation_preview($1)', [null]);
    assert.equal(nul[0].state, 'invalid');
  });

  test('a signed-in MEMBER sees member:true and the trip id; a non-member and anonymous do not', async () => {
    const { t } = await create(org, trip, 'Look');
    const stranger = await fresh('Stranger');
    const asOrg = await preview(org, t);
    assert.equal(asOrg.member, true);
    assert.equal(asOrg.trip_id, trip);
    assert.equal((await preview(stranger, t)).member, false);
    assert.equal((await preview(stranger, t)).trip_id, null);
    assert.equal((await preview(null, t)).trip_id, null);
  });

  test('previewing never consumes the link or changes anything', async () => {
    const { t, hash } = await create(org, trip, 'Peek');
    await preview(org, t);
    await preview(null, t);
    assert.equal((await inviteRow(hash)).status, 'pending');
  });

  test('crew size counts real members', async () => {
    const solo = (await A(eve).rows(`insert into public.trips (organiser_id, name) values ($1, 'Solo') returning id`, [eve]))[0].id;
    const { t } = await create(eve, solo, 'Pal');
    assert.equal((await preview(null, t)).crew_in, 1);
    await accept(ann, t);
    const t2 = (await create(eve, solo, 'Pal2')).t;
    assert.equal((await preview(null, t2)).crew_in, 2);
  });

  test('expiry is enforced by time, not by a stored flag', async () => {
    const { t, hash } = await create(org, trip, 'Clock');
    assert.equal((await preview(null, t)).state, 'valid');
    await adm().rows(`update public.invitations set expires_at = now() - interval '1 second' where token_hash = $1`, [hash]);
    assert.equal((await preview(null, t)).state, 'expired');
    assert.equal((await inviteRow(hash)).status, 'pending', 'stored status is untouched; state is derived');
  });
});

describe('accept_invitation', () => {
  test('requires a login', async () => {
    const { t } = await create(org, trip, 'Anon');
    const r = await accept(null, t);
    assert.equal(r.ok, false);
    assert.match(r.message, /permission denied for function accept_invitation/);
  });

  test('a valid link makes the person a member, consumes the link once, and records who used it', async () => {
    const person = await fresh('Joiner');
    const { t, hash } = await create(org, trip, 'Ann');
    const before = await memberCount();
    const r = await accept(person, t);
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(r.rows[0], { trip_id: trip, already_member: false });
    assert.equal(await memberCount(), before + 1);
    const [m] = await adm().rows(`select role from public.trip_members where trip_id = $1 and user_id = $2`, [trip, person]);
    assert.equal(m.role, 'member');
    const inv = await inviteRow(hash);
    assert.deepEqual(inv, { status: 'joined', used_by: person, has_used_at: true });
  });

  test('ONE-TIME: a second person cannot reuse a used link, and nothing changes', async () => {
    const first = await fresh('First');
    const second = await fresh('Second');
    const { t, hash } = await create(org, trip, 'OnlyOnce');
    assert.equal((await accept(first, t)).rows[0].already_member, false, 'the first person genuinely joins');
    const before = await memberCount();
    const r = await accept(second, t);
    assert.equal(r.ok, false);
    assert.equal(r.message, 'invite_used');
    assert.equal(await memberCount(), before);
    assert.equal((await inviteRow(hash)).used_by, first, 'still attributed to the first person');
    assert.equal((await adm().rows('select count(*)::int n from public.trip_members where user_id = $1 and trip_id = $2', [second, trip]))[0].n, 0);
  });

  test('a person who is already a member gets "open trip" and the link is NOT consumed', async () => {
    const member = await fresh('Member');
    await accept(member, (await create(org, trip, 'JoinFirst')).t);
    const { t, hash } = await create(org, trip, 'AlreadyIn');
    const asOrg = await accept(org, t);
    assert.deepEqual(asOrg.rows[0], { trip_id: trip, already_member: true });
    assert.equal((await inviteRow(hash)).status, 'pending');
    const again = await accept(member, t);
    assert.deepEqual(again.rows[0], { trip_id: trip, already_member: true });
    assert.equal((await inviteRow(hash)).status, 'pending', 'opening the trip never consumes a link');
  });

  test('expired, revoked, unknown and malformed links are refused with clear codes', async () => {
    const expired = await create(org, trip, 'Late');
    await adm().rows(`update public.invitations set expires_at = now() - interval '1 second' where token_hash = $1`, [expired.hash]);
    const revoked = await create(org, trip, 'Cancelled');
    await A(org).rows('select public.revoke_invitation($1,$2)', [trip, revoked.row.id]);
    const stranger = await fresh('Stranger');
    const before = await memberCount();
    assert.equal((await accept(stranger, expired.t)).message, 'invite_expired');
    assert.equal((await accept(stranger, revoked.t)).message, 'invite_revoked');
    assert.equal((await accept(stranger, token())).message, 'invite_invalid');
    assert.equal((await A(stranger).try('select * from public.accept_invitation($1)', ['nope'])).message, 'invite_invalid');
    assert.equal((await A(stranger).try('select * from public.accept_invitation($1)', [null])).message, 'invite_invalid');
    assert.equal(await memberCount(), before, 'nobody joined');
  });

  test('a link that expires after being created cannot be used even though its stored status is still pending', async () => {
    const { t, hash } = await create(org, trip, 'Tick');
    await adm().rows(`update public.invitations set expires_at = now() - interval '1 millisecond' where token_hash = $1`, [hash]);
    assert.equal((await accept(await fresh('Late'), t)).message, 'invite_expired');
    assert.equal((await inviteRow(hash)).status, 'pending', 'an expired link is refused without being altered');
  });

  test('ATOMIC: if adding the member fails, the link is NOT consumed (no half-joined state)', async () => {
    const ghost = await addUser(db, 'Ghost');
    await adm().rows('delete from public.profiles where id = $1', [ghost]); // makes the membership insert violate its FK
    const { t, hash } = await create(org, trip, 'Atomic');
    const r = await accept(ghost, t);
    assert.equal(r.ok, false);
    assert.equal(r.code, '23503');
    assert.deepEqual(await inviteRow(hash), { status: 'pending', used_by: null, has_used_at: false });
    assert.equal((await adm().rows('select count(*)::int n from public.trip_members where user_id = $1', [ghost]))[0].n, 0);
    assert.equal((await accept(await fresh('RealPerson'), t)).ok, true, 'a real person can still use the link afterwards');
  });

  test('after joining, RLS gives the new member the trip, and only the trip', async () => {
    const t = (await create(org, trip, 'RLS')).t;
    const newcomer = await addUser(db, 'New Comer');
    assert.equal((await A(newcomer).rows('select id from public.trips where id = $1', [trip])).length, 0, 'invisible before joining');
    await accept(newcomer, t);
    const seen = await A(newcomer).rows('select id, name from public.trips order by name');
    assert.deepEqual(seen.map((r) => r.name), ['Goa gang']);
    assert.equal((await A(newcomer).rows('select id from public.trips where id = $1', [otherTrip])).length, 0, 'still cannot see unrelated trips');
    const members = await A(newcomer).rows('select count(*)::int n from public.trip_members where trip_id = $1', [trip]);
    assert.ok(members[0].n >= 2);
  });
});

describe('budget privacy with two real members after an invite join', () => {
  let t2, joiner;
  before(async () => {
    t2 = (await A(org).rows(`insert into public.trips (organiser_id, name, expected_size) values ($1, 'Budget trip', 4) returning id`, [org]))[0].id;
    joiner = await addUser(db, 'Budget Joiner');
    const { t } = await create(org, t2, 'Joiner');
    assert.equal((await accept(joiner, t)).ok, true);
  });
  const avg = async (user) => (await A(user).rows('select average_minor::int a, submitted, expected from public.crew_budget($1)', [t2]))[0];
  const put = (user, amount) => A(user).rows('insert into public.member_budgets (trip_id, user_id, amount_minor) values ($1,$2,$3)', [t2, user, amount]);

  test('only the organiser has shared: the joiner must NOT learn that number', async () => {
    await put(org, 800000);
    assert.deepEqual(await avg(joiner), { a: null, submitted: 1, expected: 4 });
    assert.deepEqual(await avg(org), { a: 800000, submitted: 1, expected: 4 }, 'the owner sees their own');
  });

  test('both shared: both see the average (6,500 rupees) and never each other\'s figure', async () => {
    await put(joiner, 500000);
    assert.deepEqual(await avg(joiner), { a: 650000, submitted: 2, expected: 4 });
    assert.deepEqual(await avg(org), { a: 650000, submitted: 2, expected: 4 });
    assert.deepEqual(await A(joiner).rows('select amount_minor::int a from public.member_budgets where trip_id = $1', [t2]), [{ a: 500000 }]);
    assert.deepEqual(await A(org).rows('select amount_minor::int a from public.member_budgets where trip_id = $1', [t2]), [{ a: 800000 }]);
  });

  test('a stranger gets nothing', async () => {
    const r = await A(eve).try('select * from public.crew_budget($1)', [t2]);
    assert.equal(r.ok, false);
  });
});

describe('replace_invitation and revoke_invitation', () => {
  test('replace kills the old link immediately and issues a working new one for the same person', async () => {
    const old = await create(org, trip, 'Manas');
    const newT = token();
    const r = await A(org).try('select * from public.replace_invitation($1,$2,$3)', [trip, old.row.id, sha(newT)]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.rows[0].invitee_name, 'Manas');
    assert.equal(r.rows[0].status, 'pending');
    assert.equal((await preview(null, old.t)).state, 'revoked');
    assert.equal((await accept(await fresh('OldLinkUser'), old.t)).message, 'invite_revoked');
    assert.equal((await preview(null, newT)).state, 'valid');
    const joined = await accept(await fresh('Manas Real'), newT);
    assert.equal(joined.ok, true);
    assert.equal(joined.rows[0].already_member, false);
  });

  test('an expired invite can be replaced', async () => {
    const old = await create(org, trip, 'Slow');
    await adm().rows(`update public.invitations set expires_at = now() - interval '1 day' where id = $1`, [old.row.id]);
    const newT = token();
    assert.equal((await A(org).try('select * from public.replace_invitation($1,$2,$3)', [trip, old.row.id, sha(newT)])).ok, true);
    assert.equal((await preview(null, newT)).state, 'valid');
  });

  test('a joined invite cannot be replaced or revoked', async () => {
    const used = await create(org, trip, 'Joined');
    await accept(await addUser(db, 'Joined Person'), used.t);
    const rep = await A(org).try('select * from public.replace_invitation($1,$2,$3)', [trip, used.row.id, sha(token())]);
    assert.equal(rep.message, 'already_joined');
    assert.equal((await A(org).try('select public.revoke_invitation($1,$2)', [trip, used.row.id])).message, 'already_joined');
    assert.equal((await inviteRow(used.hash)).status, 'joined');
  });

  test('only the organiser, and only within the right trip', async () => {
    const mine = await create(org, trip, 'Mine');
    const theirs = await create(eve, otherTrip, 'Theirs');
    for (const user of [ann, eve]) {
      assert.equal((await A(user).try('select * from public.replace_invitation($1,$2,$3)', [trip, mine.row.id, sha(token())])).message, 'not_found');
      assert.equal((await A(user).try('select public.revoke_invitation($1,$2)', [trip, mine.row.id])).message, 'not_found');
    }
    // organiser of trip A addressing trip B's invitation through trip A
    assert.equal((await A(org).try('select * from public.replace_invitation($1,$2,$3)', [trip, theirs.row.id, sha(token())])).message, 'not_found');
    assert.equal((await A(org).try('select public.revoke_invitation($1,$2)', [trip, theirs.row.id])).message, 'not_found');
    assert.equal((await inviteRow(mine.hash)).status, 'pending');
    assert.equal((await inviteRow(theirs.hash)).status, 'pending');
  });

  test('ATOMIC replace: if issuing the new link fails, the old one is NOT revoked', async () => {
    const a = await create(org, trip, 'AtomA');
    const b = await create(org, trip, 'AtomB');
    const r = await A(org).try('select * from public.replace_invitation($1,$2,$3)', [trip, b.row.id, a.hash]); // a.hash already exists
    assert.equal(r.ok, false);
    assert.equal(r.code, '23505');
    assert.equal((await inviteRow(b.hash)).status, 'pending');
  });

  test('revoke cancels a pending link; anonymous cannot call any of these', async () => {
    const x = await create(org, trip, 'Cancel');
    assert.equal((await A(org).try('select public.revoke_invitation($1,$2)', [trip, x.row.id])).ok, true);
    assert.equal((await preview(null, x.t)).state, 'revoked');
    for (const q of ['select public.revoke_invitation($1,$2)', 'select * from public.replace_invitation($1,$2,$3)']) {
      const r = await A(null).try(q, [trip, x.row.id, sha(token())].slice(0, q.includes('$3') ? 3 : 2));
      assert.equal(r.ok, false);
      assert.match(r.message, /permission denied for function/);
    }
  });
});

describe('privileges and no loosening of existing security', () => {
  const fns = ['create_invitation(uuid,text,text)', 'replace_invitation(uuid,uuid,text)', 'revoke_invitation(uuid,uuid)', 'accept_invitation(text)', 'invitation_preview(text)', 'invite_state(text,timestamptz)'];
  const can = async (role, fn) => (await adm().rows(`select has_function_privilege($1, 'public.${fn}', 'execute') as ok`, [role]))[0].ok;

  test('EXECUTE grants are exactly the intended set', async () => {
    const matrix = {};
    for (const fn of fns) matrix[fn.split('(')[0]] = { anon: await can('anon', fn), authenticated: await can('authenticated', fn) };
    assert.deepEqual(matrix, {
      create_invitation: { anon: false, authenticated: true },
      replace_invitation: { anon: false, authenticated: true },
      revoke_invitation: { anon: false, authenticated: true },
      accept_invitation: { anon: false, authenticated: true },
      invitation_preview: { anon: true, authenticated: true },
      invite_state: { anon: false, authenticated: false },
    });
  });

  test('no function is executable by PUBLIC, and every one pins search_path', async () => {
    const rows = await adm().rows(`select proname, proacl::text acl, prosecdef, coalesce(proconfig, '{}'::text[]) @> array['search_path=""'] as pins_search_path from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('create_invitation','replace_invitation','revoke_invitation','accept_invitation','invitation_preview','invite_state')`);
    assert.equal(rows.length, 6);
    for (const r of rows) {
      assert.ok(!/(^\{|,)=X\//.test(r.acl ?? ''), `${r.proname} is executable by PUBLIC: ${r.acl}`);
      assert.equal(r.pins_search_path, true, `${r.proname} pins an empty search_path`);
    }
    assert.equal(rows.filter((r) => r.proname !== 'invite_state').every((r) => r.prosecdef), true);
  });

  test('clients STILL cannot write invitations or memberships directly, or read secrets', async () => {
    const direct = [
      [ann, `insert into public.trip_members (trip_id, user_id, role) values ('${trip}', '${ann}', 'member')`],
      [org, `insert into public.invitations (trip_id, invitee_name, token_hash, created_by) values ('${trip}', 'x', 'h', '${org}')`],
      [org, `update public.invitations set status = 'joined'`],
      [org, 'select token_hash from public.invitations'],
      [org, 'select email from public.invitations'],
    ];
    for (const [user, q] of direct) {
      const r = await A(user).try(q);
      assert.equal(r.ok, false, q);
      assert.match(r.message, /permission denied/, q);
    }
  });

  test('members can still list invitation names and state (non-secret columns) through RLS', async () => {
    const member = await fresh('Lister');
    await accept(member, (await create(org, trip, 'ListMe')).t);
    const rows = await A(member).rows('select invitee_name, status, expires_at from public.invitations where trip_id = $1', [trip]);
    assert.ok(rows.length > 0, 'a member sees the trip\'s invitations');
    assert.ok(rows.some((r) => r.invitee_name === 'ListMe'));
    assert.equal((await A(await fresh('Outsider')).rows('select id from public.invitations where trip_id = $1', [trip])).length, 0, 'a stranger sees none');
  });
});
