// Dev-time flag analysis: which colors cover enough of a flag to be hidden.
// Used by dev/check-flags.html, which dev/build-flag-data.mjs runs headlessly to
// regenerate js/flagData.js. The game itself only reads flagData.js.
import { hexToRgb, rgbToLab, deltaE2000 } from './colors.js';
import { PAINTS, paintOf, svgRatio, makeRecolorable } from './flagLoader.js';

export const MIN_SHARE = 0.08;
// Colors closer than this are one color drawn in slightly different shades.
// Hiding one but not the others would leave the answer visible.
export const MERGE_DELTA_E = 3;
const MATCH_TOLERANCE = 12;
const RASTER_LONG_SIDE = 320;

// Pure: counts opaque pixels per palette color. A pixel counts toward the nearest
// palette color if it lies within `tolerance` (RGB distance); anti-aliased edge
// pixels usually don't.
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

// Pure: groups near-identical colors. Each cluster is led by its most common color;
// `also` lists the other shades, which are hidden along with it.
export function clusterColors(counts, mergeDeltaE = MERGE_DELTA_E) {
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const clusters = [];
  for (const [hex, count] of sorted) {
    const lab = rgbToLab(hexToRgb(hex));
    const home = clusters.find((c) => deltaE2000(c.lab, lab) < mergeDeltaE);
    if (home) {
      home.count += count;
      home.also.push(hex);
    } else {
      clusters.push({ hex, lab, count, also: [] });
    }
  }
  return clusters.map(({ hex, count, also }) => ({ hex, count, also }));
}

// Pure: clusters covering at least minShare of the opaque pixels, largest first.
export function pickCandidates(clusters, total, minShare = MIN_SHARE) {
  if (total === 0) return [];
  return clusters
    .filter((c) => c.count / total >= minShare)
    .map((c) => ({ hex: c.hex, share: Math.round((c.count / total) * 1000) / 1000, also: [...c.also].sort() }));
}

// Every paint color used anywhere in the SVG.
export function collectColors(svg) {
  const set = new Set();
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const prop of PAINTS) {
      const hex = paintOf(el, prop);
      if (hex) set.add(hex);
    }
  }
  return [...set];
}

export function rasterSize(ratio) {
  return ratio >= 1
    ? { w: RASTER_LONG_SIDE, h: Math.round(RASTER_LONG_SIDE / ratio) }
    : { w: Math.round(RASTER_LONG_SIDE * ratio), h: RASTER_LONG_SIDE };
}

// Renders an SVG element (or raw markup) to RGBA pixels at the given size.
export function rasterize(svgOrText, { w, h }) {
  let text = svgOrText;
  if (typeof svgOrText !== 'string') {
    const copy = svgOrText.cloneNode(true);
    copy.setAttribute('width', w);
    copy.setAttribute('height', h);
    copy.setAttribute('preserveAspectRatio', 'none');
    text = new XMLSerializer().serializeToString(copy);
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h).data);
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

// Share of opaque pixels still within tolerance of `colors` after they were all
// repainted: anything left over would give the hidden color away.
export async function leakShare(svg, colors, size) {
  const recolor = makeRecolorable(svg, colors);
  recolor.paint('#ff00ff');
  try {
    const { counts, total } = tallyColors(await rasterize(svg, size), colors, 6);
    const left = [...counts.values()].reduce((a, b) => a + b, 0);
    return total ? left / total : 0;
  } finally {
    recolor.restore();
  }
}

export async function analyzeSvg(svg) {
  const ratio = svgRatio(svg);
  const size = rasterSize(ratio);
  const palette = collectColors(svg);
  const { counts, total } = tallyColors(await rasterize(svg, size), palette);
  const colors = pickCandidates(clusterColors(counts), total);
  return { ratio: Math.round(ratio * 10000) / 10000, colors, size };
}
