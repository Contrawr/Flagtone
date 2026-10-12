import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, shiftDay, dailyNumber, seededRandom, dailyCodes, dailyRoundRandom, DAILY_TIERS } from '../js/daily.js';
import { flagByCode } from '../js/flags.js';

test('dateKey uses the local calendar date', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dateKey(new Date(2026, 9, 9, 0, 1)), '2026-10-09');
});

test('shiftDay crosses month and year boundaries', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
});

test('dailyNumber counts from the first Daily', () => {
  assert.equal(dailyNumber('2026-10-09'), 1);
  assert.equal(dailyNumber('2026-10-10'), 2);
  assert.equal(dailyNumber('2027-10-09'), 366);
});

test('seededRandom is deterministic per seed and stays in [0, 1)', () => {
  const a = seededRandom('x');
  const b = seededRandom('x');
  const c = seededRandom('y');
  const seqA = Array.from({ length: 50 }, a);
  assert.deepEqual(seqA, Array.from({ length: 50 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, c));
  for (const x of seqA) assert.ok(x >= 0 && x < 1);
});

test('dailyCodes: same flags all day, one per tier slot, no repeats', () => {
  assert.deepEqual(dailyCodes('2026-10-09'), dailyCodes('2026-10-09'));
  assert.notDeepEqual(dailyCodes('2026-10-09'), dailyCodes('2026-10-10'));
  for (let i = 0; i < 400; i++) {
    const codes = dailyCodes(shiftDay('2026-10-09', i));
    assert.equal(new Set(codes).size, 5);
    assert.deepEqual(codes.map((c) => flagByCode(c).tier), DAILY_TIERS);
  }
});

test('dailyRoundRandom differs per flag and per day', () => {
  assert.equal(dailyRoundRandom('2026-10-09', 'fr')(), dailyRoundRandom('2026-10-09', 'fr')());
  assert.notEqual(dailyRoundRandom('2026-10-09', 'fr')(), dailyRoundRandom('2026-10-09', 'de')());
  assert.notEqual(dailyRoundRandom('2026-10-09', 'fr')(), dailyRoundRandom('2026-10-10', 'fr')());
});

test('the Daily seed reproduces the per-round generator', async () => {
  const { dailySeed } = await import('../js/daily.js');
  assert.equal(seededRandom(`${dailySeed('2026-10-09')}:fr`)(), dailyRoundRandom('2026-10-09', 'fr')());
});
