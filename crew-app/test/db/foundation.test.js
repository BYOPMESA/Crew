// Proves the harness is faithful before any invite SQL is trusted: the real migrations load, RLS is enforced,
// privileges match the hosted project, and the known privacy rules hold in a real Postgres engine.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { actAs, addUser, admin, freshDb } from './pg.js';

let db, alice, bob;
before(async () => {
  db = await freshDb();
  alice = await addUser(db, 'Alice Organiser');
  bob = await addUser(db, 'Bob Friend');
});
after(() => db.close()); // an open PGlite instance keeps the test process alive

describe('harness fidelity (real migrations, real RLS)', () => {
  test('both migrations applied; 17 public tables, all with RLS on', async () => {
    const t = await admin(db).rows(`select count(*)::int n, count(*) filter (where rowsecurity)::int rls from pg_tables where schemaname = 'public'`);
    assert.deepEqual(t[0], { n: 17, rls: 17 });
  });

  test('the signup trigger created a profile for each user', async () => {
    const rows = await admin(db).rows('select display_name from public.profiles order by display_name');
    assert.deepEqual(rows.map((r) => r.display_name), ['Alice Organiser', 'Bob Friend']);
  });

  test('anon can read nothing', async () => {
    const r = await actAs(db, null).try('select * from public.trips');
    assert.equal(r.ok, false);
    assert.match(r.message, /permission denied/);
  });

  test('a user creates a trip and becomes its organiser member (trigger + RLS insert policy)', async () => {
    const me = actAs(db, alice);
    const [trip] = await me.rows(`insert into public.trips (organiser_id, name) values ($1, 'Goa') returning id`, [alice]);
    const members = await me.rows('select user_id, role from public.trip_members where trip_id = $1', [trip.id]);
    assert.deepEqual(members, [{ user_id: alice, role: 'organiser' }]);
  });

  test('RLS isolates users: Bob cannot see or write into Alice\'s trip', async () => {
    const [trip] = await actAs(db, alice).rows(`select id from public.trips where name = 'Goa'`);
    const bobSees = await actAs(db, bob).rows('select id from public.trips where id = $1', [trip.id]);
    assert.equal(bobSees.length, 0);
    const forged = await actAs(db, bob).try(`insert into public.trips (organiser_id, name) values ($1, 'x')`, [alice]);
    assert.equal(forged.ok, false, 'cannot create a trip on behalf of someone else');
    const join = await actAs(db, bob).try(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [trip.id, bob]);
    assert.equal(join.ok, false, 'clients cannot add themselves to a trip (this is why joining needs a controlled path)');
  });

  test('invitations: clients cannot write them or read token_hash/email', async () => {
    const [trip] = await actAs(db, alice).rows(`select id from public.trips where name = 'Goa'`);
    const ins = await actAs(db, alice).try(`insert into public.invitations (trip_id, invitee_name, token_hash, created_by) values ($1, 'x', 'h', $2)`, [trip.id, alice]);
    assert.equal(ins.ok, false, 'even the organiser cannot insert directly');
    const leak = await actAs(db, alice).try('select token_hash from public.invitations');
    assert.equal(leak.ok, false);
    assert.match(leak.message, /permission denied/);
  });

  test('budgets are private to their owner', async () => {
    const [trip] = await actAs(db, alice).rows(`select id from public.trips where name = 'Goa'`);
    await actAs(db, alice).rows('insert into public.member_budgets (trip_id, user_id, amount_minor) values ($1, $2, 800000)', [trip.id, alice]);
    const seen = await actAs(db, alice).rows('select amount_minor::int a from public.member_budgets');
    assert.deepEqual(seen, [{ a: 800000 }]);
    assert.equal((await actAs(db, bob).try('select * from public.member_budgets')).rows?.length ?? 0, 0);
  });
});
