import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../server/config.js';
import { parseCookies } from '../server/lib/cookies.js';
import { minorToRupees, rupeesToMinor, splitEqual } from '../server/lib/money.js';
import { createLimiter } from '../server/lib/ratelimit.js';
import { budgetSchema, preferencesSchema, tripBasicsSchema } from '../server/schemas.js';

const validEnv = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' };

test('money: rupees <-> paise with no float drift', () => {
  assert.equal(rupeesToMinor(8000), 800000);
  assert.equal(rupeesToMinor(0.1 + 0.2), 30); // 0.30000000000000004 rupees -> 30 paise
  assert.equal(minorToRupees(1250), 12.5);
  assert.throws(() => rupeesToMinor(NaN), RangeError);
  assert.throws(() => rupeesToMinor('5'), RangeError);
});

test('money: equal split always sums to the total', () => {
  const shares = splitEqual(100000, ['a', 'b', 'c']); // 1000.00 / 3
  assert.deepEqual(shares.map((s) => s.share_minor), [33334, 33333, 33333]);
  assert.equal(shares.reduce((n, s) => n + s.share_minor, 0), 100000);
  assert.deepEqual(splitEqual(1000, ['a', 'b']).map((s) => s.share_minor), [500, 500]);
  assert.deepEqual(splitEqual(1, ['a', 'b', 'c']).map((s) => s.share_minor), [1, 0, 0]);
  assert.throws(() => splitEqual(100, []), RangeError);
  assert.throws(() => splitEqual(100, ['a', 'a']), RangeError);
  assert.throws(() => splitEqual(-1, ['a']), RangeError);
  assert.throws(() => splitEqual(1.5, ['a']), RangeError);
});

test('cookies: parse, including malformed values', () => {
  assert.deepEqual(parseCookies('a=1; b=two%20words; c'), { a: '1', b: 'two words' });
  assert.deepEqual(parseCookies('x=%E0%A4%A'), { x: '%E0%A4%A' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('rate limiter: blocks after max, recovers after window', () => {
  const limiter = createLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limiter.hit('k', 0).ok, true);
  assert.equal(limiter.hit('k', 1).ok, true);
  const blocked = limiter.hit('k', 2);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(limiter.hit('other', 2).ok, true);
  assert.equal(limiter.hit('k', 1001).ok, true);
});

test('config: valid, defaults, and clear errors', () => {
  const cfg = loadConfig({ ...validEnv });
  assert.equal(cfg.port, 3003);
  assert.equal(cfg.serviceKey, null);
  assert.equal(cfg.cookieSecure, false);

  assert.throws(() => loadConfig({}), /SUPABASE_URL is required[\s\S]*SUPABASE_ANON_KEY is required/);
  assert.throws(() => loadConfig({ ...validEnv, SUPABASE_URL: 'http://insecure' }), /https/);
  assert.throws(() => loadConfig({ ...validEnv, PORT: 'abc' }), /PORT/);
  assert.throws(
    () => loadConfig({ ...validEnv, COOKIE_SECURE: '1', CREW_PUBLIC_URL: 'http://x.com' }),
    /COOKIE_SECURE=1 requires/,
  );
  assert.equal(loadConfig({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: ' s ' }).serviceKey, 's');
});

test('schema: trip basics validation', () => {
  assert.ok(tripBasicsSchema.safeParse({ name: 'Goa gang', start_date: '2026-12-20', end_date: '2026-12-23' }).success);
  assert.ok(!tripBasicsSchema.safeParse({ start_date: '2026-12-23', end_date: '2026-12-20' }).success);
  assert.ok(!tripBasicsSchema.safeParse({ start_date: '2026-13-40' }).success);
  assert.ok(!tripBasicsSchema.safeParse({ expected_size: 0 }).success);
  assert.ok(!tripBasicsSchema.safeParse({ expected_size: 21 }).success);
  assert.ok(!tripBasicsSchema.safeParse({}).success, 'empty update is rejected');
  assert.ok(!tripBasicsSchema.safeParse({ name: '  ' }).success, 'blank name is rejected');
  assert.ok(!tripBasicsSchema.safeParse({ organiser_id: 'x', name: 'a' }).success, 'unknown fields are rejected');
});

test('schema: preferences and budget validation', () => {
  const good = { interests: ['Beaches'], vibe: 'chill', stay_styles: ['Hostel'], must_visit: null };
  assert.ok(preferencesSchema.safeParse(good).success);
  assert.ok(!preferencesSchema.safeParse({ ...good, interests: ['Skydiving'] }).success);
  assert.ok(!preferencesSchema.safeParse({ ...good, vibe: 'wild' }).success);
  assert.ok(budgetSchema.safeParse({ amount_rupees: 8000 }).success);
  assert.ok(!budgetSchema.safeParse({ amount_rupees: 0 }).success);
  assert.ok(!budgetSchema.safeParse({ amount_rupees: -5 }).success);
  assert.ok(!budgetSchema.safeParse({ amount_rupees: 1e12 }).success);
  assert.ok(!budgetSchema.safeParse({ amount_rupees: '8000' }).success);
});
