// Live two-user invite/join check against a RUNNING server and the REAL Supabase project.
// Needs SUPABASE_SERVICE_ROLE_KEY in the server's .env and two pre-created users in .env.test.
// Creates ONE trip owned by user A and prints its id for cleanup. No emails are sent.
import { existsSync } from 'node:fs';

if (existsSync('.env.test')) process.loadEnvFile('.env.test');
const need = ['TEST_EMAIL_A', 'TEST_PASSWORD_A', 'TEST_EMAIL_B', 'TEST_PASSWORD_B'];
const missing = need.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`Missing in .env.test: ${missing.join(', ')}`);
  process.exit(2);
}
const BASE = process.env.TEST_BASE_URL?.trim() || 'http://localhost:3003';
const { TEST_EMAIL_A: emailA, TEST_PASSWORD_A: pwA, TEST_EMAIL_B: emailB, TEST_PASSWORD_B: pwB } = process.env;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
};

class Client {
  jar = {};
  async call(method, path, body) {
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (v === '' || /Expires=Thu, 01 Jan 1970/i.test(c)) delete this.jar[k];
      else this.jar[k] = v;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    return { status: res.status, data };
  }
}
const A = new Client();
const B = new Client();
const anon = new Client();
const tokenOf = (link) => link.split('/join/')[1];

let r = await A.call('POST', '/api/auth/login', { email: emailA, password: pwA });
if (r.status !== 200) { console.error('login A failed', r.status); process.exit(2); }
r = await B.call('POST', '/api/auth/login', { email: emailB, password: pwB });
if (r.status !== 200) { console.error('login B failed', r.status); process.exit(2); }

