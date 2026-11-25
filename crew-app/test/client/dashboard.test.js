// Issue #20: trip dashboard "Up next". Renders the real tripScreen with a faked API and checks every state.
// mount() also scans each render for stray null/undefined/NaN and audits structural accessibility.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';
import { mockApi, mount, resetDom, text, tick, window } from './env.js';
import { clearMe } from '../../public/js/lib/api.js';
import { start } from '../../public/js/lib/router.js';
import { tripScreen } from '../../public/js/screens/trip.js';

start(document.getElementById('app'));

const ID = '22222222-2222-4222-8222-222222222222';
const ME = { id: 'me-1', display_name: 'Saqeeb Chand', email: 's@x.com' };
const person = (user_id, display_name, role = 'member', has_preferences = false, has_budget = false) => ({ user_id, display_name, role, has_preferences, has_budget });
const FULL = { id: ID, name: 'Goa gang', crew_name: null, destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', expected_size: 4, notes: null, status: 'planning', organiser_id: ME.id };
const EMPTY = { ...FULL, name: 'Our trip', destination: null, start_date: null, end_date: null, expected_size: null };
const inv = (id, invitee_name, state) => ({ id, invitee_name, state, status: state === 'used' ? 'joined' : 'pending' });

/** Render the dashboard. `over` overrides parts of the /trips/:id payload; `invites` is the invitations response. */
async function render({ trip = FULL, members, isOrganiser = true, cb = { average_minor: null, submitted: 0, expected: null }, invites = [], extra = {} } = {}) {
  const crew = members ?? [person(ME.id, 'Saqeeb Chand', 'organiser', true, true)];
  const calls = mockApi({
    [`GET /api/trips/${ID}`]: { trip, is_organiser: isOrganiser, members: crew, crew_budget: cb, my_preferences: null, my_budget_minor: null },
    [`GET /api/trips/${ID}/invitations`]: invites,
    ...extra,
  });
  const node = mount(await tripScreen({ ...ME, id: ME.id }, { params: { id: ID } }));
  return { node, calls };
}
const rows = (node) => [...node.querySelectorAll('[data-testid="next-item"]')];
const rowIds = (node) => rows(node).map((r) => r.dataset.item);
const row = (node, id) => rows(node).find((r) => r.dataset.item === id);

beforeEach(() => {
  clearMe();
  resetDom(`/trips/${ID}`);
});

describe('hero and stats (A12 layout)', () => {
  test('trip name is the headline (#12), destination the eyebrow, dates and nights are computed', async () => {
    const { node } = await render();
    assert.equal(text(node.querySelector('.hero h1')), 'Goa gang');
    assert.equal(text(node.querySelector('.hero .eyebrow')), 'Goa');
    assert.match(text(node.querySelector('.hero')), /20 Dec – 23 Dec · 3 nights/);
    assert.match(text(node.querySelector('.hero .badge')), /^Planning$/);
  });

  test('three stat tiles like the mockup: crew budget, nights, crew avatars', async () => {
    const members = [person(ME.id, 'Chris Mathew', 'organiser', true, true), person('b', 'Saqeeb Chand', 'member', true, true)];
    const { node } = await render({ members, cb: { average_minor: 650000, submitted: 2, expected: 4 } });
    const tiles = [...node.querySelectorAll('.stats .m')].map(text);
    assert.equal(tiles.length, 3);
    assert.match(tiles[0], /^₹6,500 crew budget \/ person$/);
    assert.match(tiles[1], /^3 nights$/);
    assert.match(tiles[2], /2 of 4 joined$/);
    assert.deepEqual([...node.querySelectorAll('.stats .av')].map(text), ['C', 'S']);
    assert.equal(node.querySelector('.stats .avatars').getAttribute('aria-hidden'), 'true', 'avatars are decorative; the text carries the count');
  });

  test('more than five members collapse to a "+N" avatar; the joined count stays exact', async () => {
    const members = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => person(`u${i}`, `${n}${n} Person`, i === 0 ? 'organiser' : 'member', true, true));
    members[0].user_id = ME.id;
    const { node } = await render({ members, trip: { ...FULL, expected_size: 8 } });
    assert.deepEqual([...node.querySelectorAll('.stats .av')].map(text), ['A', 'B', 'C', 'D', 'E', '+2']);
    assert.match(text(node.querySelectorAll('.stats .m')[2]), /7 of 8 joined/);
  });

  test('nothing is invented when data is missing: dashes and honest notes', async () => {
    const { node } = await render({ trip: EMPTY, members: [person(ME.id, 'Saqeeb', 'organiser')] });
    const tiles = [...node.querySelectorAll('.stats .m')].map(text);
    assert.match(tiles[0], /^— crew budget/);
    assert.match(tiles[1], /^— nights$/);
    assert.equal(text(node.querySelector('[data-testid="budget-note"]')), 'No budgets shared yet');
    assert.equal(text(node.querySelector('.hero .eyebrow')), 'Destination not chosen yet');
    assert.match(text(node.querySelector('.hero')), /Dates not set/);
  });

  test('one night is singular', async () => {
    const { node } = await render({ trip: { ...FULL, end_date: '2026-12-21' } });
    assert.match(text(node.querySelectorAll('.stats .m')[1]), /^1 night$/);
  });

  test('no Explore cards, ratings, reviews or weather: there is no real source for them yet (PRD: never invent)', async () => {
    const { node } = await render();
    assert.ok(!/Explore|reviews|rating|★|°C|sunny|forecast|AI-checked/i.test(text(node)));
    assert.equal(node.querySelector('.xc, .hscroll, .weather'), null);
  });
});

