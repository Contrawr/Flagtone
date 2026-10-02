import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hsbToRgb, rgbToHex, hexToRgb, hsbToHex, normalizeColor,
  rgbToLab, deltaE2000, scoreFromDeltaE, matchScore,
} from '../js/colors.js';

test('hsbToRgb primaries and grays', () => {
  assert.deepEqual(hsbToRgb(0, 1, 1), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hsbToRgb(120, 1, 1), { r: 0, g: 255, b: 0 });
  assert.deepEqual(hsbToRgb(240, 1, 1), { r: 0, g: 0, b: 255 });
  assert.deepEqual(hsbToRgb(60, 1, 1), { r: 255, g: 255, b: 0 });
  assert.deepEqual(hsbToRgb(360, 1, 1), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hsbToRgb(200, 0, 1), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hsbToRgb(200, 0.7, 0), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hsbToRgb(0, 0, 0.5), { r: 128, g: 128, b: 128 });
});

test('hex round trip', () => {
  assert.equal(rgbToHex({ r: 255, g: 224, b: 0 }), '#ffe000');
  assert.deepEqual(hexToRgb('#ffe000'), { r: 255, g: 224, b: 0 });
  assert.equal(hsbToHex(0, 1, 1), '#ff0000');
});

test('normalizeColor', () => {
  assert.equal(normalizeColor('#FFF'), '#ffffff');
  assert.equal(normalizeColor('#ffe000'), '#ffe000');
  assert.equal(normalizeColor(' Gold '), '#ffd700');
  assert.equal(normalizeColor('red'), '#ff0000');
  assert.equal(normalizeColor('rgb(1, 2, 3)'), '#010203');
  assert.equal(normalizeColor('none'), null);
  assert.equal(normalizeColor('url(#a)'), null);
  assert.equal(normalizeColor('currentColor'), null);
  assert.equal(normalizeColor(null), null);
});

test('rgbToLab reference values', () => {
  const white = rgbToLab({ r: 255, g: 255, b: 255 });
  assert.ok(Math.abs(white.L - 100) < 0.01);
  assert.ok(Math.abs(white.a) < 0.01 && Math.abs(white.b) < 0.01);
  const red = rgbToLab({ r: 255, g: 0, b: 0 });
  assert.ok(Math.abs(red.L - 53.24) < 0.05);
  assert.ok(Math.abs(red.a - 80.09) < 0.05);
  assert.ok(Math.abs(red.b - 67.2) < 0.05);
});

// Test pairs from Sharma, Wu & Dalal (2005), Table 1.
const SHARMA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.903],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

test('deltaE2000 matches Sharma reference pairs', () => {
  const lab = ([L, a, b]) => ({ L, a, b });
  for (const [p, q, expected] of SHARMA) {
    assert.ok(Math.abs(deltaE2000(lab(p), lab(q)) - expected) < 1e-4, `${p} vs ${q}`);
    assert.ok(Math.abs(deltaE2000(lab(q), lab(p)) - expected) < 1e-4, `${q} vs ${p} (symmetry)`);
  }
});

test('scoreFromDeltaE mapping', () => {
  assert.equal(scoreFromDeltaE(0), 10);
  assert.equal(scoreFromDeltaE(2), 9.5);
  assert.equal(scoreFromDeltaE(12), 7);
  assert.equal(scoreFromDeltaE(40), 0);
  assert.equal(scoreFromDeltaE(95), 0);
});

test('matchScore', () => {
  assert.deepEqual(matchScore('#ffe000', '#ffe000'), { deltaE: 0, score: 10 });
  assert.equal(matchScore('#000000', '#ffffff').score, 0);
});
