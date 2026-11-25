import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { crewIdentity, dateRange, firstName, initial, inr, nights } from '../../public/js/lib/format.js';

const crew = (...names) => names.map((display_name, i) => ({ user_id: `u${i}`, display_name }));
const pick = (map, i) => map.get(`u${i}`);

describe('crewIdentity (#38: same-name members stay distinguishable)', () => {
  test('unique first names stay simple: first name and one-letter initials', () => {
    const ids = crewIdentity(crew('Chris Mathew', 'Saqeeb Chand', 'Manas Kothari'));
    assert.deepEqual([0, 1, 2].map((i) => pick(ids, i).short), ['Chris', 'Saqeeb', 'Manas']);
    assert.deepEqual([0, 1, 2].map((i) => pick(ids, i).initials), ['C', 'S', 'M']);
    assert.equal(pick(ids, 0).name, 'Chris Mathew');
  });

  test('the bug: "QA Alpha" and "QA Beta" no longer both render as "QA"', () => {
    const ids = crewIdentity(crew('QA Alpha', 'QA Beta'));
    assert.deepEqual([0, 1].map((i) => pick(ids, i).short), ['QA A.', 'QA B.']);
    assert.deepEqual([0, 1].map((i) => pick(ids, i).initials), ['QA', 'QB']);
    assert.notEqual(pick(ids, 0).initials, pick(ids, 1).initials);
    assert.notEqual(pick(ids, 0).short, pick(ids, 1).short);
  });

  test('grouping ignores case and surrounding spaces', () => {
    const ids = crewIdentity(crew('  sam  lee ', 'SAM Park'));
    assert.deepEqual([0, 1].map((i) => pick(ids, i).initials), ['SL', 'SP']);
  });

  test('a single-word name next to a same-first-name colleague still differs from them', () => {
    const ids = crewIdentity(crew('Sam', 'Sam Lee'));
    assert.equal(pick(ids, 0).initials, 'S');
    assert.equal(pick(ids, 1).initials, 'SL');
  });

  test('exactly identical full names get a numeric suffix so lists are never ambiguous', () => {
    const ids = crewIdentity(crew('Sam Lee', 'Sam Lee', 'Sam Lee'));
    assert.deepEqual([0, 1, 2].map((i) => pick(ids, i).name), ['Sam Lee', 'Sam Lee (2)', 'Sam Lee (3)']);
  });

  test('empty or missing names fall back safely and never print "undefined" or "null"', () => {
    const ids = crewIdentity([{ user_id: 'a', display_name: null }, { user_id: 'b', display_name: '   ' }, { user_id: 'c' }]);
    for (const id of ['a', 'b', 'c']) {
      const v = ids.get(id);
      assert.ok(!/null|undefined/.test(`${v.name} ${v.short} ${v.initials}`), id);
      assert.ok(v.initials.length >= 1);
    }
  });

  test('works with other id/name shapes (e.g. pending invitees)', () => {
    const ids = crewIdentity([{ id: 'x', invitee_name: 'Aisha K' }, { id: 'y', invitee_name: 'Aisha M' }], (p) => p.id, (p) => p.invitee_name);
    assert.deepEqual([ids.get('x').initials, ids.get('y').initials], ['AK', 'AM']);
  });

  test('an empty crew is fine', () => {
    assert.equal(crewIdentity([]).size, 0);
  });
});

describe('other format helpers', () => {
  test('inr formats paise in the Indian grouping', () => {
    assert.equal(inr(800000), '₹8,000');
    assert.equal(inr(12345600), '₹1,23,456');
  });
  test('nights and dateRange never produce NaN/undefined', () => {
    assert.equal(nights('2026-12-20', '2026-12-23'), 3);
    assert.equal(nights(null, '2026-12-23'), null);
    assert.equal(nights('2026-12-23', '2026-12-20'), null);
    for (const [a, b] of [[null, null], ['2026-12-20', null], [null, '2026-12-23'], ['2026-12-20', '2026-12-23']]) {
      assert.ok(!/NaN|undefined|null/.test(dateRange(a, b)), `${a}/${b}`);
    }
    assert.equal(dateRange(null, null), 'Dates not set');
  });
  test('firstName and initial fall back sanely', () => {
    assert.equal(firstName('  Chris Mathew '), 'Chris');
    assert.equal(firstName(''), 'there');
    assert.equal(initial(''), '?');
  });
});
