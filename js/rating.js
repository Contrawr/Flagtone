// How close a guess is, in terms a player understands: a match percentage, a
// named grade, and a hint about what was off.
import { hexToRgb, hexToHsb, rgbToLab, deltaE2000, deltaE2000Terms } from './colors.js';

// Perceptual distance (CIEDE2000) → match % (0–100). Forgiving at the top, where
// differences are hard to see, and steep in the middle:
// ΔE 1 → 99, 2 → 98, 5 → 91, 10 → 76, 20 → 47, 30 → 25, 50 → 5.
export function matchPercent(deltaE) {
  return Math.round(100 * Math.exp(-((deltaE / 24) ** 1.5)));
}

export const GRADES = [
  { id: 'perfect', min: 95, label: 'Perfect', emoji: '🟪', blurb: 'Practically identical' },
  { id: 'great', min: 85, label: 'Great', emoji: '🟩', blurb: 'Hard to tell apart' },
  { id: 'good', min: 70, label: 'Good', emoji: '🟨', blurb: 'Close at a glance' },
  { id: 'close', min: 50, label: 'Close', emoji: '🟧', blurb: 'Right idea, visibly off' },
  { id: 'off', min: 0, label: 'Off', emoji: '🟥', blurb: 'A different color' },
];

export function gradeFor(percent) {
  return GRADES.find((g) => percent >= g.min);
}

export function rate(guessHex, trueHex) {
  const deltaE = deltaE2000(rgbToLab(hexToRgb(guessHex)), rgbToLab(hexToRgb(trueHex)));
  const percent = matchPercent(deltaE);
  return { deltaE, percent, grade: gradeFor(percent).id };
}

// Hue families on the HSB wheel (upper bound in degrees → name).
const HUES = [
  [15, 'red'], [45, 'orange'], [70, 'yellow'], [165, 'green'], [195, 'teal'],
  [255, 'blue'], [290, 'purple'], [340, 'pink'], [360, 'red'],
];

export function hueName(h) {
  const deg = ((h % 360) + 360) % 360;
  return HUES.find(([max]) => deg < max)[1];
}

// The hue family a guess drifted toward: its own family if it left the target's,
// otherwise the target's neighbor on that side of the wheel.
function driftName(targetH, guessH) {
  const own = hueName(guessH);
  const base = hueName(targetH);
  if (own !== base) return own;
  const dir = Math.sign(((guessH - targetH + 540) % 360) - 180) || 1;
  for (let step = 5; step < 180; step += 5) {
    const name = hueName(targetH + dir * step);
    if (name !== base) return name;
  }
  return base;
}

function amount(x) {
  const a = Math.abs(x);
  if (a < 4) return 'slightly ';
  if (a < 9) return 'a bit ';
  if (a < 18) return '';
  return 'much ';
}

// Plain-language hint about the biggest differences, e.g.
// "A bit too dark and slightly too orange." Empty when the guess is spot on.
export function describeMiss(guessHex, trueHex) {
  const target = rgbToLab(hexToRgb(trueHex));
  const guess = rgbToLab(hexToRgb(guessHex));
  if (matchPercent(deltaE2000(guess, target)) >= GRADES[0].min) return '';
  const { l, c, h } = deltaE2000Terms(target, guess);
  const t = hexToHsb(trueHex);
  const g = hexToHsb(guessHex);
  const neutral = t.s < 0.12 || t.v < 0.12;

  const parts = [{ size: l, text: l > 0 ? 'too light' : 'too dark' }];
  if (neutral) {
    if (c > 0) parts.push({ size: c, text: 'too colorful' });
  } else {
    parts.push({ size: c, text: c > 0 ? 'too vivid' : 'too dull' });
    parts.push({ size: h, text: `too ${driftName(t.h, g.h)}` });
  }
  const biggest = Math.max(...parts.map((p) => Math.abs(p.size)));
  const phrases = parts
    .filter((p) => Math.abs(p.size) >= Math.max(1.5, biggest * 0.35))
    .sort((a, b) => Math.abs(b.size) - Math.abs(a.size))
    .slice(0, 2)
    .map((p) => amount(p.size) + p.text);
  if (phrases.length === 0) return '';
  const sentence = phrases.join(' and ');
  return sentence[0].toUpperCase() + sentence.slice(1) + '.';
}