describe('Up next: organiser', () => {
  test('brand-new trip: own step first (highlighted), then basics, destination, invite', async () => {
    const { node } = await render({ trip: EMPTY, members: [person(ME.id, 'Saqeeb', 'organiser')] });
    assert.deepEqual(rowIds(node), ['my-preferences', 'basics', 'destination', 'invite']);
    assert.ok(row(node, 'my-preferences').classList.contains('primary'));
    assert.equal(node.querySelectorAll('.next.primary').length, 1);
    assert.equal(row(node, 'my-preferences').getAttribute('href'), `/trips/${ID}/preferences`);
    assert.equal(row(node, 'basics').getAttribute('href'), `/trips/${ID}/basics`);
    assert.equal(row(node, 'invite').getAttribute('href'), `/trips/${ID}/invite`);
    assert.match(text(row(node, 'basics')), /Still missing: dates and crew size\./);
    assert.equal(node.querySelector('ul[aria-label="Up next"]').children.length, 4);
  });

  test('"Choose a destination" jumps to the field and focuses it (no navigation)', async () => {
    const { node } = await render({ trip: { ...FULL, destination: null } });
    const item = row(node, 'destination');
    assert.equal(item.getAttribute('href'), '#destination');
    item.click();
    assert.equal(document.activeElement, node.querySelector('#destination'));
    assert.equal(window.location.pathname, `/trips/${ID}`);
  });

  test('saving a destination updates the hero and removes the prompt, without reloading', async () => {
    const { node, calls } = await render({
      trip: { ...FULL, destination: null },
      invites: [inv('i1', 'Manas', 'valid')],
      extra: { [`PATCH /api/trips/${ID}`]: ({ body }) => ({ ...FULL, destination: body.destination }) },
    });
    assert.ok(row(node, 'destination'));
    node.querySelector('#destination').value = '  Goa ';
    [...node.querySelectorAll('button')].find((b) => /Save destination/.test(b.textContent)).click();
    await tick(30);
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.deepEqual(patch.body, { destination: 'Goa' });
    assert.equal(text(node.querySelector('.hero .eyebrow')), 'Goa');
    assert.equal(row(node, 'destination'), undefined, 'the prompt is gone');
    assert.match(text(node), /Destination saved/);
  });

  test('clearing the destination brings the prompt back', async () => {
    const { node } = await render({ extra: { [`PATCH /api/trips/${ID}`]: () => ({ ...FULL, destination: null }) } });
    assert.equal(row(node, 'destination'), undefined);
    node.querySelector('#destination').value = '';
    [...node.querySelectorAll('button')].find((b) => /Save destination/.test(b.textContent)).click();
    await tick(30);
    assert.ok(row(node, 'destination'));
    assert.equal(text(node.querySelector('.hero .eyebrow')), 'Destination not chosen yet');
  });

  test('a failed save shows the error and leaves "Up next" untouched', async () => {
    const { node } = await render({ trip: { ...FULL, destination: null }, extra: { [`PATCH /api/trips/${ID}`]: { status: 403, body: { error: 'forbidden', message: 'Not allowed.' } } } });
    const before = rowIds(node);
    [...node.querySelectorAll('button')].find((b) => /Save destination/.test(b.textContent)).click();
    await tick(30);
    assert.match(text(node.querySelector('.err')), /Not allowed/);
    assert.deepEqual(rowIds(node), before);
    assert.equal(text(node.querySelector('.hero .eyebrow')), 'Destination not chosen yet');
  });

  test('invitation states: pending named, expired called out, crew-size gap counted', async () => {
    const { node } = await render({ invites: [inv('1', 'Manas', 'valid'), inv('2', 'Rahul', 'expired')] });
    assert.deepEqual(rowIds(node), ['invites-expired', 'invites-pending', 'invite-more']);
    assert.match(text(row(node, 'invites-expired')), /1 invite link has expired.*Rahul: make a new link/);
    assert.match(text(row(node, 'invites-pending')), /1 invite waiting to join.*Manas/);
    assert.match(text(row(node, 'invite-more')), /Invite 2 more friends.*Crew size is 4/); // 4 - 1 member - 1 pending
  });

  test('waiting on the crew: named, linked to the progress screen', async () => {
    const members = [person(ME.id, 'Saqeeb', 'organiser', true, true), person('b', 'Manas Kothari', 'member', true, false), person('c', 'Rahul Nair')];
    const { node } = await render({ members, trip: { ...FULL, expected_size: 3 }, invites: [inv('1', 'Manas', 'used'), inv('2', 'Rahul', 'used')] });
    assert.deepEqual(rowIds(node), ['waiting']);
    assert.match(text(row(node, 'waiting')), /Waiting on Manas and Rahul/);
    assert.equal(row(node, 'waiting').getAttribute('href'), `/trips/${ID}/waiting`);
  });

  test('same first name: the waiting line uses distinguishing short names (#38)', async () => {
    const members = [person(ME.id, 'Saqeeb', 'organiser', true, true), person('b', 'QA Alpha'), person('c', 'QA Beta')];
    const { node } = await render({ members, trip: { ...FULL, expected_size: 3 }, invites: [inv('1', 'a', 'used'), inv('2', 'b', 'used')] });
    assert.match(text(row(node, 'waiting')), /Waiting on QA A\. and QA B\./);
  });

  test('everyone finished: an information row, not an action', async () => {
    const members = [person(ME.id, 'Saqeeb', 'organiser', true, true), person('b', 'Manas', 'member', true, true)];
    const { node } = await render({ members, trip: { ...FULL, expected_size: 2 }, invites: [inv('1', 'Manas', 'used')] });
    assert.deepEqual(rowIds(node), ['crew-ready']);
    const r = row(node, 'crew-ready');
    assert.ok(r.classList.contains('info'));
    assert.equal(r.tagName, 'DIV', 'not a link');
    assert.equal(node.querySelectorAll('.next.primary').length, 0);
  });

  test('a fully set-up lone organiser with no invitation data: caught-up row, no nagging', async () => {
    const { node } = await render({ invites: [{ ...inv('1', 'x', 'used') }], trip: { ...FULL, expected_size: 1 } });
    assert.deepEqual(rowIds(node), ['all-caught-up']);
  });

  test('more than five items are capped with an honest "N more" note', async () => {
    const { node } = await render({
      trip: { ...EMPTY, status: 'voting', expected_size: 9 },
      members: [person(ME.id, 'Saqeeb', 'organiser'), person('b', 'Manas')],
      invites: [inv('1', 'E', 'expired'), inv('2', 'V', 'valid')],
    });
    assert.equal(rows(node).length, 5);
    assert.match(text(node), /\d+ more once these are done/);
  });
});

