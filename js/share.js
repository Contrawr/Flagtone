// Spoiler-free result text to paste anywhere: one colored square per flag.
import { GRADES, gradeFor } from './rating.js';

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

// Title line, score line, the squares, an optional extra line, then the link.
export function shareText({ mode, tier, pool = tier, results, score, dailyNumber, url, streak = 0, bestCombo = 0, duel = null }) {
  const label = POOL_LABELS[pool];
  const pct = (n) => `${n}% · ${gradeFor(n).label}`;
  let title;
  let line;
  const extra = [];
  if (mode === 'daily') {
    title = `🎨 Flagtone Daily #${dailyNumber}`;
    line = pct(score);
    if (streak > 1) extra.push(`🔥 ${streak}-day streak`);
  } else if (mode === 'duel') {
    title = `⚔️ Flagtone Duel · ${label}`;
    line = pct(score);
    if (duel) extra.push(`${{ win: 'I won', loss: 'I lost', draw: 'A draw' }[duel.result]}, ${duel.me}% to ${duel.them}%`);
  } else if (mode === 'timed') {
    title = `⏱️ Flagtone Time Attack · ${label}`;
    line = `${score.toLocaleString('en-US')} points · ${results.length} ${results.length === 1 ? 'flag' : 'flags'}`;
    if (bestCombo >= 2) extra.push(`🔥 Best combo ×${bestCombo}`);
  } else if (mode === 'endless') {
    title = `❤️ Flagtone Endless · ${label}`;
    line = `${score} ${score === 1 ? 'flag' : 'flags'} painted`;
  } else {
    title = `🎨 Flagtone Classic · ${label}`;
    line = pct(score);
  }
  return [title, line, gradeSquares(results), ...extra, url].filter(Boolean).join('\n');
}
