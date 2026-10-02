import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, STANDARD_ROUNDS } from '../js/game.js';
import { poolFor } from '../js/flags.js';

function memoryStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

// Scorer stub: the score is whatever number is encoded in the guess string.
const fixedScore = (guess) => ({ deltaE: 0, score: Number(guess) });

function play(game, scores) {
  const results = [];
  for (const s of scores) {
    const code = game.nextFlagCode();
    results.push(game.submit(code, String(s), '#000000'));
  }
  return results;
}

test('standard ends after exactly 5 rounds with no repeats from the pool', () => {
  const game = new Game({ score: fixedScore });
  game.start('standard', 'easy');
  const pool = new Set(poolFor('easy').map((f) => f.code));
  const codes = [];
  for (let i = 0; i < STANDARD_ROUNDS; i++) {
    assert.equal(game.isOver(), false);
    assert.equal(game.round, i + 1);
    const code = game.nextFlagCode();
    codes.push(code);
    game.submit(code, '8', '#000000');
  }
  assert.equal(game.isOver(), true);
  assert.equal(new Set(codes).size, 5);
  for (const c of codes) assert.ok(pool.has(c));
  assert.equal(game.total, 40);
});

test('standard never costs lives', () => {
  const game = new Game({ score: fixedScore });
  game.start('standard', 'hard');
  const results = play(game, [0, 0, 0]);
  assert.equal(game.lives, 3);
  assert.ok(results.every((r) => r.lostLife === false));
});

test('infinite: below 7.0 loses a life, exactly 7.0 does not', () => {
  const game = new Game({ score: fixedScore });
  game.start('infinite', 'easy');
  const [a, b] = play(game, [7, 6.9]);
  assert.equal(a.lostLife, false);
  assert.equal(b.lostLife, true);
  assert.equal(game.lives, 2);
});

test('infinite: game over at 0 lives, streak counts every flag', () => {
  const game = new Game({ score: fixedScore });
  game.start('infinite', 'medium');
  play(game, [9, 3, 8, 2]);
  assert.equal(game.isOver(), false);
  play(game, [1]);
  assert.equal(game.isOver(), true);
  assert.equal(game.finalScore(), 5);
});

test('infinite: reshuffles the pool and never repeats back to back', () => {
  const game = new Game({ score: fixedScore });
  game.start('infinite', 'impossible');
  const size = poolFor('impossible').length;
  let prev = null;
  for (let i = 0; i < size * 4; i++) {
    const code = game.nextFlagCode();
    assert.notEqual(code, prev);
    prev = code;
    game.submit(code, '9', '#000000');
  }
  assert.equal(game.isOver(), false);
});

test('infinite: the swap branch fires when a refill starts with the last code shown', () => {
  const size = poolFor('impossible').length;
  // First shuffle: identity (j = i), so the last code shown is the pool's last.
  // Second shuffle: the first step (i = size - 1) uses j = 0, moving that same code
  // to the front; every later step is identity. Without the guard the refill would
  // show the last code twice in a row.
  let calls = 0;
  const random = () => (++calls === size ? 0 : 0.999);
  const game = new Game({ score: fixedScore, random });
  game.start('infinite', 'impossible');
  let last;
  for (let i = 0; i < size; i++) last = game.nextFlagCode();
  assert.equal(last, poolFor('impossible')[size - 1].code);
  const after = game.nextFlagCode();
  assert.equal(calls, 2 * (size - 1));
  assert.notEqual(after, last);
});

test('standard: a refill after failed loads never repeats a played flag', () => {
  const game = new Game({ score: fixedScore });
  game.start('standard', 'impossible');
  const size = poolFor('impossible').length;
  // Failed loads consume codes without a submit.
  for (let i = 0; i < size - 1; i++) game.nextFlagCode();
  const played = game.nextFlagCode();
  game.submit(played, '8', '#000000');
  // The queue is now empty; keep drawing across several refills.
  for (let i = 0; i < size * 2; i++) assert.notEqual(game.nextFlagCode(), played);
});

test('result carries name, colors and score', () => {
  const game = new Game();
  game.start('standard', 'easy');
  const r = game.submit('va', '#ffe000', '#ffe000');
  assert.deepEqual(r, {
    code: 'va', name: 'Vatican City', guessHex: '#ffe000', trueHex: '#ffe000',
    deltaE: 0, score: 10, lostLife: false,
  });
});

test('best scores persist per mode and tier, and only improve', () => {
  const storage = memoryStorage();
  const game = new Game({ storage, score: fixedScore });

  game.start('standard', 'easy');
  play(game, [8, 8, 8, 8, 8]);
  assert.equal(game.bestFor('standard', 'easy'), 40);
  assert.equal(game.isNewBest, true);

  game.start('standard', 'easy');
  play(game, [5, 5, 5, 5, 5]);
  assert.equal(game.bestFor('standard', 'easy'), 40);
  assert.equal(game.isNewBest, false);

  game.start('infinite', 'easy');
  play(game, [9, 1, 1, 1]);
  assert.equal(game.bestFor('infinite', 'easy'), 4);
  assert.equal(game.bestFor('infinite', 'hard'), null);
});

test('throwing storage does not break the game', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const game = new Game({ storage, score: fixedScore });
  game.start('standard', 'easy');
  play(game, [1, 2, 3, 4, 5]);
  assert.equal(game.isOver(), true);
  assert.equal(game.bestFor('standard', 'easy'), null);
});

test('a corrupt stored best is ignored and replaced', () => {
  const storage = memoryStorage();
  storage.data['geopaint:best:standard:easy'] = 'abc';
  const game = new Game({ storage, score: fixedScore });
  assert.equal(game.bestFor('standard', 'easy'), null);
  game.start('standard', 'easy');
  play(game, [8, 8, 8, 8, 8]);
  assert.equal(game.isNewBest, true);
  assert.equal(game.bestFor('standard', 'easy'), 40);
});
