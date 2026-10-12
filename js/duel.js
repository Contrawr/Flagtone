// Duel links. A finished Classic game's flags, seed and scores travel inside the
// URL, so a friend can play the exact same puzzle and compare, without a server.
import { POOLS, flagByCode } from './flags.js';
import { ROUNDS } from './game.js';

const toBase64Url = (text) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => atob(text.replace(/-/g, '+').replace(/_/g, '/'));

export function encodeDuel({ pool, seed, codes, percents }) {
  return toBase64Url(JSON.stringify({ v: 1, p: pool, s: seed, c: codes, r: percents }));
}

// The duel in a link, or null if it is missing or malformed.
export function decodeDuel(text) {
  if (!text || text.length > 400) return null;
  try {
    const d = JSON.parse(fromBase64Url(text));
    const ok = d && d.v === 1
      && POOLS.includes(d.p)
      && typeof d.s === 'string' && /^[a-z0-9]{1,16}$/.test(d.s)
      && Array.isArray(d.c) && d.c.length === ROUNDS && d.c.every((c) => typeof c === 'string' && flagByCode(c))
      && new Set(d.c).size === ROUNDS
      && Array.isArray(d.r) && d.r.length === ROUNDS && d.r.every((n) => Number.isInteger(n) && n >= 0 && n <= 100);
    return ok ? { pool: d.p, seed: d.s, codes: d.c, percents: d.r } : null;
  } catch {
    return null;
  }
}

export function duelUrl(base, duel) {
  return `${base}?duel=${encodeDuel(duel)}`;
}

// Who won, by average match.
export function duelOutcome(mine, theirs) {
  const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const me = avg(mine);
  const them = avg(theirs);
  return { me, them, result: me > them ? 'win' : me < them ? 'loss' : 'draw' };
}
