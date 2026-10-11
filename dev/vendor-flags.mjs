// Copies the flag SVGs Flagtone uses from a local clone of
// https://github.com/hampusborgos/country-flags into flags/, normalizing them so
// every color is a plain lowercase #rrggbb presentation attribute:
//   - <style> class rules are inlined as attributes, then <style> and class go away
//   - named and short-hex colors become #rrggbb
// The drawing itself (shapes, proportions, colors) is left untouched.
//
// Usage: node dev/vendor-flags.mjs <path-to-country-flags-clone>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FLAGS } from '../js/flags.js';

const COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'color', 'flood-color', 'lighting-color']);
const NAMED = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', gold: '#ffd700', olive: '#808000', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', navy: '#000080', maroon: '#800000', orange: '#ffa500', purple: '#800080',
};
const KEEP = new Set(['none', 'currentcolor', 'transparent', 'inherit']);

function normalizeValue(value, file) {
  const v = value.trim().toLowerCase();
  if (KEEP.has(v) || v.startsWith('url(')) return value;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('');
  if (NAMED[v]) return NAMED[v];
  throw new Error(`${file}: unsupported color "${value}"`);
}

// Simple `.class{prop:value;…}` rules, in stylesheet order. Anything else throws,
// so a new upstream stylesheet can't be silently dropped.
function parseClassRules(css, file) {
  const rules = [];
  const rest = css.replace(/\.([\w-]+)\s*\{([^}]*)\}/g, (_, cls, body) => {
    const decls = body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
    rules.push({ cls, decls });
    return '';
  });
  if (rest.trim()) throw new Error(`${file}: unsupported CSS "${rest.trim()}"`);
  return rules;
}

function rewriteTag(tag, rules, file) {
  const m = tag.match(/^<([\w:-]+)([\s\S]*?)(\/?)>$/);
  const [, name, attrText, selfClose] = m;
  const attrs = [];
  for (const [, key, value] of attrText.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs.push([key, value]);
  if (attrText.replace(/([\w:-]+)="([^"]*)"/g, '').trim()) {
    throw new Error(`${file}: unparsed attributes in ${tag.slice(0, 80)}`);
  }
  const get = (k) => attrs.find(([key]) => key === k);
  const set = (k, v) => {
    const a = get(k);
    if (a) a[1] = v;
    else attrs.push([k, v]);
  };

  const cls = get('class');
  if (cls) {
    const classes = new Set(cls[1].split(/\s+/));
    // Class rules beat presentation attributes in the cascade, so they overwrite.
    for (const rule of rules) {
      if (classes.has(rule.cls)) for (const [k, v] of rule.decls) set(k, v);
    }
    attrs.splice(attrs.indexOf(cls), 1);
  }
  if (get('style')) throw new Error(`${file}: inline style attributes are not supported`);
  for (const a of attrs) if (COLOR_ATTRS.has(a[0])) a[1] = normalizeValue(a[1], file);
  return `<${name}${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}${selfClose ? '/' : ''}>`;
}

export function normalizeSvg(text, file = 'svg') {
  let rules = [];
  const withoutStyle = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_, css) => {
    rules = rules.concat(parseClassRules(css, file));
    return '';
  });
  return withoutStyle
    .replace(/<defs\/>|<defs><\/defs>/g, '')
    .replace(/<[a-zA-Z][^<>]*>/g, (tag) => rewriteTag(tag, rules, file));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: node dev/vendor-flags.mjs <path-to-country-flags-clone>');
    process.exit(1);
  }
  const out = new URL('../flags/', import.meta.url);
  mkdirSync(out, { recursive: true });
  for (const { code } of FLAGS) {
    const text = readFileSync(join(src, 'svg', `${code}.svg`), 'utf8');
    writeFileSync(new URL(`${code}.svg`, out), normalizeSvg(text, `${code}.svg`).trim() + '\n');
  }
  console.log(`Wrote ${FLAGS.length} flags to flags/`);
}