describe('Up next: robustness', () => {
  test('invitations fail to load: the dashboard still renders and makes no claims about invites', async () => {
    const { node } = await render({ trip: { ...EMPTY, expected_size: 4, start_date: '2026-12-20', end_date: '2026-12-23', destination: 'Goa' }, invites: undefined, extra: { [`GET /api/trips/${ID}/invitations`]: { status: 500, body: { error: 'server_error' } } } });
    assert.ok(!rowIds(node).some((id) => id.startsWith('invite')));
    assert.deepEqual(rowIds(node), ['all-caught-up']);
    assert.ok(node.querySelector('.hero'));
  });

  test('the trip itself failing is NOT swallowed (404 for a trip you cannot see)', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: { status: 404, body: { error: 'not_found' } }, [`GET /api/trips/${ID}/invitations`]: { status: 404, body: { error: 'not_found' } } });
    await assert.rejects(() => tripScreen(ME, { params: { id: ID } }), (err) => err.status === 404);
  });

  test('sparse data everywhere (null names, no expected size, no budget fields) renders without leaking values', async () => {
    const members = [{ user_id: ME.id, display_name: null, role: 'organiser', has_preferences: false, has_budget: false }, { user_id: 'b', display_name: '', role: 'member', has_preferences: true, has_budget: false }];
    const { node } = await render({ trip: EMPTY, members, cb: { average_minor: null, submitted: 0, expected: null }, invites: [] });
    assert.ok(rows(node).length >= 1);
  });

  test('very long names and many pending invites wrap instead of breaking the layout (markup + CSS contract)', async () => {
    const long = 'Bartholomew-Alexander Montgomery-Featherstonehaugh';
    const invites = [inv('1', long, 'valid'), inv('2', `${long} Junior`, 'valid'), inv('3', `${long} Third`, 'valid'), inv('4', `${long} Fourth`, 'expired')];
    const { node } = await render({ trip: { ...FULL, name: 'A'.repeat(80), expected_size: 9 }, invites });
    assert.equal(node.querySelector('h1').textContent.length, 80);
    assert.match(text(row(node, 'invites-pending')), /and 1 other|Bartholomew/);
    const css = readFileSync(new URL('../../public/app.css', import.meta.url), 'utf8');
    assert.match(css, /\.next \.nx \{[^}]*min-width: 0/);
    assert.match(css, /\.next \.nx b \{[^}]*overflow-wrap: anywhere/);
    assert.match(css, /\.stats \.m \{[^}]*min-width: 0/);
  });
});

