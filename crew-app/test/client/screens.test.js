import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { mockApi, mount, resetDom, text, tick, window } from './env.js';
import { clearMe } from '../../public/js/lib/api.js';
import { rememberPendingInvite } from '../../public/js/lib/pending.js';
import { start } from '../../public/js/lib/router.js';
import { homeScreen } from '../../public/js/screens/home.js';
import { inviteScreen } from '../../public/js/screens/invite.js';
import { joinScreen } from '../../public/js/screens/join.js';
import { waitingScreen } from '../../public/js/screens/waiting.js';
import { welcomeScreen } from '../../public/js/screens/welcome.js';

start(document.getElementById('app')); // router needs an outlet so navigate() can run

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const TRIP = '22222222-2222-4222-8222-222222222222';
const ME = { id: 'me-1', display_name: 'Saqeeb Chand', email: 's@x.com' };
const NOT_SIGNED_IN = { status: 401, body: { error: 'not_authenticated' } };
const validInfo = (extra = {}) => ({
  state: 'valid',
  invitee_name: 'Saqeeb',
  organiser: 'Chris',
  trip: { name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23' },
  crew_in: 2,
  member: false,
  ...extra,
});

beforeEach(() => {
  clearMe();
  resetDom(`/join/${TOKEN}`);
});

describe('invite landing (B01)', () => {
  test('logged out: shows only the allowed facts and sends signup/login back to this exact link', async () => {
    mockApi({ [`GET /api/invitations/${TOKEN}`]: validInfo(), 'GET /api/me': NOT_SIGNED_IN });
    const node = mount(await joinScreen({ params: { token: TOKEN } }));
    const t = text(node);
    assert.match(t, /Chris invited you to/);
    assert.match(t, /Goa gang/);
    assert.match(t, /Goa/);
    assert.match(t, /20 Dec – 23 Dec · 2 in/);
    assert.ok(!t.includes('₹'), 'no money is shown on a public invitation');

    const next = encodeURIComponent(`/join/${TOKEN}`);
    assert.equal(node.querySelector('a.cta').getAttribute('href'), `/signup?next=${next}`);
    assert.ok([...node.querySelectorAll('a')].some((a) => a.getAttribute('href') === `/login?next=${next}`));
    assert.equal(window.localStorage.getItem('crew_pending_invite'), TOKEN, 'the link is remembered for a confirm-email detour');
  });

  test('logged in: Join accepts, clears the remembered link, and lands on the welcome screen', async () => {
    const calls = mockApi({
      [`GET /api/invitations/${TOKEN}`]: validInfo(),
      'GET /api/me': ME,
      [`POST /api/invitations/${TOKEN}/accept`]: { trip_id: TRIP, already_member: false },
    });
    rememberPendingInvite(TOKEN);
    const node = mount(await joinScreen({ params: { token: TOKEN } }));
    assert.match(text(node), /Joining as Saqeeb Chand/);
    node.querySelector('button.cta').click();
    await tick(30);
    assert.ok(calls.some((c) => c.method === 'POST' && c.path.endsWith('/accept')));
    assert.equal(window.location.pathname, `/trips/${TRIP}/welcome`);
    assert.equal(window.localStorage.getItem('crew_pending_invite'), null);
  });

  test('already a member: shows "Open trip", offers no join, and never calls accept', async () => {
    const calls = mockApi({ [`GET /api/invitations/${TOKEN}`]: validInfo({ member: true, trip_id: TRIP }), 'GET /api/me': ME });
    const node = mount(await joinScreen({ params: { token: TOKEN } }));
    const cta = node.querySelector('a.cta');
    assert.match(text(cta), /Open trip/);
    assert.equal(cta.getAttribute('href'), `/trips/${TRIP}`);
    assert.equal(node.querySelector('button.cta'), null);
    assert.match(text(node), /already in this trip/);
    assert.ok(!calls.some((c) => c.method === 'POST'));
  });

  test('a link that dies while the page is open shows the reason and disables Join', async () => {
    mockApi({
      [`GET /api/invitations/${TOKEN}`]: validInfo(),
      'GET /api/me': ME,
      [`POST /api/invitations/${TOKEN}/accept`]: { status: 410, body: { error: 'invite_used', message: 'This invite link has already been used.' } },
    });
    const node = mount(await joinScreen({ params: { token: TOKEN } }));
    const button = node.querySelector('button.cta');
    button.click();
    await tick(30);
    const err = node.querySelector('.err');
    assert.equal(err.hidden, false);
    assert.match(text(err), /already been used/);
    assert.equal(button.disabled, true);
    assert.equal(window.location.pathname, `/join/${TOKEN}`, 'stays put; no navigation on failure');
  });

  for (const state of ['used', 'revoked', 'expired', 'invalid']) {
    test(`${state} link: explains itself, offers a way forward, forgets the remembered link`, async () => {
      mockApi({ [`GET /api/invitations/${TOKEN}`]: { state, message: `msg-${state}` }, 'GET /api/me': NOT_SIGNED_IN });
      rememberPendingInvite(TOKEN);
      const node = mount(await joinScreen({ params: { token: TOKEN } }));
      assert.match(text(node.querySelector('h1')), /can't be used/);
      assert.match(text(node), new RegExp(`msg-${state}`));
      assert.equal(node.querySelector('a.cta').getAttribute('href'), '/', 'never a dead end');
      assert.equal(window.localStorage.getItem('crew_pending_invite'), null);
    });
  }

  test('server without a service key (503): a plain, friendly page, not a crash', async () => {
    mockApi({ [`GET /api/invitations/${TOKEN}`]: { status: 503, body: { error: 'invites_unavailable', message: 'x' } }, 'GET /api/me': NOT_SIGNED_IN });
    const node = mount(await joinScreen({ params: { token: TOKEN } }));
    assert.match(text(node), /not ready yet/);
    assert.equal(node.querySelector('a.cta').getAttribute('href'), '/');
  });

  test('unexpected server errors are not swallowed', async () => {
    mockApi({ [`GET /api/invitations/${TOKEN}`]: { status: 500, body: { error: 'server_error' } }, 'GET /api/me': NOT_SIGNED_IN });
    await assert.rejects(() => joinScreen({ params: { token: TOKEN } }));
  });
});

describe('home: an interrupted join is offered again', () => {
  const trips = { 'GET /api/trips': [] };

  test('shows a "Continue joining" card pointing at the remembered link; Dismiss forgets it', async () => {
    mockApi(trips);
    rememberPendingInvite(TOKEN);
    const node = mount(await homeScreen(ME));
    const card = node.querySelector('[data-testid="pending-invite"]');
    assert.ok(card);
    assert.equal(card.querySelector('a.cta').getAttribute('href'), `/join/${TOKEN}`);
    [...card.querySelectorAll('button')].find((b) => /Dismiss/.test(b.textContent)).click();
    assert.equal(node.querySelector('[data-testid="pending-invite"]'), null);
    assert.equal(window.localStorage.getItem('crew_pending_invite'), null);
  });

  test('nothing shown without a remembered link, and a malformed stored value is ignored', async () => {
    mockApi(trips);
    assert.equal(mount(await homeScreen(ME)).querySelector('[data-testid="pending-invite"]'), null);
    window.localStorage.setItem('crew_pending_invite', '<script>alert(1)</script>');
    assert.equal(mount(await homeScreen(ME)).querySelector('[data-testid="pending-invite"]'), null);
  });
});

describe('welcome (B04)', () => {
  test('lists who is in and who is still pending (expired invites are not listed as pending)', async () => {
    mockApi({
      [`GET /api/trips/${TRIP}`]: {
        trip: { name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23' },
        members: [
          { user_id: 'org', display_name: 'Chris Mathew', role: 'organiser' },
          { user_id: ME.id, display_name: ME.display_name, role: 'member' },
        ],
      },
      [`GET /api/trips/${TRIP}/invitations`]: [
        { invitee_name: 'Manas', state: 'valid' },
        { invitee_name: 'Old Link', state: 'expired' },
        { invitee_name: 'Saqeeb', state: 'used' },
      ],
    });
    const node = mount(await welcomeScreen(ME, { params: { id: TRIP } }));
    const t = text(node);
    assert.match(t, /You're in, Saqeeb!/);
    assert.match(t, /Chris Mathew.*In/);
    assert.match(t, /Manas.*Pending/);
    assert.ok(!t.includes('Old Link'));
    assert.equal(node.querySelectorAll('.badge.yes').length, 2);
    assert.equal(node.querySelector('a.cta').getAttribute('href'), `/trips/${TRIP}/preferences`);
    assert.match(t, /Only the crew average is ever shown/);
  });
});

describe('waiting (B06)', () => {
  const member = (id, name, role, pref, budget) => ({ user_id: id, display_name: name, role, has_preferences: pref, has_budget: budget });
  let fixture;
  const route = () => mockApi({ [`GET /api/trips/${TRIP}`]: () => fixture });

  test('shows real progress from what people have saved, and refreshes by itself', async () => {
    fixture = {
      trip: { expected_size: 4 },
      members: [member('org', 'Chris', 'organiser', true, true), member(ME.id, 'Saqeeb', 'member', true, true), member('c', 'Manas', 'member', true, false)],
    };
    const calls = route();
    const node = mount(await waitingScreen(ME, { params: { id: TRIP }, pollMs: 20 }));
    assert.match(text(node.querySelector('[data-testid="progress-count"]')), /^2 of 4 done$/);
    assert.equal(node.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '50');
    assert.match(text(node), /Manas.*In progress/);
    assert.match(text(node.querySelector('[data-testid="waiting-headline"]')), /waiting for the rest/);
    assert.ok(!/plan is ready|generating/i.test(text(node)), 'makes no promise about a plan that does not exist yet');

    fixture = { ...fixture, members: fixture.members.map((m) => ({ ...m, has_preferences: true, has_budget: true })) };
    await tick(80);
    assert.match(text(node.querySelector('[data-testid="progress-count"]')), /^3 of 4 done$/);
    assert.match(text(node.querySelector('[data-testid="waiting-headline"]')), /Everyone who has joined/);

    node.remove(); // router replaced the screen: polling must stop
    await tick(60);
    const after = calls.length;
    await tick(80);
    assert.equal(calls.length, after, 'no requests once the screen is gone');
  });
});

describe('invite the crew (A09)', () => {
  const ORG = { user_id: ME.id, display_name: 'Chris Mathew', role: 'organiser' };
  let invites;
  const setup = (overrides = {}) => {
    invites = [
      { id: 'i1', invitee_name: 'Manas', state: 'valid' },
      { id: 'i2', invitee_name: 'Rahul', state: 'expired' },
      { id: 'i3', invitee_name: 'Aisha', state: 'used' },
    ];
    return mockApi({
      [`GET /api/trips/${TRIP}`]: { is_organiser: true, trip: { name: 'Goa gang' }, members: [ORG, { user_id: 'u3', display_name: 'Aisha Khan', role: 'member' }] },
      [`GET /api/trips/${TRIP}/invitations`]: () => invites,
      [`POST /api/trips/${TRIP}/invitations`]: ({ body }) => {
        invites.push({ id: 'i4', invitee_name: body.invitee_name, state: 'valid' });
        return { invitation: { id: 'i4', invitee_name: body.invitee_name, state: 'valid' }, link: `http://localhost:3003/join/${'N'.repeat(32)}` };
      },
      [`POST /api/trips/${TRIP}/invitations/i1/replace`]: { invitation: { id: 'i5', invitee_name: 'Manas', state: 'valid' }, link: `http://localhost:3003/join/${'R'.repeat(32)}` },
      [`POST /api/trips/${TRIP}/invitations/i1/revoke`]: () => {
        invites = invites.filter((i) => i.id !== 'i1');
        return { ok: true };
      },
      ...overrides,
    });
  };
  const open = async () => mount(await inviteScreen(ME, { params: { id: TRIP } }));
  const byText = (node, tag, re) => [...node.querySelectorAll(tag)].find((el) => re.test(el.textContent));

  test('lists joined members and pending/expired invites with the right actions', async () => {
    setup();
    const node = await open();
    const rows = [...node.querySelectorAll('.crewrow')].map(text);
    assert.equal(rows.length, 4); // 2 joined + Manas + Rahul; Aisha's used invite is not repeated
    assert.ok(rows.some((r) => /Chris Mathew.*Organiser.*Joined/.test(r)));
    assert.ok(rows.some((r) => /Manas.*Pending.*New link.*Cancel/.test(r)));
    assert.ok(rows.some((r) => /Rahul.*Expired.*New link/.test(r) && !/Cancel/.test(r)));
    assert.match(text(node), /Email invites aren't set up yet/);
  });

  test('creating an invite shows the one-time link, refreshes the list, and never stores the link', async () => {
    const calls = setup();
    const node = await open();
    node.querySelector('#invitee_name').value = '  Tester  ';
    node.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(40);
    const post = calls.find((c) => c.method === 'POST' && c.path === `/api/trips/${TRIP}/invitations`);
    assert.deepEqual(post.body, { invitee_name: '  Tester  ' }, 'the server trims; the client sends what was typed');
    const linkInput = node.querySelector('.linkrow input');
    assert.equal(linkInput.value, `http://localhost:3003/join/${'N'.repeat(32)}`);
    assert.match(text(node), /Shown once/);
    assert.ok([...node.querySelectorAll('.crewrow')].some((r) => /Tester.*Pending/.test(text(r))), 'new invite appears in the list');
    for (let i = 0; i < window.localStorage.length; i += 1) {
      assert.ok(!window.localStorage.getItem(window.localStorage.key(i)).includes('NNNN'), 'the link is never persisted');
    }
  });

  test('an empty name is rejected on the client without calling the API', async () => {
    const calls = setup();
    const node = await open();
    node.querySelector('#invitee_name').value = '   ';
    node.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(20);
    assert.match(text(node.querySelector('.err')), /Enter your friend's name/);
    assert.ok(!calls.some((c) => c.method === 'POST'));
  });

  test('"New link" replaces and shows the new link; "Cancel" removes the invite', async () => {
    setup();
    const node = await open();
    byText(node, 'button', /New link/).click(); // first match is Manas
    await tick(40);
    assert.equal(node.querySelector('.linkrow input').value, `http://localhost:3003/join/${'R'.repeat(32)}`);
    assert.match(text(node.querySelector('.card[role="status"]')), /Link for Manas/);

    byText(node, 'button', /Cancel/).click();
    await tick(40);
    assert.ok(![...node.querySelectorAll('.crewrow')].some((r) => /Manas/.test(text(r))), 'cancelled invite disappears');
    assert.equal(node.querySelector('.card[role="status"]'), null, 'its link card is dropped too');
  });

  test('API failures (e.g. invites not configured) are shown, not swallowed', async () => {
    setup({ [`POST /api/trips/${TRIP}/invitations`]: { status: 503, body: { error: 'invites_unavailable', message: 'Invites are not set up on this server yet.' } } });
    const node = await open();
    node.querySelector('#invitee_name').value = 'Tester';
    node.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(40);
    assert.match(text(node.querySelector('.err')), /not set up on this server yet/);
    assert.equal(node.querySelector('.linkrow'), null);
  });

  test('a non-organiser is sent back to the trip instead of seeing organiser tools', async () => {
    setup({ [`GET /api/trips/${TRIP}`]: { is_organiser: false, trip: { name: 'Goa gang' }, members: [ORG] } });
    resetDom(`/trips/${TRIP}/invite`);
    const result = await inviteScreen(ME, { params: { id: TRIP } });
    assert.equal(result, undefined);
    await tick(20);
    assert.equal(window.location.pathname, `/trips/${TRIP}`);
  });
});
