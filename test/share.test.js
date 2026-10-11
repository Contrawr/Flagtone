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
    'Flagtone Daily #3 · 61% 🎨\n🟩🟥',
  );
  assert.equal(
    shareText({ mode: 'classic', tier: 'hard', results: results('good'), score: 74, url: 'https://example.com/' }),
    'Flagtone Classic · Hard · 74% 🎨\n🟨\nhttps://example.com/',
  );
  assert.equal(
    shareText({ mode: 'endless', tier: 'impossible', results: results('off'), score: 1 }),
    'Flagtone Endless · Impossible · 1 flag 🎨\n🟥',
  );
});
