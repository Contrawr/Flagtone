// Spoiler-free result text to paste anywhere: one colored square per flag.
import { GRADES } from './rating.js';

export const POOL_LABELS = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible',
  europe: 'Europe', africa: 'Africa', americas: 'Americas', asia: 'Asia', oceania: 'Oceania',
};
const SQUARES_PER_LINE = 10;

export function flagEmoji(code) {
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0))).join('');
}

export function gradeSquares(results) {
  const squares = results.map((r) => GRADES.find((g) => g.id === r.grade).emoji);
  const lines = [];
  for (let i = 0; i < squares.length; i += SQUARES_PER_LINE) {
    lines.push(squares.slice(i, i + SQUARES_PER_LINE).join(''));
  }
  return lines.join('\n');
}

export function shareText({ mode, tier, pool = tier, results, score, dailyNumber, url }) {
  const label = POOL_LABELS[pool];
  let title;
  if (mode === 'daily') title = `Flagtone Daily #${dailyNumber} · ${score}%`;
  else if (mode === 'classic' || mode === 'duel') title = `Flagtone ${mode === 'duel' ? 'Duel' : 'Classic'} · ${label} · ${score}%`;
  else if (mode === 'timed') title = `Flagtone Time Attack · ${label} · ${score.toLocaleString('en-US')} points`;
  else title = `Flagtone Endless · ${label} · ${score} ${score === 1 ? 'flag' : 'flags'}`;
  return [`${title} 🎨`, gradeSquares(results), url].filter(Boolean).join('\n');
}
