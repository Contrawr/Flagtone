import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Records } from '../js/records.js';
import { Game } from '../js/game.js';
import { gradeFor } from '../js/rating.js';

function memoryStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const fixedRate = (guess) => {
  const percent = Number(guess);
  return { deltaE: 0, percent, grade: gradeFor(percent).id };
};

function finished(mode, tier, percents) {
  const game = new Game({ rate: fixedRate });
  game.start(mode, tier, mode === 'daily' ? { codes: ['fr', 'pe', 'hu', 'kz', 'to'] } : {});
  for (const p of percents) game.submit(game.nextFlagCode(), String(p), '#000000');
  return game;
}

test('best scores persist per mode and tier, and only improve', () => {
  const records = new Records(memoryStorage());
  assert.deepEqual(records.finishGame(finished('classic', 'easy', [80, 80, 80, 80, 80])), { isNewBest: true, previousBest: null });
  assert.equal(records.best('classic', 'easy'), 80);
  assert.deepEqual(records.finishGame(finished('classic', 'easy', [50, 50, 50, 50, 50])), { isNewBest: false, previousBest: 80 });
  assert.equal(records.best('classic', 'easy'), 80);
  records.finishGame(finished('endless', 'easy', [90, 10, 10, 10]));
  assert.equal(records.best('endless', 'easy'), 4);
  assert.equal(records.best('endless', 'hard'), null);
});

test('a zero score is never a best', () => {
  const records = new Records(memoryStorage());
  assert.equal(records.finishGame(finished('classic', 'hard', [0, 0, 0, 0, 0])).isNewBest, false);
  assert.equal(records.best('classic', 'hard'), null);
});

test('lifetime stats add up every finished game', () => {
  const records = new Records(memoryStorage());
  assert.deepEqual(records.stats(), { games: 0, flags: 0, perfects: 0, percentSum: 0 });
  records.finishGame(finished('classic', 'easy', [100, 96, 80, 50, 20]));
  records.finishGame(finished('endless', 'easy', [95, 10, 10, 10]));
  assert.deepEqual(records.stats(), { games: 2, flags: 9, perfects: 3, percentSum: 471 });
});

test('the daily keeps progress, has no best, and builds a streak', () => {
  const records = new Records(memoryStorage());
  assert.equal(records.daily('2026-10-09'), null);
  const game = finished('daily', null, [90, 80]);
  records.saveDaily('2026-10-09', game.results, false);
  const saved = records.daily('2026-10-09');
  assert.equal(saved.done, false);
  assert.deepEqual(saved.results.map((r) => r.code), ['fr', 'pe']);
  assert.equal(records.dailyStreak('2026-10-09'), 0);

  const full = finished('daily', null, [90, 80, 70, 60, 50]);
  records.saveDaily('2026-10-09', full.results, true);
  assert.equal(records.finishGame(full).isNewBest, false);
  assert.equal(records.dailyStreak('2026-10-09'), 1);
  records.saveDaily('2026-10-08', full.results, true);
  records.saveDaily('2026-10-06', full.results, true);
  assert.equal(records.dailyStreak('2026-10-09'), 2);
  // Today not played yet: the streak through yesterday still counts.
  assert.equal(records.dailyStreak('2026-10-10'), 2);
  assert.equal(records.dailyStreak('2026-10-11'), 0);
});

test('help is shown once', () => {
  const records = new Records(memoryStorage());
  assert.equal(records.seenHelp, false);
  records.markHelpSeen();
  assert.equal(records.seenHelp, true);
});

test('throwing or corrupt storage does not break anything', () => {
  const throwing = new Records({
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  });
  assert.equal(throwing.finishGame(finished('classic', 'easy', [1, 2, 3, 4, 5])).isNewBest, true);
  assert.equal(throwing.best('classic', 'easy'), null);
  assert.equal(throwing.daily('2026-10-09'), null);

  const storage = memoryStorage();
  storage.data['geopaint:v2:best:classic:easy'] = 'NaN';
  storage.data['geopaint:v2:stats'] = '{not json';
  storage.data['geopaint:v2:daily:2026-10-09'] = '"oops"';
  const corrupt = new Records(storage);
  assert.equal(corrupt.best('classic', 'easy'), null);
  assert.deepEqual(corrupt.stats(), { games: 0, flags: 0, perfects: 0, percentSum: 0 });
  assert.equal(corrupt.daily('2026-10-09'), null);
  assert.equal(new Records(null).best('classic', 'easy'), null);
});
