import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, ROUNDS, START_HEARTS, TIMED_SECONDS, comboMultiplier, pickCodes } from '../js/game.js';
import { poolFor, flagByCode } from '../js/flags.js';
import { gradeFor } from '../js/rating.js';

// Rating stub: the match % is whatever number the guess string holds.
const fixedRate = (guess) => {
  const percent = Number(guess);
  return { deltaE: 0, percent, grade: gradeFor(percent).id };
};

function play(game, percents) {
  return percents.map((p) => game.submit(game.nextFlagCode(), String(p), '#000000'));
}

test('classic ends after exactly 5 rounds with no repeats from the pool', () => {
  const game = new Game({ rate: fixedRate });
  game.start('classic', 'easy');
  const pool = new Set(poolFor('easy').map((f) => f.code));
  const codes = [];
  for (let i = 0; i < ROUNDS; i++) {
    assert.equal(game.isOver(), false);
    assert.equal(game.round, i + 1);
    const code = game.nextFlagCode();
    codes.push(code);
    game.submit(code, '80', '#000000');
  }
  assert.equal(game.isOver(), true);
  assert.equal(new Set(codes).size, 5);
  for (const c of codes) assert.ok(pool.has(c));
  assert.equal(game.finalScore(), 80);
});

test('average is the rounded mean match %', () => {
  const game = new Game({ rate: fixedRate });
  game.start('classic', 'hard');
  assert.equal(game.average, 0);
  play(game, [90, 81, 60]);
  assert.equal(game.average, 77);
});

test('classic never costs hearts', () => {
  const game = new Game({ rate: fixedRate });
  game.start('classic', 'hard');
  const results = play(game, [0, 0, 0]);
  assert.equal(game.hearts, START_HEARTS);
  assert.ok(results.every((r) => r.heartChange === 0));
});

test('endless: below 70% costs a heart, exactly 70% does not', () => {
  const game = new Game({ rate: fixedRate });
  game.start('endless', 'easy');
  const [a, b] = play(game, [70, 69]);
  assert.equal(a.heartChange, 0);
  assert.equal(b.heartChange, -1);
  assert.equal(game.hearts, 2);
});

test('endless: a perfect round wins back a lost heart, never above the start', () => {
  const game = new Game({ rate: fixedRate });
  game.start('endless', 'easy');
  const [full] = play(game, [99]);
  assert.equal(full.heartChange, 0);
  assert.equal(game.hearts, 3);
  play(game, [10, 10]);
  assert.equal(game.hearts, 1);
  const [back] = play(game, [95]);
  assert.equal(back.heartChange, 1);
  assert.equal(game.hearts, 2);
  const [great] = play(game, [94]);
  assert.equal(great.heartChange, 0);
});

test('endless: game over at 0 hearts, score counts every flag', () => {
  const game = new Game({ rate: fixedRate });
  game.start('endless', 'medium');
  play(game, [90, 30, 80, 20]);
  assert.equal(game.isOver(), false);
  play(game, [10]);
  assert.equal(game.isOver(), true);
  assert.equal(game.finalScore(), 5);
});

test('endless: reshuffles the pool and never repeats back to back', () => {
  const game = new Game({ rate: fixedRate });
  game.start('endless', 'impossible');
  const size = poolFor('impossible').length;
  let prev = null;
  for (let i = 0; i < size * 4; i++) {
    const code = game.nextFlagCode();
    assert.notEqual(code, prev);
    prev = code;
    game.submit(code, '90', '#000000');
  }
  assert.equal(game.isOver(), false);
});

test('endless: the swap branch fires when a refill starts with the last code shown', () => {
  const size = poolFor('impossible').length;
  // First shuffle: identity (j = i), so the last code shown is the pool's last.
  // Second shuffle: the first step (i = size - 1) uses j = 0, moving that same code
  // to the front; every later step is identity. Without the guard the refill would
  // show the last code twice in a row.
  let calls = 0;
  const random = () => (++calls === size ? 0 : 0.999);
  const game = new Game({ rate: fixedRate, random });
  game.start('endless', 'impossible');
  let last;
  for (let i = 0; i < size; i++) last = game.nextFlagCode();
  assert.equal(last, poolFor('impossible')[size - 1].code);
  const after = game.nextFlagCode();
  assert.equal(calls, 2 * (size - 1));
  assert.notEqual(after, last);
});

test('pickCodes: same five flags for the same seed, all from the pool', () => {
  const a = pickCodes('europe', 'abc');
  assert.deepEqual(a, pickCodes('europe', 'abc'));
  assert.notDeepEqual(a, pickCodes('europe', 'abd'));
  assert.equal(new Set(a).size, 5);
  for (const c of a) assert.equal(flagByCode(c).region, 'europe');
});

