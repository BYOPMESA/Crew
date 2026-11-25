// Issue #39 (stray null/undefined/NaN text) and #44 (accessibility), swept over every remaining screen with
// deliberately sparse data. mount() runs the stray-value scan and the accessibility audit on everything it renders.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { mockApi, mount, resetDom, text, tick, window } from './env.js';
import { clearMe } from '../../public/js/lib/api.js';
import { start } from '../../public/js/lib/router.js';
import { loginScreen, signupScreen } from '../../public/js/screens/auth.js';
import { basicsScreen } from '../../public/js/screens/basics.js';
import { homeScreen } from '../../public/js/screens/home.js';
import { preferencesScreen } from '../../public/js/screens/preferences.js';
import { profileScreen } from '../../public/js/screens/profile.js';
import { tripScreen } from '../../public/js/screens/trip.js';

start(document.getElementById('app'));

const ID = '22222222-2222-4222-8222-222222222222';
const ME = { id: 'me-1', display_name: 'Saqeeb Chand', email: 's@x.com' };
const member = (user_id, display_name, role = 'member', has_preferences = false, has_budget = false) => ({ user_id, display_name, role, has_preferences, has_budget });
const EMPTY_TRIP = { id: ID, name: 'Our trip', crew_name: null, destination: null, start_date: null, end_date: null, expected_size: null, notes: null, status: 'planning', organiser_id: ME.id, created_at: '2026-11-25T00:00:00Z' };
const detail = (over = {}) => ({
  trip: EMPTY_TRIP,
  is_organiser: true,
  members: [member(ME.id, 'Saqeeb Chand', 'organiser')],
  crew_budget: { average_minor: null, submitted: 0, expected: null },
  my_preferences: null,
  my_budget_minor: null,
  ...over,
});
const params = { params: { id: ID } };

beforeEach(() => {
  clearMe();
  resetDom('/');
});

describe('auth screens', () => {
  test('sign up and log in render cleanly with and without a ?next', () => {
    for (const q of ['', '?next=%2Fjoin%2FAbCdEfGhIjKlMnOpQrStUvWxYz012345']) {
      mount(signupScreen({ query: new URLSearchParams(q) }));
      const node = mount(loginScreen({ query: new URLSearchParams(q) }));
      assert.match(text(node), /Welcome back/);
    }
  });

  test('every form field has a visible label wired to the input', () => {
    const node = mount(signupScreen({ query: new URLSearchParams('') }));
    for (const id of ['display_name', 'email', 'password']) {
      assert.ok(node.querySelector(`label[for="${id}"]`), `label for ${id}`);
      assert.equal(node.querySelector(`#${id}`).tagName, 'INPUT');
    }
    assert.equal(node.querySelector('#password').autocomplete, 'new-password');
    assert.equal(node.querySelector('#email').type, 'email');
  });
});

