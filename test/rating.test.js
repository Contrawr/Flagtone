import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPercent, gradeFor, rate, describeMiss, hueName, GRADES } from '../js/rating.js';

test('matchPercent is forgiving at the top and reaches 0 for opposite colors', () => {
  assert.equal(matchPercent(0), 100);
  assert.equal(matchPercent(1), 99);
  assert.equal(matchPercent(2), 98);
  assert.equal(matchPercent(5), 91);
  assert.equal(matchPercent(10), 76);
  assert.equal(matchPercent(20), 47);
  assert.equal(matchPercent(50), 5);
  assert.equal(matchPercent(100), 0);
});

test('matchPercent never increases with distance', () => {
  let prev = 101;
  for (let d = 0; d <= 120; d += 0.25) {
    const p = matchPercent(d);
    assert.ok(p <= prev, `ΔE ${d}`);
    prev = p;
  }
});

test('grades by percent', () => {
  assert.equal(gradeFor(100).id, 'perfect');
  assert.equal(gradeFor(95).id, 'perfect');
  assert.equal(gradeFor(94).id, 'great');
  assert.equal(gradeFor(85).id, 'great');
  assert.equal(gradeFor(70).id, 'good');
  assert.equal(gradeFor(69).id, 'close');
  assert.equal(gradeFor(50).id, 'close');
  assert.equal(gradeFor(49).id, 'off');
  assert.equal(gradeFor(0).id, 'off');
  assert.equal(new Set(GRADES.map((g) => g.emoji)).size, GRADES.length);
});

test('rate', () => {
  assert.deepEqual(rate('#ffe000', '#ffe000'), { deltaE: 0, percent: 100, grade: 'perfect' });
  assert.equal(rate('#000000', '#ffffff').percent, 0);
  assert.equal(rate('#000000', '#ffffff').grade, 'off');
});

test('hueName', () => {
  assert.equal(hueName(0), 'red');
  assert.equal(hueName(355), 'red');
  assert.equal(hueName(30), 'orange');
  assert.equal(hueName(55), 'yellow');
  assert.equal(hueName(120), 'green');
  assert.equal(hueName(220), 'blue');
  assert.equal(hueName(-60), 'pink');
});

test('describeMiss says nothing for a perfect match', () => {
  assert.equal(describeMiss('#b22234', '#b22234'), '');
  assert.equal(describeMiss('#f2f2f2', '#ffffff'), '');
});

test('describeMiss names lightness, saturation and hue drift', () => {
  assert.equal(describeMiss('#a01f2f', '#b22234'), 'Slightly too dark.');
  assert.equal(describeMiss('#c2333f', '#b22234'), 'A bit too light.');
  assert.equal(describeMiss('#b24422', '#b22234'), 'Too orange.');
  assert.equal(describeMiss('#b22250', '#b22234'), 'A bit too pink.');
  assert.equal(describeMiss('#7f7f7f', '#006aa7'), 'Much too dull and too light.');
  assert.equal(describeMiss('#00ff00', '#ce1126'), 'Much too green and much too light.');
  assert.equal(describeMiss('#ffb000', '#fecc00'), 'A bit too orange and a bit too dark.');
});

test('describeMiss treats white and black as having no hue', () => {
  assert.equal(describeMiss('#fff3e0', '#ffffff'), 'A bit too colorful.');
  assert.equal(describeMiss('#222222', '#000000'), 'A bit too light.');
});
