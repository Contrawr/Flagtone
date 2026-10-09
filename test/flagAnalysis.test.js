import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyColors, clusterColors, pickCandidates, rasterSize } from '../js/flagAnalysis.js';
import { flagUrl } from '../js/flagLoader.js';

// Builds RGBA pixel data from [r, g, b, a] tuples.
const pixels = (...px) => Uint8ClampedArray.from(px.flat());

test('tallyColors assigns pixels to the nearest palette color within tolerance', () => {
  const data = pixels(
    [255, 255, 255, 255], // white
    [250, 250, 250, 255], // near white (distance ~8.7)
    [255, 224, 0, 255],   // yellow
    [128, 128, 128, 255], // anti-aliased edge: matches nothing
    [0, 0, 0, 0],         // transparent: not counted at all
  );
  const { counts, total } = tallyColors(data, ['#ffffff', '#ffe000']);
  assert.equal(total, 4);
  assert.equal(counts.get('#ffffff'), 2);
  assert.equal(counts.get('#ffe000'), 1);
});

test('clusterColors merges near-identical shades under the most common one', () => {
  const counts = new Map([['#ce1126', 30], ['#cd202a', 5], ['#006847', 40], ['#ffffff', 25], ['#016848', 0]]);
  assert.deepEqual(clusterColors(counts), [
    { hex: '#006847', count: 40, also: ['#016848'] },
    { hex: '#ce1126', count: 35, also: ['#cd202a'] },
    { hex: '#ffffff', count: 25, also: [] },
  ]);
});

test('clusterColors keeps clearly different colors apart', () => {
  const counts = new Map([['#ffffff', 10], ['#f0f0f0', 10], ['#c8102e', 10], ['#e4002b', 10]]);
  assert.equal(clusterColors(counts).length, 4);
});

test('pickCandidates keeps clusters at or above the share threshold', () => {
  const clusters = [
    { hex: '#ffffff', count: 50, also: [] },
    { hex: '#ffe000', count: 42, also: ['#ffe100'] },
    { hex: '#ce9d09', count: 8, also: [] },
  ];
  assert.deepEqual(pickCandidates(clusters, 100).map((c) => c.hex), ['#ffffff', '#ffe000', '#ce9d09']);
  assert.deepEqual(pickCandidates(clusters, 100, 0.09), [
    { hex: '#ffffff', share: 0.5, also: [] },
    { hex: '#ffe000', share: 0.42, also: ['#ffe100'] },
  ]);
  assert.deepEqual(pickCandidates(clusters, 0), []);
});

test('rasterSize keeps the flag proportions', () => {
  assert.deepEqual(rasterSize(2), { w: 320, h: 160 });
  assert.deepEqual(rasterSize(1), { w: 320, h: 320 });
  assert.deepEqual(rasterSize(0.82), { w: 262, h: 320 });
});

test('flagUrl points at the bundled flags', () => {
  assert.match(flagUrl('va'), /\/flags\/va\.svg$/);
});
