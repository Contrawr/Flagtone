// Everything kept between visits: best scores, lifetime stats, Daily progress.
// Storage may be missing, blocked or full, so every access is guarded and the
// game works without it.
import { shiftDay } from './daily.js';
import { newPlayerId } from './ranking.js';
import { PERFECT_PERCENT, ROUNDS } from './game.js';
import { flagByCode } from './flags.js';
import { GRADES } from './rating.js';

const PREFIX = 'flagtone:';
const OLD_PREFIX = 'geopaint:v2:'; // before the game was renamed
const EMPTY_STATS = { games: 0, flags: 0, perfects: 0, percentSum: 0 };
const HEX = /^#[0-9a-f]{6}$/;

// A saved round as the game wrote it; anything else (an older format, a manual
// edit, a half-written value) is ignored rather than allowed to break a screen.
function validRound(r) {
  return r && typeof r === 'object'
    && typeof r.code === 'string' && flagByCode(r.code)
    && Number.isFinite(r.percent) && r.percent >= 0 && r.percent <= 100
    && GRADES.some((g) => g.id === r.grade)
    && HEX.test(r.guessHex) && HEX.test(r.trueHex);
}

// One-time copy of progress saved under the game's old name, so bests, stats and
// the Daily streak survive the rename. Existing new-name values are kept.
export function migrateStorage(storage) {
  try {
    if (!storage || storage.getItem(`${PREFIX}migrated`) != null) return;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(OLD_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const target = PREFIX + key.slice(OLD_PREFIX.length);
      if (storage.getItem(target) == null) storage.setItem(target, storage.getItem(key));
    }
    storage.setItem(`${PREFIX}migrated`, 'true');
  } catch {
    // Storage unavailable: nothing to migrate.
  }
}

// The fields of a round worth keeping (no functions, no transient state).
function keepRounds(results) {
  return results.map(({ code, name, guessHex, trueHex, deltaE, percent, grade, parts }) =>
    ({ code, name, guessHex, trueHex, deltaE, percent, grade, ...(parts ? { parts } : {}) }));
}

export class Records {
  constructor(storage = null) {
    this.storage = storage;
  }

  read(key) {
    try {
      const raw = this.storage?.getItem(PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  write(key, value) {
    try {
      this.storage?.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, quota): this just isn't kept.
    }
  }

  best(mode, tier) {
    const n = this.read(`best:${mode}:${tier}`);
    return Number.isFinite(n) ? n : null;
  }

  stats() {
    const s = this.read('stats');
    const stats = { ...EMPTY_STATS };
    for (const key of Object.keys(EMPTY_STATS)) {
      const n = Number(s?.[key]);
      if (Number.isFinite(n) && n >= 0) stats[key] = n;
    }
    return stats;
  }

  // Records a finished game. Returns whether it beat the best for its mode and tier
  // (the Daily has no best; it has a streak).
  finishGame(game) {
    const s = this.stats();
    this.write('stats', {
      games: s.games + 1,
      flags: s.flags + game.results.length,
      perfects: s.perfects + game.results.filter((r) => r.percent >= PERFECT_PERCENT).length,
      percentSum: s.percentSum + game.results.reduce((sum, r) => sum + r.percent, 0),
    });
    if (game.mode === 'daily' || game.mode === 'duel') return { isNewBest: false, previousBest: null };
    const previousBest = this.best(game.mode, game.tier);
    const score = game.finalScore();
    const isNewBest = score > 0 && (previousBest == null || score > previousBest);
    if (isNewBest) this.write(`best:${game.mode}:${game.tier}`, score);
    return { isNewBest, previousBest };
  }

  // Rounds played in the Daily for `key`, and whether it is finished.
  daily(key) {
    const d = this.read(`daily:${key}`);
    if (!d || !Array.isArray(d.results) || d.results.length > ROUNDS || !d.results.every(validRound)) return null;
    return { results: d.results, done: d.done === true && d.results.length === ROUNDS };
  }

  saveDaily(key, results, done) {
    this.write(`daily:${key}`, { results: keepRounds(results), done });
  }

  // ---------- Collection: best match per flag ever played ----------
  collection() {
    const c = this.read('collection');
    if (!c || typeof c !== 'object') return {};
    return Object.fromEntries(Object.entries(c).filter(([code, n]) => flagByCode(code) && Number.isFinite(n)));
  }

  // Adds a round to the collection. Returns true if the flag is new to it.
  collect(code, percent) {
    const c = this.collection();
    const isNew = !(code in c);
    if (isNew || percent > c[code]) {
      c[code] = percent;
      this.write('collection', c);
    }
    return isNew;
  }

  // ---------- Counters for badges ----------
  counters() {
    const c = this.read('counters');
    return { maxCombo: Number(c?.maxCombo) || 0, duelWins: Number(c?.duelWins) || 0 };
  }

  noteCombo(combo) {
    const c = this.counters();
    if (combo > c.maxCombo) this.write('counters', { ...c, maxCombo: combo });
  }

  noteDuelWin() {
    const c = this.counters();
    this.write('counters', { ...c, duelWins: c.duelWins + 1 });
  }

  // ---------- Badges: id → date unlocked ----------
  unlocked() {
    const u = this.read('badges');
    return u && typeof u === 'object' ? u : {};
  }

  unlock(ids, date) {
    if (!ids.length) return;
    this.write('badges', { ...this.unlocked(), ...Object.fromEntries(ids.map((id) => [id, date])) });
  }

  // ---------- Duels played from a link, by seed ----------
  duel(seed) {
    const d = this.read(`duel:${seed}`);
    return d && Array.isArray(d.results) && d.results.length === ROUNDS && d.results.every(validRound) ? d : null;
  }

  saveDuel(seed, results) {
    this.write(`duel:${seed}`, { results: keepRounds(results) });
  }

  // Consecutive finished Dailies up to today (or yesterday, if today's isn't done yet).
  dailyStreak(today) {
    let key = this.daily(today)?.done ? today : shiftDay(today, -1);
    let streak = 0;
    while (this.daily(key)?.done && streak < 3650) {
      streak++;
      key = shiftDay(key, -1);
    }
    return streak;
  }

  get seenHelp() {
    return this.read('seenHelp') === true;
  }

  markHelpSeen() {
    this.write('seenHelp', true);
  }

  // Daily ranking: a random id for this browser, the chosen nickname, and the
  // place last seen for a day.
  player() {
    let p = this.read('player');
    if (!p?.id) {
      p = { id: newPlayerId(), nickname: null };
      this.write('player', p);
    }
    return p;
  }

  setNickname(nickname) {
    this.write('player', { ...this.player(), nickname });
  }

  ranked(day) {
    return this.read(`ranked:${day}`);
  }

  saveRanked(day, value) {
    this.write(`ranked:${day}`, value);
  }
}
