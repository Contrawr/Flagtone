// The rules of one play-through. No DOM and no storage: randomness and rating are
// injected, so it can be tested in Node.
import { rate as defaultRate, gradeFor } from './rating.js';
import { poolFor, flagByCode, TIERS } from './flags.js';
import { seededRandom } from './daily.js';

export const MODES = ['daily', 'classic', 'endless', 'timed', 'duel'];
export const ROUNDS = 5;            // Daily, Classic and Duel
export const START_HEARTS = 3;      // Endless
export const SAFE_PERCENT = 70;     // Endless: a round below this costs a heart
export const PERFECT_PERCENT = 95;  // Endless: a perfect round wins a lost heart back
export const COMBO_PERCENT = 85;    // Great or better keeps a combo going
export const TIMED_SECONDS = 60;    // Time Attack
export const TIME_BONUS = { perfect: 6, great: 3 };

// Points multiplier for a combo of n rounds in a row: ×1, ×1.25, ×1.5 … ×2.5.
export function comboMultiplier(combo) {
  return Math.min(2.5, 1 + 0.25 * Math.max(0, combo - 1));
}

export function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Five flags from a pool, the same for everyone with the same seed.
export function pickCodes(pool, seed, n = ROUNDS) {
  return shuffle(poolFor(pool).map((f) => f.code), seededRandom(`${seed}:codes`)).slice(0, n);
}

export function newSeed(random = Math.random) {
  return Math.floor(random() * 2 ** 32).toString(36);
}

export class Game {
  constructor({ random = Math.random, rate = defaultRate } = {}) {
    this.random = random;
    this.rate = rate;
    this.mode = null;
    this.pool = null;
  }

  // `codes` fixes the flag order (Daily, Classic, Duel). `seed` makes each round's
  // hidden colors reproducible. `results` are rounds already played (a resumed Daily).
  start(mode, pool, { codes = null, seed = null, results = [] } = {}) {
    this.mode = mode;
    this.pool = pool;
    this.codes = codes;
    this.seed = seed;
    this.results = results.map((r) => ({ ...r }));
    this.hearts = START_HEARTS;
    this.lastCode = null;
    this.queue = [];
    this.combo = 0;
    this.bestCombo = 0;
    this.points = 0;
    this.timeLeft = TIMED_SECONDS;
    this.timeUp = false;
    for (const r of this.results) this.track(r);
  }

  // Kept for older callers and saved games: the difficulty tier, if the pool is one.
  get tier() {
    return this.pool;
  }

  // A per-round generator for seeded games; plain randomness otherwise.
  roundRandom(code) {
    return this.seed ? seededRandom(`${this.seed}:${code}`) : this.random;
  }

  // Next flag to show. A fixed order always offers the current round's flag (so a
  // failed load retries it). Otherwise the pool is shuffled, reshuffled when it
  // runs out, and never shows the same flag twice in a row.
  nextFlagCode() {
    if (this.codes) return this.codes[this.results.length];
    if (this.queue.length === 0) {
      this.queue = shuffle(poolFor(this.pool).map((f) => f.code), this.random);
      if (this.queue[0] === this.lastCode && this.queue.length > 1) {
        [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
      }
    }
    this.lastCode = this.queue.shift();
    return this.lastCode;
  }

  // Whether this round hides two colors (the flag must have two hideable ones).
  // `chance` is a number in [0, 1) from the round's generator.
  wantsTwoColors(chance) {
    const round = this.results.length + 1;
    if (this.mode === 'timed') return false;
    if (this.mode === 'daily') return round >= 4;
    if (this.mode === 'endless') return this.results.length >= 10 && chance < 0.4;
    if (this.pool === 'hard' || this.pool === 'impossible') return chance < 0.5;
    if (!TIERS.includes(this.pool)) return chance < 0.3;
    return false;
  }

  get round() {
    return this.results.length + 1;
  }

  // Mean match % of the rounds played so far.
  get average() {
    if (this.results.length === 0) return 0;
    return Math.round(this.results.reduce((sum, r) => sum + r.percent, 0) / this.results.length);
  }

  // Updates combo and points for a result (also used to replay saved rounds).
  track(result) {
    this.combo = result.percent >= COMBO_PERCENT ? this.combo + 1 : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.points += result.points ?? result.percent;
  }

  // `guess` and `truth` are hex strings, or arrays of them for a two-color round.
  submit(code, guess, truth) {
    const guesses = [guess].flat();
    const truths = [truth].flat();
    const parts = guesses.map((g, i) => ({ guessHex: g, trueHex: truths[i], ...this.rate(g, truths[i]) }));
    const percent = Math.round(parts.reduce((s, p) => s + p.percent, 0) / parts.length);
    const deltaE = parts.reduce((s, p) => s + p.deltaE, 0) / parts.length;
    const grade = parts.length === 1 ? parts[0].grade : gradeFor(percent).id;

    let heartChange = 0;
    if (this.mode === 'endless') {
      if (percent < SAFE_PERCENT) heartChange = -1;
      else if (percent >= PERFECT_PERCENT && this.hearts < START_HEARTS) heartChange = 1;
      this.hearts += heartChange;
    }
    const combo = percent >= COMBO_PERCENT ? this.combo + 1 : 0;
    const points = Math.round(percent * comboMultiplier(combo));
    let timeBonus = 0;
    if (this.mode === 'timed') {
      timeBonus = TIME_BONUS[grade] ?? 0;
      this.timeLeft += timeBonus;
    }
    const result = {
      code, name: flagByCode(code).name, guessHex: guesses[0], trueHex: truths[0],
      deltaE, percent, grade, heartChange, combo, points, timeBonus,
    };
    if (parts.length > 1) result.parts = parts.map(({ guessHex, trueHex, percent: p, grade: g }) => ({ guessHex, trueHex, percent: p, grade: g }));
    this.results.push(result);
    this.track(result);
    return result;
  }

  // Time Attack: counts the clock down; returns true when time has just run out.
  tick(seconds) {
    if (this.mode !== 'timed' || this.timeUp) return false;
    this.timeLeft = Math.max(0, this.timeLeft - seconds);
    if (this.timeLeft === 0) this.timeUp = true;
    return this.timeUp;
  }

  isOver() {
    if (this.mode === 'endless') return this.hearts <= 0;
    if (this.mode === 'timed') return this.timeUp;
    return this.results.length >= ROUNDS;
  }

  // Daily, Classic, Duel: average match %. Endless: flags painted. Time Attack: points.
  finalScore() {
    if (this.mode === 'endless') return this.results.length;
    if (this.mode === 'timed') return this.points;
    return this.average;
  }
}
