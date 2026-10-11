// Spoiler-free result text to paste anywhere: one colored square per flag.
import { GRADES } from './rating.js';

const TIER_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible' };
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

export function shareText({ mode, tier, results, score, dailyNumber, url }) {
  let title;
  if (mode === 'daily') title = `Flagtone Daily #${dailyNumber} · ${score}%`;
  else if (mode === 'classic') title = `Flagtone Classic · ${TIER_LABELS[tier]} · ${score}%`;
  else title = `Flagtone Endless · ${TIER_LABELS[tier]} · ${score} ${score === 1 ? 'flag' : 'flags'}`;
  return [`${title} 🎨`, gradeSquares(results), url].filter(Boolean).join('\n');
}
