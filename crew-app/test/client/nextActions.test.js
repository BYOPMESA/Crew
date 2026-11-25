import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_ITEMS, listNames, nextActions } from '../../public/js/lib/nextActions.js';

const ID = 'trip-1';
const ME = 'me';
const person = (user_id, display_name, role = 'member', has_preferences = false, has_budget = false) => ({ user_id, display_name, role, has_preferences, has_budget });
const FULL_TRIP = { status: 'planning', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', expected_size: 4 };
const EMPTY_TRIP = { status: 'planning', destination: null, start_date: null, end_date: null, expected_size: null };
const inv = (invitee_name, state) => ({ invitee_name, state });
const run = (over = {}) =>
  nextActions({ tripId: ID, trip: FULL_TRIP, isOrganiser: true, meId: ME, members: [person(ME, 'Saqeeb Chand', 'organiser', true, true)], invites: [], ...over });
const ids = (result) => result.items.map((i) => i.id);
const item = (result, id) => result.items.find((i) => i.id === id);

describe('listNames', () => {
  test('reads naturally for 0-5 names and respects max', () => {
    assert.equal(listNames([]), '');
    assert.equal(listNames(['Aisha']), 'Aisha');
    assert.equal(listNames(['Aisha', 'Rahul']), 'Aisha and Rahul');
    assert.equal(listNames(['Aisha', 'Rahul', 'Manas']), 'Aisha, Rahul and Manas');
    assert.equal(listNames(['A', 'B', 'C', 'D']), 'A, B and 2 others');
    assert.equal(listNames(['A', 'B', 'C', 'D', 'E']), 'A, B and 3 others');
    assert.equal(listNames(['A', 'B', 'C', 'D'], 4), 'A, B, C and D');
    assert.equal(listNames(['A', null, '', 'B']), 'A and B', 'blank names are dropped');
  });
});

describe('organiser', () => {
  test('brand-new trip: own preferences first, then basics, destination, invite', () => {
    const r = run({ trip: EMPTY_TRIP, members: [person(ME, 'Saqeeb', 'organiser')] });
    assert.deepEqual(ids(r), ['my-preferences', 'basics', 'destination', 'invite']);
    assert.equal(r.primaryId, 'my-preferences');
    assert.equal(item(r, 'my-preferences').title, 'Set your preferences and budget');
    assert.equal(item(r, 'my-preferences').href, `/trips/${ID}/preferences`);
    assert.equal(item(r, 'basics').detail, 'Still missing: dates and crew size.');
    assert.equal(item(r, 'basics').href, `/trips/${ID}/basics`);
    assert.equal(item(r, 'destination').kind, 'focus');
    assert.equal(item(r, 'destination').focus, 'destination');
    assert.equal(item(r, 'invite').href, `/trips/${ID}/invite`);
  });

  test('partial progress uses precise wording', () => {
    const only = (pref, budget) => item(run({ members: [person(ME, 'S', 'organiser', pref, budget)] }), 'my-preferences').title;
    assert.equal(only(false, false), 'Set your preferences and budget');
    assert.equal(only(false, true), 'Save your preferences');
    assert.equal(only(true, false), 'Add your budget');
    assert.equal(item(run(), 'my-preferences'), undefined, 'nothing to prompt once both are saved');
  });

  test('basics lists only what is actually missing', () => {
    const detail = (trip) => item(run({ trip: { ...FULL_TRIP, ...trip } }), 'basics')?.detail;
    assert.equal(detail({ start_date: null }), 'Still missing: dates.');
    assert.equal(detail({ end_date: null }), 'Still missing: dates.');
    assert.equal(detail({ expected_size: null }), 'Still missing: crew size.');
    assert.equal(detail({}), undefined);
  });

  test('a fully set-up trip with nobody invited yet asks only for invites', () => {
    assert.deepEqual(ids(run()), ['invite']);
  });

  test('pending invites are named; "more friends" counts crew size minus members minus pending', () => {
    const r = run({ invites: [inv('Manas', 'valid'), inv('Rahul', 'valid')] });
    assert.deepEqual(ids(r), ['invites-pending', 'invite-more']);
    assert.equal(item(r, 'invites-pending').title, '2 invites waiting to join');
    assert.equal(item(r, 'invites-pending').detail, 'Manas and Rahul');
    assert.equal(item(r, 'invite-more').title, 'Invite 1 more friend'); // 4 expected - 1 member - 2 pending
    assert.equal(item(r, 'invite-more').detail, 'Crew size is 4.');
  });

  test('singular and plural wording', () => {
    assert.equal(item(run({ invites: [inv('Manas', 'valid')] }), 'invites-pending').title, '1 invite waiting to join');
    assert.equal(item(run({ invites: [inv('Rahul', 'expired')] }), 'invites-expired').title, '1 invite link has expired');
    assert.equal(item(run({ invites: [inv('A', 'expired'), inv('B', 'expired')] }), 'invites-expired').title, '2 invite links have expired');
    assert.equal(item(run({ invites: [inv('A', 'valid')], trip: { ...FULL_TRIP, expected_size: 6 } }), 'invite-more').title, 'Invite 4 more friends');
  });

  test('expired links are called out with whose they are and where to fix them', () => {
    const r = run({ invites: [inv('Rahul', 'expired'), inv('Aisha', 'expired')] });
    assert.equal(item(r, 'invites-expired').detail, 'Rahul and Aisha: make a new link.');
    assert.equal(item(r, 'invites-expired').href, `/trips/${ID}/invite`);
  });

  test('used (joined) invites count as invited, so "Invite your crew" is not shown again', () => {
    const r = run({ invites: [inv('Manas', 'used')], members: [person(ME, 'S', 'organiser', true, true), person('m', 'Manas', 'member', true, true)], trip: { ...FULL_TRIP, expected_size: 2 } });
    assert.ok(!ids(r).includes('invite'));
    assert.ok(!ids(r).includes('invite-more'));
  });

  test('when the whole crew is accounted for, no "invite more" prompt', () => {
    const members = [person(ME, 'S', 'organiser', true, true), person('a', 'A', 'member', true, true)];
    const r = run({ members, invites: [inv('A', 'used'), inv('B', 'valid')], trip: { ...FULL_TRIP, expected_size: 3 } });
    assert.ok(!ids(r).includes('invite-more'), '2 members + 1 pending = 3 expected');
  });

  test('without a crew size, never guesses how many more to invite', () => {
    const r = run({ trip: { ...FULL_TRIP, expected_size: null }, invites: [inv('A', 'valid')] });
    assert.ok(!ids(r).includes('invite-more'));
  });

  test('invitations that could not be loaded (null): invite items are skipped, everything else still works', () => {
    const r = run({ invites: null, trip: EMPTY_TRIP, members: [person(ME, 'S', 'organiser')] });
    assert.deepEqual(ids(r), ['my-preferences', 'basics', 'destination']);
    assert.ok(!ids(run({ invites: null })).includes('invite'), 'does not nag to invite when it cannot know');
    assert.deepEqual(ids(run({ invites: null })), ['all-caught-up']);
  });
});

describe('waiting on the crew (both roles)', () => {
  const crew = (...rest) => [person(ME, 'Saqeeb Chand', 'organiser', true, true), ...rest];

  test('names who has not finished and links to the progress screen', () => {
    const r = run({ members: crew(person('b', 'Manas Kothari', 'member', true, false), person('c', 'Rahul Nair')), invites: [inv('x', 'used')] });
    assert.equal(item(r, 'waiting').title, 'Waiting on Manas and Rahul');
    assert.equal(item(r, 'waiting').href, `/trips/${ID}/waiting`);
    assert.ok(!ids(r).includes('crew-ready'));
  });

  test('uses distinguishing short names when members share a first name (#38)', () => {
    const r = run({ members: crew(person('b', 'QA Alpha'), person('c', 'QA Beta')), invites: [inv('x', 'used')] });
    assert.equal(item(r, 'waiting').title, 'Waiting on QA A. and QA B.');
  });

  test('long lists are summarised', () => {
    const r = run({ members: crew(person('a', 'Aa'), person('b', 'Bb'), person('c', 'Cc'), person('d', 'Dd')), invites: [inv('x', 'used')] });
    assert.equal(item(r, 'waiting').title, 'Waiting on Aa, Bb and 2 others');
  });

  test('everyone done (2+ members): an information row, not an action', () => {
    const r = run({ members: crew(person('b', 'Manas', 'member', true, true)), invites: [inv('x', 'used')] });
    assert.equal(item(r, 'crew-ready').kind, 'info');
    assert.equal(item(r, 'crew-ready').href, undefined);
    assert.ok(!ids(r).includes('waiting'));
  });

  test('a lone organiser who is done is NOT told "everyone has finished"', () => {
    assert.ok(!ids(run()).includes('crew-ready'));
  });
});

describe('plain member (invitee)', () => {
  const asMember = (over = {}) =>
    run({ isOrganiser: false, members: [person('org', 'Chris Mathew', 'organiser', true, true), person(ME, 'Saqeeb Chand')], invites: [], ...over });

  test('their own step comes first and they get no organiser tools', () => {
    const r = asMember();
    assert.equal(ids(r)[0], 'my-preferences');
    for (const organiserOnly of ['basics', 'destination', 'invite', 'invites-pending', 'invites-expired', 'invite-more']) {
      assert.ok(!ids(r).includes(organiserOnly), organiserOnly);
    }
  });

  test('when the organiser has not set the destination or dates, that is explained, not actionable', () => {
    const none = item(asMember({ trip: EMPTY_TRIP }), 'organiser-pending');
    assert.equal(none.title, 'The organiser has not set the destination and dates yet');
    assert.equal(none.kind, 'info');
    assert.equal(item(asMember({ trip: { ...FULL_TRIP, destination: null } }), 'organiser-pending').title, 'The organiser has not set the destination yet');
    assert.equal(item(asMember({ trip: { ...FULL_TRIP, start_date: null } }), 'organiser-pending').title, 'The organiser has not set the dates yet');
    assert.equal(item(asMember(), 'organiser-pending'), undefined);
  });

  test('after finishing their own step: waiting on others, or ready', () => {
    const waiting = asMember({ members: [person('org', 'Chris', 'organiser', true, true), person(ME, 'Saqeeb', 'member', true, true), person('c', 'Manas')] });
    assert.equal(item(waiting, 'waiting').title, 'Waiting on Manas');
    const ready = asMember({ members: [person('org', 'Chris', 'organiser', true, true), person(ME, 'Saqeeb', 'member', true, true)] });
    assert.deepEqual(ids(ready), ['crew-ready']);
  });

  test('member alone and done with a complete trip: caught-up fallback so the list is never empty', () => {
    const r = asMember({ members: [person(ME, 'Saqeeb', 'member', true, true)] });
    assert.deepEqual(ids(r), ['all-caught-up']);
    assert.equal(r.primaryId, null);
  });
});

describe('trip status', () => {
  test('voting open / closed are information rows (no screen exists yet) and never become the primary action', () => {
    const open = run({ trip: { ...FULL_TRIP, status: 'voting' } });
    assert.equal(ids(open)[0], 'voting-open');
    assert.equal(open.items[0].kind, 'info');
    assert.equal(open.items[0].href, undefined);
    assert.notEqual(open.primaryId, 'voting-open');
    assert.equal(ids(run({ trip: { ...FULL_TRIP, status: 'closed' } }))[0], 'voting-closed');
  });
});

describe('limits and invariants', () => {
  test('the list is capped and reports how many were hidden', () => {
    const r = run({
      trip: { ...EMPTY_TRIP, status: 'voting', expected_size: 9 },
      members: [person(ME, 'S', 'organiser'), person('a', 'A')],
      invites: [inv('E', 'expired'), inv('V', 'valid')],
    });
    assert.equal(r.items.length, MAX_ITEMS);
    assert.ok(r.hidden > 0);
    assert.equal(ids(r)[0], 'voting-open');
  });

  test('EVERY combination of state satisfies the invariants (4,608 states)', () => {
    const roles = [true, false];
    const mine = [[false, false], [true, false], [false, true], [true, true]];
    const trips = [];
    for (const destination of [null, 'Goa']) for (const dates of [false, true]) for (const size of [null, 4]) for (const status of ['planning', 'voting', 'closed']) {
      trips.push({ status, destination, start_date: dates ? '2026-12-20' : null, end_date: dates ? '2026-12-23' : null, expected_size: size });
    }
    const inviteSets = [null, [], [inv('A', 'valid')], [inv('A', 'expired')], [inv('A', 'used')], [inv('A', 'valid'), inv('B', 'expired'), inv('C', 'valid')]];
    const others = [[], [person('o1', 'Other One')], [person('o1', 'QA Alpha'), person('o2', 'QA Beta'), person('o3', 'Third'), person('o4', 'Fourth')], [person('o1', 'Done One', 'member', true, true)]];

    let states = 0;
    for (const isOrganiser of roles) for (const [p, b] of mine) for (const trip of trips) for (const invites of inviteSets) for (const rest of others) {
      states += 1;
      const members = [person(ME, 'Saqeeb Chand', isOrganiser ? 'organiser' : 'member', p, b), ...rest];
      const r = nextActions({ tripId: ID, trip, isOrganiser, meId: ME, members, invites });
      const where = JSON.stringify({ isOrganiser, p, b, trip, invites, rest: rest.length });

      assert.ok(r.items.length >= 1 && r.items.length <= MAX_ITEMS, `1..${MAX_ITEMS} items ${where}`);
      assert.equal(new Set(r.items.map((i) => i.id)).size, r.items.length, `unique ids ${where}`);
      for (const i of r.items) {
        assert.ok(i.title && !/null|undefined|NaN/.test(`${i.title} ${i.detail ?? ''}`), `clean text "${i.title}" ${where}`);
        if (i.kind === 'link') assert.ok(i.href?.startsWith(`/trips/${ID}/`), `link goes to an existing screen ${where}`);
        if (i.kind === 'info') assert.equal(i.href, undefined, `info has no link ${where}`);
        if (i.kind === 'focus') assert.ok(i.focus, `focus target ${where}`);
        if (!isOrganiser) assert.ok(!['basics', 'destination', 'invite', 'invites-pending', 'invites-expired', 'invite-more'].includes(i.id), `member sees organiser tool ${i.id} ${where}`);
      }
      const primary = r.items.find((i) => i.id === r.primaryId);
      assert.ok(r.primaryId === null || (primary && primary.kind !== 'info'), `primary is an action ${where}`);
      if (!(p && b)) {
        const firstNonStatus = r.items.find((i) => !['voting-open', 'voting-closed'].includes(i.id));
        assert.equal(firstNonStatus.id, 'my-preferences', `own step is first ${where}`);
      } else {
        assert.ok(!ids(r).includes('my-preferences'), `no own-step prompt once done ${where}`);
      }
      if (invites === null) assert.ok(!ids(r).some((id) => id.startsWith('invite')), `no invite items when invites unknown ${where}`);
    }
    assert.equal(states, 2 * 4 * 24 * 6 * 4);
  });

  test('does not mutate its inputs', () => {
    const trip = { ...FULL_TRIP };
    const members = [person(ME, 'S', 'organiser', false, false), person('b', 'B')];
    const invites = [inv('X', 'valid')];
    const before = JSON.stringify({ trip, members, invites });
    nextActions({ tripId: ID, trip, isOrganiser: true, meId: ME, members, invites });
    assert.equal(JSON.stringify({ trip, members, invites }), before);
  });
});
