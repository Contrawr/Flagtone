import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeDuel, decodeDuel, duelUrl, duelOutcome } from '../js/duel.js';

const duel = { pool: 'medium', seed: 'k3j9x', codes: ['pe', 'hu', 'cl', 'is', 'th'], percents: [91, 80, 64, 100, 0] };

test('a duel survives the round trip through a link', () => {
  assert.deepEqual(decodeDuel(encodeDuel(duel)), duel);
  const url = duelUrl('https://example.com/flagtone/', duel);
  assert.match(url, /^https:\/\/example\.com\/flagtone\/\?duel=[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeDuel(new URL(url).searchParams.get('duel')), duel);
});

test('malformed or tampered duels are rejected', () => {
  const bad = (patch) => decodeDuel(encodeDuel({ ...duel, ...patch }));
  assert.equal(decodeDuel(''), null);
  assert.equal(decodeDuel('not-base64!'), null);
  assert.equal(decodeDuel(btoa('{"v":2}')), null);
  assert.equal(bad({ pool: 'mars' }), null);
  assert.equal(bad({ seed: '<script>' }), null);
  assert.equal(bad({ codes: ['pe', 'hu', 'cl', 'is', 'zz'] }), null);
  assert.equal(bad({ codes: ['pe', 'pe', 'cl', 'is', 'th'] }), null);
  assert.equal(bad({ percents: [1, 2, 3, 4, 101] }), null);
  assert.equal(bad({ percents: [1, 2, 3, 4] }), null);
});

test('duel outcome by average', () => {
  assert.deepEqual(duelOutcome([90, 90, 90, 90, 90], duel.percents), { me: 90, them: 67, result: 'win' });
  assert.equal(duelOutcome([0, 0, 0, 0, 0], duel.percents).result, 'loss');
  assert.equal(duelOutcome(duel.percents, duel.percents).result, 'draw');
});
