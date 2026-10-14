// A result picture to share alongside the text: score, grade and one tile per
// flag, spoiler-free like the text. Drawn on a canvas, so it needs a browser.
import { gradeFor } from './rating.js';
import { POOL_LABELS } from './share.js';

const SIZE = 1080;
const PAD = 84;
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const COLORS = { perfect: '#8b5cf6', great: '#22c55e', good: '#eab308', close: '#f97316', off: '#ef4444' };
const SPECTRUM = ['#ff3b30', '#ffcc00', '#34c759', '#00b8f0', '#3d5cff', '#b44dff'];
const MAX_TILES = 40;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// The Flagtone mark: blue, white and a spectrum band.
function drawMark(ctx, x, y, h) {
  const w = h * (26 / 19);
  ctx.save();
  roundRect(ctx, x, y, w, h, h * 0.2);
  ctx.clip();
  ctx.fillStyle = '#1f3fbf';
  ctx.fillRect(x, y, w * (9 / 26), h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + w * (9 / 26), y, w * (8 / 26), h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  SPECTRUM.forEach((c, i) => g.addColorStop(i / (SPECTRUM.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(x + w * (17 / 26), y, w * (9 / 26), h);
  ctx.restore();
  ctx.strokeStyle = 'rgb(0 0 0 / 0.12)';
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, h * 0.2);
  ctx.stroke();
  return w;
}

// What the card says, per mode.
export function cardContent({ mode, pool, results, score, dailyNumber, url, streak = 0, bestCombo = 0, duel = null, rank = null }) {
  const label = POOL_LABELS[pool];
  const n = results.length;
  const c = { results, url: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), extra: '' };
  if (mode === 'daily') {
    Object.assign(c, { eyebrow: `Daily #${dailyNumber}`, big: `${score}`, unit: '%', grade: gradeFor(score) });
    c.extra = [
      rank?.place ? `🏆 #${rank.place} of ${rank.total.toLocaleString('en-US')}` : '',
      streak > 1 ? `🔥 ${streak}-day streak` : '',
    ].filter(Boolean).join(' · ');
  } else if (mode === 'timed') {
    Object.assign(c, { eyebrow: `Time Attack · ${label}`, big: score.toLocaleString('en-US'), unit: ' pts' });
    c.extra = `${n} ${n === 1 ? 'flag' : 'flags'}${bestCombo >= 2 ? ` · 🔥 best combo ×${bestCombo}` : ''}`;
  } else if (mode === 'endless') {
    Object.assign(c, { eyebrow: `Endless · ${label}`, big: `${score}`, unit: score === 1 ? ' flag' : ' flags' });
    c.extra = 'painted before running out of hearts';
  } else {
    const name = mode === 'duel' ? 'Duel' : 'Classic';
    Object.assign(c, { eyebrow: `${name} · ${label}`, big: `${score}`, unit: '%', grade: gradeFor(score) });
    if (duel) c.extra = `⚔️ ${{ win: 'I won', loss: 'I lost', draw: 'A draw' }[duel.result]}, ${duel.me}% to ${duel.them}%`;
  }
  return c;
}

export async function drawShareCard(options) {
  const c = cardContent(options);
  try {
    await Promise.all(['400', '600', '700', '800'].map((w) => document.fonts?.load(`${w} 40px Inter`)));
  } catch {
    // Falls back to the system font.
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Background with soft glows in the colors of the result.
  ctx.fillStyle = '#f5f5f7';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const tint = COLORS[c.grade?.id] ?? COLORS[c.results.at(-1)?.grade] ?? COLORS.great;
  for (const [x, y, r, color, a] of [[SIZE * 0.9, SIZE * 0.1, 520, tint, 0.28], [SIZE * 0.05, SIZE * 0.95, 560, '#3b82f6', 0.16]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`);
    g.addColorStop(1, `${color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  // Tiles layout first: the card's height follows its content, and the whole
  // block is centered.
  const shown = c.results.slice(0, MAX_TILES);
  const perRow = shown.length <= 5 ? 5 : 10;
  const gap = perRow === 5 ? 18 : 12;
  const x = PAD + 36;
  const tileW = (SIZE - 2 * x - gap * (perRow - 1)) / perRow;
  const tileH = perRow === 5 ? 120 : tileW;
  const rows = Math.ceil(shown.length / perRow);
  const tilesH = rows * tileH + (rows - 1) * gap;
  const hasExtra = Boolean(c.extra) || c.results.length > shown.length;
  const cardH = 90 + 190 + 70 + tilesH + (hasExtra ? 80 : 0) + 76;
  const headerY = Math.round((SIZE - (52 + 64 + cardH + 100)) / 2);
  const top = headerY + 116;

  // Card.
  ctx.save();
  ctx.shadowColor = 'rgb(18 18 22 / 0.10)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, PAD - 24, top, SIZE - 2 * (PAD - 24), cardH, 48);
  ctx.fill();
  ctx.restore();

  // Header: mark and name.
  const markW = drawMark(ctx, PAD, headerY, 52);
  ctx.fillStyle = '#121216';
  ctx.font = `750 56px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Flagtone', PAD + markW + 22, headerY + 28);

  // Eyebrow.
  let y = top + 90;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8a8a94';
  ctx.font = `650 34px ${FONT}`;
  ctx.fillText(c.eyebrow.toUpperCase(), x, y);

  // Score.
  y += 190;
  ctx.fillStyle = '#121216';
  ctx.font = `800 200px ${FONT}`;
  ctx.fillText(c.big, x - 6, y);
  const bigW = ctx.measureText(c.big).width;
  ctx.fillStyle = '#5c5c66';
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(c.unit, x + bigW + 4, y);

  // Grade pill, to the right of the score.
  if (c.grade) {
    const unitW = ctx.measureText(c.unit).width;
    ctx.font = `700 40px ${FONT}`;
    const text = c.grade.label;
    const pw = ctx.measureText(text).width + 52;
    const px = Math.min(x + bigW + unitW + 36, SIZE - PAD - 36 - pw);
    const color = COLORS[c.grade.id];
    ctx.fillStyle = `${color}2e`;
    roundRect(ctx, px, y - 70, pw, 64, 32);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, px + 26, y - 24);
  }

  // One tile per flag.
  y += 70;
  shown.forEach((r, i) => {
    const tx = x + (i % perRow) * (tileW + gap);
    const ty = y + Math.floor(i / perRow) * (tileH + gap);
    const color = COLORS[r.grade];
    ctx.fillStyle = perRow === 5 ? `${color}26` : color;
    roundRect(ctx, tx, ty, tileW, tileH, perRow === 5 ? 24 : 12);
    ctx.fill();
    if (perRow === 5) {
      ctx.fillStyle = color;
      ctx.fillRect(tx + 24, ty + tileH - 22, tileW - 48, 8);
      ctx.fillStyle = '#121216';
      ctx.font = `750 44px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${r.percent}%`, tx + tileW / 2, ty + 66);
      ctx.textAlign = 'left';
    }
  });
  y += tilesH;

  // Extra line, inside the card's bottom.
  if (hasExtra) {
    ctx.fillStyle = '#5c5c66';
    ctx.font = `600 38px ${FONT}`;
    const more = c.results.length > shown.length ? ` · +${c.results.length - shown.length} more` : '';
    ctx.fillText(`${c.extra}${more}`.replace(/^ · /, ''), x, y + 80);
  }

  // Legend and link under the card.
  ctx.font = `600 32px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5c5c66';
  ctx.fillText(c.url ? `Mix the missing flag color · ${c.url}` : 'Mix the missing flag color', SIZE / 2, top + cardH + 84);
  ctx.textAlign = 'left';
  return canvas;
}

export async function shareCardFile(options) {
  const canvas = await drawShareCard(options);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not draw the card');
  return new File([blob], 'flagtone.png', { type: 'image/png' });
}
