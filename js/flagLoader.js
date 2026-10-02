// Fetches a flag SVG, finds which colors cover enough area to be hidden,
// and returns an inline SVG whose hidden color can be repainted live.
import { normalizeColor, hexToRgb } from './colors.js';

export const flagUrl = (code) =>
  `https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${code}.svg`;

export const MIN_SHARE = 0.08;
const MATCH_TOLERANCE = 12;
const RASTER_W = 160;
const RASTER_H = 120;
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'text']);
const NON_RENDERED = 'defs, clipPath, mask, symbol, pattern, marker';

// Pure: counts opaque pixels per palette color. A pixel counts toward the nearest
// palette color if it lies within MATCH_TOLERANCE (RGB distance); anti-aliased
// edge pixels usually don't.
export function tallyColors(data, palette, tolerance = MATCH_TOLERANCE) {
  const rgbs = palette.map(hexToRgb);
  const counts = new Map(palette.map((hex) => [hex, 0]));
  const tol2 = tolerance * tolerance;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    total++;
    let best = -1;
    let bestD = Infinity;
    for (let p = 0; p < rgbs.length; p++) {
      const dr = data[i] - rgbs[p].r, dg = data[i + 1] - rgbs[p].g, db = data[i + 2] - rgbs[p].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best >= 0 && bestD <= tol2) counts.set(palette[best], counts.get(palette[best]) + 1);
  }
  return { counts, total };
}

// Pure: colors covering at least minShare of the opaque pixels.
export function pickCandidates(counts, total, minShare = MIN_SHARE) {
  if (total === 0) return [];
  return [...counts].filter(([, n]) => n / total >= minShare).map(([hex]) => hex);
}

function fillOf(el) {
  return normalizeColor(el.getAttribute('fill') ?? el.style?.fill ?? null);
}

function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG parse error');
  return document.importNode(doc.documentElement, true);
}

// Shapes with no fill anywhere up the tree render black by default. Make that
// explicit so a hidden black also repaints them.
function makeDefaultFillsExplicit(svg) {
  for (const el of svg.querySelectorAll('*')) {
    if (!SHAPES.has(el.localName) || el.closest(NON_RENDERED)) continue;
    let node = el;
    let hasFill = false;
    while (node && node !== svg.parentNode) {
      if (node.getAttribute?.('fill') || node.style?.fill) { hasFill = true; break; }
      node = node.parentNode;
    }
    if (!hasFill) el.setAttribute('fill', '#000000');
  }
}

function collectFills(svg) {
  const set = new Set();
  for (const el of svg.querySelectorAll('*')) {
    const hex = fillOf(el);
    if (hex) set.add(hex);
  }
  return [...set];
}

// Fallback when the canvas can't be read: fills of top-level shapes (usually stripes).
function topLevelFills(svg) {
  const set = new Set();
  for (const el of svg.children) {
    const hex = fillOf(el);
    if (hex && el.localName !== 'defs') set.add(hex);
  }
  return [...set];
}

function rasterize(svg) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('width', RASTER_W);
  copy.setAttribute('height', RASTER_H);
  const text = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = RASTER_W;
        canvas.height = RASTER_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, RASTER_W, RASTER_H);
        resolve(ctx.getImageData(0, 0, RASTER_W, RASTER_H).data);
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG rasterize failed'));
    };
    img.src = url;
  });
}

// Fetch + parse + find hideable colors. Used by loadFlag and the dev check page.
export async function analyzeFlag(code) {
  const res = await fetch(flagUrl(code));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const svg = parseSvg(await res.text());
  makeDefaultFillsExplicit(svg);
  const palette = collectFills(svg);
  let candidates;
  try {
    const { counts, total } = tallyColors(await rasterize(svg), palette);
    candidates = pickCandidates(counts, total);
  } catch {
    candidates = topLevelFills(svg);
  }
  return { svg, candidates };
}

export async function loadFlag(code, random = Math.random) {
  const { svg, candidates } = await analyzeFlag(code);
  if (candidates.length === 0) throw new Error('no color covers enough area');
  const hiddenHex = candidates[Math.floor(random() * candidates.length)];
  const hidden = [...svg.querySelectorAll('*')].filter((el) => fillOf(el) === hiddenHex);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('class', 'flag-svg');
  svg.setAttribute('role', 'img');
  return {
    svg,
    hiddenHex,
    setGuess(hex) {
      for (const el of hidden) el.style.fill = hex;
    },
    reveal() {
      for (const el of hidden) el.style.removeProperty('fill');
    },
  };
}