test('a fixed order offers the current round until it is played', () => {
  const game = new Game({ rate: fixedRate });
  game.start('daily', null, { codes: ['fr', 'pe', 'hu', 'kz', 'to'] });
  assert.equal(game.nextFlagCode(), 'fr');
  assert.equal(game.nextFlagCode(), 'fr');
  game.submit('fr', '90', '#000000');
  assert.equal(game.nextFlagCode(), 'pe');
});

test('daily resumes from saved rounds', () => {
  const game = new Game({ rate: fixedRate });
  const saved = [{ code: 'fr', percent: 90 }, { code: 'pe', percent: 70 }];
  game.start('daily', null, { codes: ['fr', 'pe', 'hu', 'kz', 'to'], results: saved });
  assert.equal(game.round, 3);
  assert.equal(game.nextFlagCode(), 'hu');
  play(game, [50, 50, 50]);
  assert.equal(game.isOver(), true);
  assert.equal(game.finalScore(), 62);
  assert.equal(saved.length, 2, 'saved rounds are copied, not mutated');
});

test('result carries name, colors and rating', () => {
  const game = new Game();
  game.start('classic', 'easy');
  const r = game.submit('va', '#ffe000', '#ffe000');
  assert.deepEqual(r, {
    code: 'va', name: 'Vatican City', guessHex: '#ffe000', trueHex: '#ffe000',
    deltaE: 0, percent: 100, grade: 'perfect', heartChange: 0, combo: 1, points: 100, timeBonus: 0,
  });
});

test('combo grows on Great or better and multiplies points', () => {
  assert.equal(comboMultiplier(1), 1);
  assert.equal(comboMultiplier(3), 1.5);
  assert.equal(comboMultiplier(20), 2.5);
  const game = new Game({ rate: fixedRate });
  game.start('endless', 'easy');
  const [a, b, c, d] = play(game, [90, 90, 90, 50]);
  assert.deepEqual([a.combo, b.combo, c.combo, d.combo], [1, 2, 3, 0]);
  assert.deepEqual([a.points, b.points, c.points, d.points], [90, 113, 135, 50]);
  assert.equal(game.bestCombo, 3);
  assert.equal(game.points, 388);
});

test('time attack: the clock runs down, good rounds add time, score is points', () => {
  const game = new Game({ rate: fixedRate });
  game.start('timed', 'easy');
  assert.equal(game.timeLeft, TIMED_SECONDS);
  assert.equal(game.tick(10), false);
  const [perfect, great, good] = play(game, [96, 88, 75]);
  assert.deepEqual([perfect.timeBonus, great.timeBonus, good.timeBonus], [6, 3, 0]);
  assert.equal(game.timeLeft, 59);
  assert.equal(game.isOver(), false);
  assert.equal(game.tick(100), true);
  assert.equal(game.isOver(), true);
  assert.equal(game.tick(1), false, 'reports running out only once');
  assert.equal(game.finalScore(), game.points);
});

test('two-color rounds average both colors and keep each part', () => {
  const game = new Game({ rate: fixedRate });
  game.start('classic', 'hard', { codes: ['ma', 'dz', 'tn', 'ly', 'sd'], seed: 's' });
  const r = game.submit('ma', ['90', '70'], ['#000000', '#ffffff']);
  assert.equal(r.percent, 80);
  assert.equal(r.grade, 'good');
  assert.deepEqual(r.parts.map((p) => p.percent), [90, 70]);
  assert.equal(r.trueHex, '#000000');
});

test('which rounds hide two colors', () => {
  const game = new Game({ rate: fixedRate });
  game.start('timed', 'hard');
  assert.equal(game.wantsTwoColors(0), false);
  game.start('daily', null, { codes: ['fr', 'pe', 'hu', 'kz', 'to'] });
  assert.equal(game.wantsTwoColors(0.9), false);
  play(game, [90, 90, 90]);
  assert.equal(game.wantsTwoColors(0.9), true, 'Daily flags 4 and 5');
  game.start('classic', 'easy');
  assert.equal(game.wantsTwoColors(0), false);
  game.start('classic', 'hard');
  assert.equal(game.wantsTwoColors(0.2), true);
  assert.equal(game.wantsTwoColors(0.7), false);
  game.start('classic', 'oceania');
  assert.equal(game.wantsTwoColors(0.2), true);
  assert.equal(game.wantsTwoColors(0.4), false);
  game.start('endless', 'easy');
  play(game, Array(10).fill(90));
  assert.equal(game.wantsTwoColors(0.1), true);
});

test('seeded rounds are reproducible', () => {
  const game = new Game();
  game.start('classic', 'easy', { seed: 'x', codes: ['fr', 'de', 'it', 'es', 'jp'] });
  assert.equal(game.roundRandom('fr')(), game.roundRandom('fr')());
});
