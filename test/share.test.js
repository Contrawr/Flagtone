import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagEmoji, gradeSquares, shareText } from '../js/share.js';

const results = (...grades) => grades.map((grade) => ({ grade }));

test('flagEmoji builds regional indicator pairs', () => {
  assert.equal(flagEmoji('fr'), '🇫🇷');
  assert.equal(flagEmoji('jp'), '🇯🇵');
});

test('gradeSquares wraps every ten rounds', () => {
  assert.equal(gradeSquares(results('perfect', 'great', 'good', 'close', 'off')), '🟪🟩🟨🟧🟥');
  assert.equal(gradeSquares(results(...Array(12).fill('great'))), '🟩'.repeat(10) + '\n' + '🟩🟩');
});

test('shareText per mode', () => {
  assert.equal(
    shareText({ mode: 'daily', results: results('great', 'off'), score: 61, dailyNumber: 3 }),
    '🎨 Flagtone Daily #3\n61% · Close\n🟩🟥',
  );
  assert.equal(
    shareText({ mode: 'daily', results: results('great'), score: 88, dailyNumber: 3, streak: 4 }),
    '🎨 Flagtone Daily #3\n88% · Great\n🟩\n🔥 4-day streak',
  );
  assert.equal(
    shareText({ mode: 'classic', tier: 'hard', results: results('good'), score: 74, url: 'https://example.com/' }),
    '🎨 Flagtone Classic · Hard\n74% · Good\n🟨\nhttps://example.com/',
  );
  assert.equal(
    shareText({ mode: 'endless', tier: 'impossible', results: results('off'), score: 1 }),
    '❤️ Flagtone Endless · Impossible\n1 flag painted\n🟥',
  );
});

test('shareText for time attack, duels and region packs', () => {
  assert.equal(
    shareText({ mode: 'timed', pool: 'europe', results: results('great'), score: 1234, bestCombo: 3 }),
    '⏱️ Flagtone Time Attack · Europe\n1,234 points · 1 flag\n🟩\n🔥 Best combo ×3',
  );
  assert.equal(
    shareText({ mode: 'duel', pool: 'asia', results: results('good'), score: 71, duel: { me: 71, them: 64, result: 'win' } }),
    '⚔️ Flagtone Duel · Asia\n71% · Good\n🟨\nI won, 71% to 64%',
  );
});
