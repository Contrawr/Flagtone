// The Daily challenge: the same five flags, hidden colors and starting sliders for
// everyone on a given date, from a seeded random generator.
import { poolFor } from './flags.js';

// One flag from each slot, easiest first.
export const DAILY_TIERS = ['easy', 'medium', 'medium', 'hard', 'impossible'];
const FIRST_DAILY = '2026-10-09';

// Local calendar date as YYYY-MM-DD.
export function dateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function shiftDay(key, days) {
  return new Date(keyToUtc(key) + days * 86_400_000).toISOString().slice(0, 10);
}

// Daily #1 is the first one; numbers keep counting up from there.
export function dailyNumber(key) {
  return Math.round((keyToUtc(key) - keyToUtc(FIRST_DAILY)) / 86_400_000) + 1;
}

// FNV-1a: a stable 32-bit hash of a string.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32, seeded from a string: () => [0, 1).
export function seededRandom(seed) {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The seeds keep the game's original name so every date keeps its puzzle.
const SEED = 'geopaint-daily';

export function dailyCodes(key) {
  const random = seededRandom(`${SEED}:${key}`);
  const codes = [];
  for (const tier of DAILY_TIERS) {
    const pool = poolFor(tier).map((f) => f.code).filter((c) => !codes.includes(c));
    codes.push(pool[Math.floor(random() * pool.length)]);
  }
  return codes;
}

// Per-round generator: picks the hidden color, then the starting hue.
export function dailyRoundRandom(key, code) {
  return seededRandom(`${SEED}:${key}:${code}`);
}
