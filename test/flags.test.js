import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS, TIERS, poolFor, flagByCode } from '../js/flags.js';

test('codes are unique two-letter lowercase', () => {
  const codes = FLAGS.map((f) => f.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of codes) assert.match(c, /^[a-z]{2}$/);
});

test('every flag has a name and a valid tier', () => {
  for (const f of FLAGS) {
    assert.ok(f.name.length > 0, f.code);
    assert.ok(TIERS.includes(f.tier), f.code);
  }
});

test('tier sizes', () => {
  assert.equal(poolFor('easy').length, 40);
  assert.equal(poolFor('medium').length, 61);
  assert.equal(poolFor('hard').length, 69);
  assert.equal(poolFor('impossible').length, 27);
  assert.equal(FLAGS.length, 197);
});

test('flagByCode', () => {
  assert.equal(flagByCode('va').name, 'Vatican City');
  assert.equal(flagByCode('zz'), undefined);
});
