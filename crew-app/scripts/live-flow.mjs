// Live end-to-end check against a RUNNING server and the REAL Supabase project.
// Logs in as two pre-created test users (see .env.test.example). Creates ONE trip owned by user A;
// prints its id so it can be deleted afterwards. No signup, no emails.
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

// ---- login
let r = await A.call('POST', '/api/auth/login', { email: emailA, password: 'definitely-wrong-1' });
check('wrong password gives the generic 401', r.status === 401 && r.data?.message === 'Invalid email or password.', JSON.stringify(r));
r = await A.call('POST', '/api/auth/login', { email: emailA, password: pwA });
check('login A', r.status === 200, JSON.stringify(r));
if (r.status !== 200) process.exit(2);
r = await B.call('POST', '/api/auth/login', { email: emailB, password: pwB });
check('login B', r.status === 200, JSON.stringify(r));
if (r.status !== 200) process.exit(2);

r = await A.call('GET', '/api/me');
check('GET /api/me returns the profile created by the DB trigger', r.status === 200 && !!r.data?.display_name && r.data.email === emailA.toLowerCase(), JSON.stringify(r));
const meB = (await B.call('GET', '/api/me')).data;

// ---- A: trip, prefs, budget, basics
r = await A.call('POST', '/api/trips', {});
check('create trip (default name)', r.status === 201 && r.data?.name === 'Our trip', JSON.stringify(r));
const tripId = r.data?.id;
if (!tripId) process.exit(2);
console.log(`TRIP_ID=${tripId}`);

r = await A.call('PUT', `/api/trips/${tripId}/preferences`, { interests: ['Beaches', 'Seafood'], vibe: 'chill', stay_styles: ['Hostel'], must_visit: 'Dudhsagar Falls' });
check('save preferences', r.status === 200, JSON.stringify(r));
r = await A.call('PUT', `/api/trips/${tripId}/budget`, { amount_rupees: 8000 });
check('save budget 8000 rupees', r.status === 200, JSON.stringify(r));
r = await A.call('PATCH', `/api/trips/${tripId}`, { name: 'Goa gang', destination: 'Goa', start_date: '2026-12-20', end_date: '2026-12-23', expected_size: 4, notes: 'Live test' });
check('save trip basics; custom trip name is stored', r.status === 200 && r.data?.name === 'Goa gang' && r.data.expected_size === 4, JSON.stringify(r));
r = await A.call('PATCH', `/api/trips/${tripId}`, { start_date: '2026-12-23', end_date: '2026-12-20' });
check('reversed dates are rejected (400)', r.status === 400, JSON.stringify(r));

r = await A.call('GET', `/api/trips/${tripId}`);
const d = r.data;
check('trip detail: organiser, 1 member, budget stored in paise', r.status === 200 && d.is_organiser && d.members.length === 1 && d.my_budget_minor === 800000, JSON.stringify({ s: r.status, org: d?.is_organiser, m: d?.members?.length, b: d?.my_budget_minor }));
check('crew budget with only my own submission: my average, 1 of 4', d?.crew_budget?.average_minor === 800000 && d.crew_budget.submitted === 1 && d.crew_budget.expected === 4, JSON.stringify(d?.crew_budget));
check('my preferences round-trip', JSON.stringify(d?.my_preferences?.interests) === '["Beaches","Seafood"]' && d.my_preferences.vibe === 'chill', JSON.stringify(d?.my_preferences));
check('crew progress shows preferences and budget saved', d?.members?.[0]?.has_preferences === true && d.members[0].has_budget === true, JSON.stringify(d?.members));
r = await A.call('GET', '/api/trips');
check('list trips includes it with member_count 1', r.status === 200 && r.data.some((t) => t.id === tripId && t.member_count === 1), JSON.stringify(r.data?.map?.((t) => [t.name, t.member_count])));

// ---- B must not reach A's trip
r = await B.call('GET', `/api/trips/${tripId}`);
check("B cannot read A's trip (404)", r.status === 404, String(r.status));
r = await B.call('PATCH', `/api/trips/${tripId}`, { name: 'hijacked' });
check("B cannot edit A's trip (404)", r.status === 404, String(r.status));
r = await B.call('PUT', `/api/trips/${tripId}/budget`, { amount_rupees: 1 });
check("B cannot write a budget into A's trip", [400, 403, 404].includes(r.status), String(r.status));
r = await B.call('PUT', `/api/trips/${tripId}/preferences`, { interests: [], vibe: null, stay_styles: [], must_visit: null });
check("B cannot write preferences into A's trip", [400, 403, 404].includes(r.status), String(r.status));
r = await B.call('GET', '/api/trips');
check("B's trip list does not include A's trip", r.status === 200 && !r.data.some((t) => t.id === tripId), JSON.stringify(r.data?.map?.((t) => t.name)));
r = await A.call('GET', `/api/trips/${tripId}`);
check("A's trip is unchanged after B's attempts", r.data?.trip?.name === 'Goa gang' && r.data.crew_budget.submitted === 1, JSON.stringify(r.data?.crew_budget));

// ---- sessions
const A2 = new Client();
r = await A2.call('POST', '/api/auth/login', { email: emailA, password: pwA });
check('second login for A', r.status === 200, JSON.stringify(r));
await A2.call('POST', '/api/auth/logout');
r = await A2.call('GET', '/api/me');
check('after logout /api/me is 401', r.status === 401, JSON.stringify(r));
r = await A.call('GET', '/api/me');
check('logging out one client does not end the other session', r.status === 200, JSON.stringify(r));

const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${meB ? '' : ''}`);
console.log(`Clean up afterwards: delete trip ${tripId}`);
process.exit(failed ? 1 : 0);
