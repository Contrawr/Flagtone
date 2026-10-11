import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FLAGS } from '../js/flags.js';
import { FLAG_DATA } from '../js/flagData.js';
import { normalizeSvg } from '../dev/vendor-flags.mjs';

const dir = new URL('../flags/', import.meta.url);
const read = (code) => readFileSync(new URL(`${code}.svg`, dir), 'utf8');

function viewBoxRatio(text) {
  const [, , w, h] = text.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
  return w / h;
}

test('flags/ holds exactly one SVG per country', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(files, FLAGS.map((f) => f.code).sort());
});

test('bundled SVGs use only plain hex colors and nothing executable', () => {
  for (const { code } of FLAGS) {
    const text = read(code);
    assert.match(text, /viewBox="/, code);
    assert.doesNotMatch(text, /<style|\sclass=|\sstyle=|<script|<foreignObject|\son\w+=/i, code);
    for (const [, value] of text.matchAll(/\s(?:fill|stroke|stop-color)="([^"]*)"/g)) {
      assert.match(value, /^(#[0-9a-f]{6}|none|url\(#[^)]+\))$/, `${code}: ${value}`);
    }
  }
});

test('every flag has data: its true ratio and at least one hideable color', () => {
  for (const { code } of FLAGS) {
    const data = FLAG_DATA[code];
    assert.ok(data, code);
    assert.ok(Math.abs(data.ratio - viewBoxRatio(read(code))) < 0.001, `${code} ratio`);
    assert.ok(data.colors.length >= 1, `${code} colors`);
    const text = read(code);
    for (const c of data.colors) {
      assert.ok(c.share >= 0.08 && c.share <= 1, `${code} ${c.hex} share`);
      for (const hex of [c.hex, ...(c.also ?? [])]) {
        assert.ok(text.includes(`"${hex}"`) || (hex === '#000000'), `${code}: ${hex} not in SVG`);
      }
    }
  }
});

test('official proportions of some well-known flags', () => {
  const expected = {
    ch: 1, va: 1, us: 19 / 10, gb: 2, fr: 3 / 2, de: 5 / 3, be: 15 / 13, dk: 37 / 28,
    no: 11 / 8, se: 8 / 5, fi: 18 / 11, qa: 28 / 11, mc: 5 / 4, br: 10 / 7, ir: 7 / 4,
    np: 0.8203, tg: 1.618, ne: 7 / 6, py: 20 / 11, sv: 335 / 189, kh: 25 / 16,
  };
  for (const [code, ratio] of Object.entries(expected)) {
    assert.ok(Math.abs(FLAG_DATA[code].ratio - ratio) < 0.001, `${code}: ${FLAG_DATA[code].ratio} vs ${ratio}`);
  }
});

test('normalizeSvg inlines class rules and expands colors', () => {
  const out = normalizeSvg(
    '<svg viewBox="0 0 3 2"><defs><style>.a{fill:#FD0}.b{stroke:red;stroke-width:2}.a{fill-rule:evenodd}</style></defs>' +
      '<path class="a b" fill="#000" d="M0 0h1v1z"/><rect fill="Gold" width="1" height="1"/></svg>',
  );
  assert.equal(
    out,
    '<svg viewBox="0 0 3 2"><path fill="#ffdd00" d="M0 0h1v1z" stroke="#ff0000" stroke-width="2" fill-rule="evenodd"/>' +
      '<rect fill="#ffd700" width="1" height="1"/></svg>',
  );
  assert.throws(() => normalizeSvg('<svg><style>path{fill:red}</style></svg>'), /unsupported CSS/);
  assert.throws(() => normalizeSvg('<svg><path fill="papayawhip"/></svg>'), /unsupported color/);
});
