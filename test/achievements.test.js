import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, newlyUnlocked } from '../js/achievements.js';
import { FLAGS } from '../js/flags.js';

const base = { stats: { games: 0, flags: 0, perfects: 0, percentSum: 0 }, collection: {}, streak: 0, maxCombo: 0, duelWins: 0, game: null, result: null, finished: false };
const ids = (ctx, unlocked = {}) => newlyUnlocked({ ...base, ...ctx }, unlocked).map((a) => a.id);

test('badges have unique ids and descriptions', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) assert.ok(a.icon && a.name && a.desc, a.id);
});

test('nothing is unlocked at the start', () => {
  assert.deepEqual(ids({}), []);
});

test('badges unlock from stats, combos and single rounds, once', () => {
  assert.deepEqual(ids({ stats: { ...base.stats, games: 1, perfects: 1 } }), ['first-game', 'first-perfect']);
  assert.deepEqual(ids({ stats: { ...base.stats, games: 1 } }, { 'first-game': '2026-10-12' }), []);
  assert.deepEqual(ids({ maxCombo: 6 }), ['combo-3', 'combo-6']);
  assert.deepEqual(ids({ result: { code: 'tv', percent: 90 } }), ['impossible-great']);
  assert.deepEqual(ids({ result: { code: 'fr', percent: 97, parts: [{}, {}] } }), ['two-color-perfect']);
});

test('game badges need the right mode and a finished game', () => {
  const daily = { mode: 'daily', average: 90, results: Array(5).fill({ percent: 90 }) };
  assert.deepEqual(ids({ game: daily, finished: false }), []);
  assert.deepEqual(ids({ game: daily, finished: true }), ['daily-1', 'daily-great']);
  assert.deepEqual(ids({ game: { mode: 'classic', average: 92, results: [] }, finished: true }), ['classic-90']);
  assert.deepEqual(ids({ game: { mode: 'timed', points: 1200, results: [] } }), ['timed-500', 'timed-1000']);
  assert.deepEqual(ids({ game: { mode: 'endless', results: Array(12).fill({}) } }), ['endless-10']);
});

test('collection badges', () => {
  const oceania = Object.fromEntries(FLAGS.filter((f) => f.region === 'oceania').map((f) => [f.code, 80]));
  assert.deepEqual(ids({ collection: oceania }), ['collect-region']);
  const all = Object.fromEntries(FLAGS.map((f) => [f.code, 80]));
  assert.deepEqual(ids({ collection: all }), ['collect-50', 'collect-region', 'collect-all']);
});
