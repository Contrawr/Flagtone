import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyColors, pickCandidates, flagUrl } from '../js/flagLoader.js';

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

test('pickCandidates keeps colors at or above the share threshold', () => {
  const counts = new Map([['#ffffff', 50], ['#ffe000', 42], ['#ce9d09', 8]]);
  assert.deepEqual(pickCandidates(counts, 100), ['#ffffff', '#ffe000', '#ce9d09']);
  assert.deepEqual(pickCandidates(counts, 100, 0.09), ['#ffffff', '#ffe000']);
  assert.deepEqual(pickCandidates(counts, 0), []);
});

test('flagUrl points at the pinned flag-icons version', () => {
  assert.equal(flagUrl('va'), 'https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/va.svg');
});