describe('home', () => {
  test('trips with missing destination and dates show honest placeholders, never null/undefined', async () => {
    mockApi({
      'GET /api/trips': [
        { ...EMPTY_TRIP, member_count: 1 },
        { ...EMPTY_TRIP, id: 'b', name: 'Goa', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', status: 'voting', member_count: 4 },
        { ...EMPTY_TRIP, id: 'c', name: 'Done trip', status: 'closed', member_count: 2 },
      ],
    });
    const node = mount(await homeScreen(ME));
    const t = text(node);
    assert.match(t, /Dates not set · 1 crew/);
    assert.match(t, /Goa · 20 Dec – 23 Dec · 4 crew/);
    assert.match(t, /Voting open/);
    assert.match(t, /Voting closed/);
    assert.match(t, /Hi, Saqeeb/);
  });

  test('the empty state is shown when there are no trips', async () => {
    mockApi({ 'GET /api/trips': [] });
    assert.match(text(mount(await homeScreen(ME))), /No trips yet/);
  });
});

describe('preferences (A05 / B05)', () => {
  test('organiser, first visit: defaults to ₹8,000 and step copy; invitee: no step counter and a back link', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail() });
    let node = mount(await preferencesScreen(ME, params));
    assert.match(text(node), /Step 1 of 3 · Your preferences/);
    assert.match(text(node), /What do you want, Saqeeb\?/);
    assert.match(text(node.querySelector('[aria-live="polite"]')), /^₹8,000$/);
    assert.equal(node.querySelector('#budget').value, '8000');
    assert.ok(!node.querySelector('a.back'), 'organiser has no back link on step 1');

    mockApi({ [`GET /api/trips/${ID}`]: detail({ is_organiser: false }) });
    node = mount(await preferencesScreen(ME, params));
    assert.ok(!/Step 1 of 3/.test(text(node)));
    assert.ok(node.querySelector('a.back'), 'invitee can go back to the trip');
    assert.match(text(node), /What are you into, Saqeeb\?/);
  });

  test('saved preferences and budget are restored (paise to rupees) and chips reflect them', async () => {
    mockApi({
      [`GET /api/trips/${ID}`]: detail({
        my_preferences: { interests: ['Beaches', 'Seafood'], vibe: 'packed', stay_styles: ['Hostel'], must_visit: 'Dudhsagar Falls' },
        my_budget_minor: 650000,
      }),
    });
    const node = mount(await preferencesScreen(ME, params));
    assert.equal(node.querySelector('#budget').value, '6500');
    assert.match(text(node.querySelector('[aria-live="polite"]')), /^₹6,500$/);
    const pressed = [...node.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label') || text(b)).sort();
    assert.deepEqual(pressed, ['Beaches', 'Hostel', 'Packed, see everything', 'Seafood']);
    assert.equal(node.querySelector('#must_visit').value, 'Dudhsagar Falls');
  });

  test('copy never claims the budget is visible to the crew (PRD: only the average is shared)', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail() });
    const t = text(mount(await preferencesScreen(ME, params)));
    assert.match(t, /Private to you/);
    assert.match(t, /only ever sees the average/);
  });
});

describe('trip basics (A06)', () => {
  test('empty trip shows a prompt instead of NaN nights; dates produce a nights count', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail() });
    let node = mount(await basicsScreen(ME, params));
    assert.match(text(node.querySelector('[role="status"]')), /Pick dates/);
    assert.equal(node.querySelector('#name').value, 'Our trip');
    assert.equal(node.querySelector('output').textContent, '4');

    mockApi({ [`GET /api/trips/${ID}`]: detail({ trip: { ...EMPTY_TRIP, start_date: '2026-12-20', end_date: '2026-12-23', expected_size: 6, notes: 'Keep it cheap' } }) });
    node = mount(await basicsScreen(ME, params));
    assert.match(text(node.querySelector('[role="status"]')), /^3 nights$/);
    assert.equal(node.querySelector('output').textContent, '6');
    assert.equal(node.querySelector('#notes').value, 'Keep it cheap');
  });

  test('one clear trip-name field with its own label (#12: not conflated with a crew name)', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail() });
    const node = mount(await basicsScreen(ME, params));
    assert.equal(node.querySelector('label[for="name"]').textContent, 'Trip name');
    assert.equal(node.querySelectorAll('input[type="text"]').length, 1);
  });

  test('crew size stays between 1 and 20', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail({ trip: { ...EMPTY_TRIP, expected_size: 20 } }) });
    const node = mount(await basicsScreen(ME, params));
    node.querySelector('#plus').click();
    assert.equal(node.querySelector('output').textContent, '20');
    node.querySelector('#minus').click();
    assert.equal(node.querySelector('output').textContent, '19');
    for (let i = 0; i < 40; i += 1) node.querySelector('#minus').click();
    assert.equal(node.querySelector('output').textContent, '1');
  });

  test('a non-organiser is sent back to the trip', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail({ is_organiser: false }) });
    resetDom(`/trips/${ID}/basics`);
    assert.equal(await basicsScreen(ME, params), undefined);
    await tick(20);
    assert.equal(window.location.pathname, `/trips/${ID}`);
  });
});