r = await A.call('POST', '/api/trips', { name: 'Invite flow test' });
const tripId = r.data?.id;
check('A creates a trip', r.status === 201 && !!tripId, JSON.stringify(r));
if (!tripId) process.exit(2);
console.log(`TRIP_ID=${tripId}`);
await A.call('PATCH', `/api/trips/${tripId}`, { destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', expected_size: 4 });
r = await A.call('PUT', `/api/trips/${tripId}/budget`, { amount_rupees: 8000 });
check('A saves a budget of 8000 rupees', r.status === 200);

// ---- create + replace
r = await A.call('POST', `/api/trips/${tripId}/invitations`, { invitee_name: 'Tester B' });
if (r.status === 503) {
  console.error('\nInvites are not configured on the server (SUPABASE_SERVICE_ROLE_KEY missing). Set it in .env and restart.');
  console.log(`Clean up afterwards: delete trip ${tripId}`);
  process.exit(3);
}
check('A creates an invite; the link is returned once', r.status === 201 && /\/join\/[A-Za-z0-9_-]{32}$/.test(r.data?.link ?? ''), JSON.stringify(r));
const first = r.data;
const tok1 = tokenOf(first.link);
check('the response never contains token_hash or an email', !JSON.stringify(first).includes('token_hash') && !('email' in first.invitation));

r = await A.call('GET', `/api/trips/${tripId}/invitations`);
check('A sees the invite as Pending', r.status === 200 && r.data.length === 1 && r.data[0].state === 'valid' && r.data[0].invitee_name === 'Tester B', JSON.stringify(r));
check('the list does not expose token_hash or email', !JSON.stringify(r.data).includes('token_hash') && !JSON.stringify(r.data).includes('email":'));

r = await anon.call('GET', `/api/invitations/${tok1}`);
check('anonymous landing: valid, organiser first name, trip name, destination, dates, crew size 1', r.status === 200 && r.data.state === 'valid' && !!r.data.organiser && r.data.trip?.name === 'Invite flow test' && r.data.trip.destination === 'Goa' && r.data.crew_in === 1, JSON.stringify(r));
const landing = JSON.stringify(r.data);
check('anonymous landing exposes no budget, no email, no ids', !/budget|email|amount|_id|"id"/i.test(landing), landing);

r = await A.call('POST', `/api/trips/${tripId}/invitations/${first.invitation.id}/replace`);
check('A replaces the link: a different token comes back', r.status === 201 && tokenOf(r.data.link) !== tok1, JSON.stringify(r));
const second = r.data;
const tok2 = tokenOf(second.link);
r = await anon.call('GET', `/api/invitations/${tok1}`);
check('the OLD link is dead immediately (revoked)', r.data?.state === 'revoked', JSON.stringify(r));
r = await B.call('POST', `/api/invitations/${tok1}/accept`);
check('B cannot join with the old link (410)', r.status === 410 && r.data?.error === 'invite_revoked', JSON.stringify(r));
r = await anon.call('GET', '/api/invitations/not-a-real-token-at-all-00000000');
check('garbage token: invalid, reveals nothing', r.data?.state === 'invalid' && Object.keys(r.data).sort().join() === 'message,state', JSON.stringify(r));
r = await anon.call('POST', `/api/invitations/${tok2}/accept`);
check('accepting without a session is 401', r.status === 401, JSON.stringify(r));

// ---- B joins
r = await B.call('POST', `/api/invitations/${tok2}/accept`);
check('B joins with the new link', r.status === 200 && r.data?.trip_id === tripId && r.data.already_member === false, JSON.stringify(r));
r = await B.call('POST', `/api/invitations/${tok2}/accept`);
check('B opening the link again gets "already a member"', r.status === 200 && r.data?.already_member === true, JSON.stringify(r));
r = await anon.call('GET', `/api/invitations/${tok2}`);
check('the used link now reports used', r.data?.state === 'used', JSON.stringify(r));
r = await A.call('POST', `/api/invitations/${tok2}/accept`);
check('the organiser opening it gets "already a member"', r.status === 200 && r.data?.already_member === true, JSON.stringify(r));

// ---- B as a member
r = await B.call('GET', `/api/trips/${tripId}`);
const bView = r.data;
check('B can now read the trip as a non-organiser, 2 members', r.status === 200 && bView.is_organiser === false && bView.members.length === 2, JSON.stringify({ s: r.status, org: bView?.is_organiser, m: bView?.members?.length }));
check("PRIVACY: A is the only one who shared; B must NOT see A's number", bView?.crew_budget?.average_minor === null && bView.crew_budget.submitted === 1 && !JSON.stringify(bView).includes('800000'), JSON.stringify(bView?.crew_budget));
check("B's progress shows A done, B waiting (no values)", bView?.members?.some((m) => m.has_budget && m.role === 'organiser') && bView.members.some((m) => !m.has_budget && m.role === 'member'), JSON.stringify(bView?.members));
r = await B.call('PATCH', `/api/trips/${tripId}`, { name: 'B takes over' });
check('B (member) cannot edit the trip (404)', r.status === 404, String(r.status));
r = await B.call('POST', `/api/trips/${tripId}/invitations`, { invitee_name: 'Sneaky' });
check('B (member) cannot create invites (404)', r.status === 404, String(r.status));
r = await B.call('POST', `/api/trips/${tripId}/invitations/${second.invitation.id}/replace`);
check('B (member) cannot replace invites (404)', r.status === 404, String(r.status));
r = await B.call('GET', `/api/trips/${tripId}/invitations`);
check('B can list invitees but never sees tokens or emails', r.status === 200 && !JSON.stringify(r.data).includes('token_hash') && !JSON.stringify(r.data).includes('email":'), JSON.stringify(r));

r = await B.call('PUT', `/api/trips/${tripId}/preferences`, { interests: ['Cafes'], vibe: 'balanced', stay_styles: ['Hostel'], must_visit: null });
check('B saves preferences', r.status === 200, JSON.stringify(r));
r = await B.call('PUT', `/api/trips/${tripId}/budget`, { amount_rupees: 5000 });
check('B saves a personal budget of 5000 rupees', r.status === 200, JSON.stringify(r));

// ---- budget average with two submissions
r = await B.call('GET', `/api/trips/${tripId}`);
check('B now sees the AVERAGE (6500 rupees) and 2 of 4, and only their own number', r.data?.crew_budget?.average_minor === 650000 && r.data.crew_budget.submitted === 2 && r.data.crew_budget.expected === 4 && r.data.my_budget_minor === 500000 && !JSON.stringify(r.data).includes('800000'), JSON.stringify({ cb: r.data?.crew_budget, mine: r.data?.my_budget_minor }));
r = await A.call('GET', `/api/trips/${tripId}`);
check("A sees the same average, only A's own number, and not B's 500000 as a field", r.data?.crew_budget?.average_minor === 650000 && r.data.my_budget_minor === 800000 && !JSON.stringify({ ...r.data, crew_budget: null }).includes('500000'), JSON.stringify({ cb: r.data?.crew_budget, mine: r.data?.my_budget_minor }));
check('A sees both members with preferences and budget saved', r.data?.members?.length === 2 && r.data.members.every((m) => m.has_preferences && m.has_budget), JSON.stringify(r.data?.members));
r = await A.call('GET', `/api/trips/${tripId}/invitations`);
check('A sees the invite as used', r.status === 200 && r.data.some((i) => i.state === 'used'), JSON.stringify(r.data));

const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(`Clean up afterwards: delete trip ${tripId}`);
process.exit(failed ? 1 : 0);
