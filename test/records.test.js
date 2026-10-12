import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Records, migrateStorage } from '../js/records.js';
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

// Rating stub: the match % is the guess's blue channel.
const fixedRate = (guess) => {
  const percent = parseInt(guess.slice(5), 16);
  return { deltaE: 0, percent, grade: gradeFor(percent).id };
};
const guessFor = (percent) => `#0000${percent.toString(16).padStart(2, '0')}`;

function finished(mode, tier, percents) {
  const game = new Game({ rate: fixedRate });
  game.start(mode, tier, mode === 'daily' ? { codes: ['fr', 'pe', 'hu', 'kz', 'to'] } : {});
  for (const p of percents) game.submit(game.nextFlagCode(), guessFor(p), '#000000');
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

test('damaged daily data is ignored instead of breaking a screen', () => {
  const storage = memoryStorage();
  const records = new Records(storage);
  const good = finished('daily', null, [90, 80, 70, 60, 50]).results;
  const put = (value) => { storage.data['flagtone:daily:2026-10-09'] = JSON.stringify(value); };
  put({ done: true, results: [{}] });
  assert.equal(records.daily('2026-10-09'), null);
  put({ done: true, results: good.map((r, i) => (i === 2 ? { ...r, percent: 'x' } : r)) });
  assert.equal(records.daily('2026-10-09'), null);
  put({ done: true, results: good.map((r, i) => (i === 2 ? { ...r, grade: '<b>' } : r)) });
  assert.equal(records.daily('2026-10-09'), null);
  put({ done: true, results: good.map((r, i) => (i === 2 ? { ...r, code: 'zz' } : r)) });
  assert.equal(records.daily('2026-10-09'), null);
  put({ done: true, results: good.slice(0, 3) });
  assert.equal(records.daily('2026-10-09').done, false, 'done needs all five rounds');
  put({ done: true, results: good });
  assert.equal(records.daily('2026-10-09').done, true);
  storage.data['flagtone:stats'] = JSON.stringify({ games: '<img>', flags: 3, perfects: -1, percentSum: 200 });
  assert.deepEqual(records.stats(), { games: 0, flags: 3, perfects: 0, percentSum: 200 });
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
  storage.data['flagtone:best:classic:easy'] = 'NaN';
  storage.data['flagtone:stats'] = '{not json';
  storage.data['flagtone:daily:2026-10-09'] = '"oops"';
  const corrupt = new Records(storage);
  assert.equal(corrupt.best('classic', 'easy'), null);
  assert.deepEqual(corrupt.stats(), { games: 0, flags: 0, perfects: 0, percentSum: 0 });
  assert.equal(corrupt.daily('2026-10-09'), null);
  assert.equal(new Records(null).best('classic', 'easy'), null);
});

test('progress saved under the old name is copied over once', () => {
  const data = {
    'geopaint:v2:best:classic:easy': '81',
    'geopaint:v2:stats': '{"games":2,"flags":10,"perfects":1,"percentSum":700}',
    'flagtone:best:endless:hard': '9',
    'geopaint:v2:best:endless:hard': '3',
    'something:else': 'x',
  };
  const storage = {
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
  migrateStorage(storage);
  const records = new Records(storage);
  assert.equal(records.best('classic', 'easy'), 81);
  assert.equal(records.stats().flags, 10);
  assert.equal(records.best('endless', 'hard'), 9, 'existing values win');
  data['geopaint:v2:best:classic:hard'] = '50';
  migrateStorage(storage);
  assert.equal(records.best('classic', 'hard'), null, 'runs only once');
  migrateStorage(null);
  migrateStorage({ getItem() { throw new Error('blocked'); } });
});

test('collection keeps the best match per flag and says when a flag is new', () => {
  const records = new Records(memoryStorage());
  assert.equal(records.collect('fr', 60), true);
  assert.equal(records.collect('fr', 90), false);
  assert.equal(records.collect('fr', 70), false);
  assert.deepEqual(records.collection(), { fr: 90 });
});

test('counters, badges and duels persist', () => {
  const records = new Records(memoryStorage());
  records.noteCombo(3);
  records.noteCombo(2);
  records.noteDuelWin();
  assert.deepEqual(records.counters(), { maxCombo: 3, duelWins: 1 });
  records.unlock(['combo-3'], '2026-10-12');
  records.unlock([], '2026-10-13');
  assert.deepEqual(records.unlocked(), { 'combo-3': '2026-10-12' });
  assert.equal(records.duel('abc'), null);
  const game = finished('daily', null, [90, 80, 70, 60, 50]);
  records.saveDuel('abc', game.results);
  assert.deepEqual(records.duel('abc').results.map((r) => r.percent), [90, 80, 70, 60, 50]);
});

test('duel games have no best', () => {
  const records = new Records(memoryStorage());
  const game = new Game({ rate: fixedRate });
  game.start('duel', 'easy', { codes: ['fr', 'de', 'it', 'es', 'jp'], seed: 's' });
  for (const p of [90, 90, 90, 90, 90]) game.submit(game.nextFlagCode(), guessFor(p), '#000000');
  assert.equal(records.finishGame(game).isNewBest, false);
});