describe('trip page', () => {
  test('a brand-new trip: honest empty states', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail() });
    const node = mount(await tripScreen(ME, params));
    const t = text(node);
    assert.match(t, /Destination not chosen yet/);
    assert.match(t, /Dates not set/);
    assert.equal(text(node.querySelector('[data-testid="budget-note"]')), 'No budgets shared yet');
    assert.match(t, /—/, 'no average yet');
    assert.match(t, /Invite the crew/);
    assert.match(t, /Edit trip details/);
  });

  test('budget privacy states: hidden with one other submission, average with two', async () => {
    const members = [member(ME.id, 'Saqeeb Chand', 'organiser', true, false), member('o', 'Chris Mathew', 'member', true, true)];
    mockApi({ [`GET /api/trips/${ID}`]: detail({ members, crew_budget: { average_minor: null, submitted: 1, expected: 4 } }) });
    let node = mount(await tripScreen(ME, params));
    assert.match(text(node.querySelector('[data-testid="budget-note"]')), /appears once a second person shares/);
    assert.ok(!/₹/.test(text(node.querySelector('.stats'))), 'no figure is shown that could expose one person');

    mockApi({ [`GET /api/trips/${ID}`]: detail({ members, crew_budget: { average_minor: 650000, submitted: 2, expected: 4 } }) });
    node = mount(await tripScreen(ME, params));
    assert.match(text(node.querySelector('.stats')), /₹6,500/);
    assert.equal(text(node.querySelector('[data-testid="budget-note"]')), '2 of 4 people have shared a budget');
  });

  test('a plain member gets no organiser controls', async () => {
    mockApi({ [`GET /api/trips/${ID}`]: detail({ is_organiser: false, trip: { ...EMPTY_TRIP, destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23' } }) });
    const node = mount(await tripScreen(ME, params));
    const t = text(node);
    assert.ok(!/Invite the crew|Edit trip details|Save destination/.test(t));
    assert.match(t, /Goa/);
    assert.match(t, /3 nights/);
    assert.match(t, /Edit my preferences/);
  });

  test('#38: crew members whose names start the same word get distinct avatars and names', async () => {
    const members = [member(ME.id, 'QA Alpha', 'organiser', true, true), member('b', 'QA Beta', 'member', true, true)];
    mockApi({ [`GET /api/trips/${ID}`]: detail({ members }) });
    const node = mount(await tripScreen(ME, params));
    const avatars = [...node.querySelectorAll('.crewrow .av')].map(text);
    assert.deepEqual(avatars, ['QA', 'QB']);
    assert.match(text(node), /QA Alpha/);
    assert.match(text(node), /QA Beta/);
  });
});

describe('keyboard and screen-reader basics (#44)', () => {
  test('every screen is the target of the skip link; decorative icons are hidden from assistive tech', async () => {
    mockApi({ 'GET /api/trips': [] });
    const node = mount(await homeScreen(ME));
    assert.equal(node.id, 'main');
    assert.equal(node.getAttribute('tabindex'), '-1');
    const svgs = [...node.querySelectorAll('svg')];
    assert.ok(svgs.length > 0);
    for (const s of svgs) {
      assert.equal(s.getAttribute('aria-hidden'), 'true');
      assert.equal(s.getAttribute('focusable'), 'false');
    }
  });

  test('the shell page has a language, a skip link that points at the main landmark, and a viewport', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<a class="skip-link" href="#main">/);
    assert.match(html, /viewport-fit=cover/);
    assert.ok(!/user-scalable=no|maximum-scale=1/.test(html), 'pinch-zoom must stay enabled');
  });
});

describe('profile', () => {
  test('shows name and email and a log-out button with a name', () => {
    const node = mount(profileScreen(ME));
    assert.match(text(node), /Saqeeb Chand/);
    assert.match(text(node), /s@x\.com/);
    assert.ok([...node.querySelectorAll('button')].some((b) => /Log out/.test(b.textContent)));
  });
});