describe('Up next: plain member', () => {
  const crew = (mine = person(ME.id, 'Saqeeb Chand'), ...rest) => [person('org', 'Chris Mathew', 'organiser', true, true), mine, ...rest];

  test('own step first, no organiser tools, no destination form', async () => {
    const { node } = await render({ isOrganiser: false, members: crew(), invites: [] });
    assert.deepEqual(rowIds(node)[0], 'my-preferences');
    assert.ok(!rowIds(node).some((id) => ['basics', 'destination', 'invite', 'invites-pending', 'invites-expired', 'invite-more'].includes(id)));
    assert.equal(node.querySelector('#destination'), null);
    assert.ok(!/Invite the crew|Edit trip details|Save destination/.test(text(node)));
  });

  test('explains what the organiser has not set yet, as information', async () => {
    const { node } = await render({ isOrganiser: false, trip: EMPTY, members: crew(person(ME.id, 'Saqeeb', 'member', true, true)) });
    const r = row(node, 'organiser-pending');
    assert.match(text(r), /The organiser has not set the destination and dates yet/);
    assert.ok(r.classList.contains('info'));
  });

  test('after finishing: waiting on others, or ready', async () => {
    const waiting = await render({ isOrganiser: false, members: crew(person(ME.id, 'Saqeeb', 'member', true, true), person('c', 'Manas')) });
    assert.deepEqual(rowIds(waiting.node), ['waiting']);
    const ready = await render({ isOrganiser: false, members: crew(person(ME.id, 'Saqeeb', 'member', true, true)) });
    assert.deepEqual(rowIds(ready.node), ['crew-ready']);
  });

  test('partial progress wording: only the budget missing', async () => {
    const { node } = await render({ isOrganiser: false, members: crew(person(ME.id, 'Saqeeb', 'member', true, false)) });
    assert.match(text(row(node, 'my-preferences')), /Add your budget/);
    assert.match(text(row(node, 'my-preferences')), /Your budget stays private/);
  });
});

describe('Up next: trip status (information only, no screens exist for it yet)', () => {
  test('voting open', async () => {
    const { node } = await render({ trip: { ...FULL, status: 'voting' } });
    assert.match(text(node.querySelector('.hero .badge')), /Voting open/);
    const r = row(node, 'voting-open');
    assert.ok(r.classList.contains('info'));
    assert.equal(r.getAttribute('href'), null);
    assert.equal(rowIds(node)[0], 'voting-open');
  });

  test('voting closed', async () => {
    const { node } = await render({ trip: { ...FULL, status: 'closed' } });
    assert.match(text(node.querySelector('.hero .badge')), /Voting closed/);
    assert.ok(row(node, 'voting-closed'));
  });
});

describe('every action goes somewhere that exists', () => {
  test('all link rows point at real routes of this app; none are dead', async () => {
    const known = new Set([`/trips/${ID}/preferences`, `/trips/${ID}/basics`, `/trips/${ID}/invite`, `/trips/${ID}/waiting`, '#destination']);
    const scenarios = [
      { trip: EMPTY, members: [person(ME.id, 'S', 'organiser')], invites: [] },
      { invites: [inv('1', 'A', 'valid'), inv('2', 'B', 'expired')] },
      { members: [person(ME.id, 'S', 'organiser', true, true), person('b', 'B')], invites: [inv('1', 'B', 'used')], trip: { ...FULL, expected_size: 2 } },
    ];
    for (const s of scenarios) {
      const { node } = await render(s);
      for (const r of rows(node)) {
        const href = r.getAttribute('href');
        if (r.classList.contains('info')) assert.equal(href, null);
        else assert.ok(known.has(href), `unexpected link ${href}`);
      }
    }
  });
});
