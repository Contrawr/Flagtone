// The rules of one play-through. No DOM and no storage: randomness and rating are
// injected, so it can be tested in Node.
import { rate as defaultRate } from './rating.js';
import { poolFor, flagByCode } from './flags.js';

export const MODES = ['daily', 'classic', 'endless'];
export const ROUNDS = 5;            // Daily and Classic
export const START_HEARTS = 3;      // Endless
export const SAFE_PERCENT = 70;     // Endless: a round below this costs a heart
export const PERFECT_PERCENT = 95;  // Endless: a perfect round wins a lost heart back

export function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor({ random = Math.random, rate = defaultRate } = {}) {
    this.random = random;
    this.rate = rate;
    this.mode = null;
    this.tier = null;
  }

  // `codes` fixes the flag order (Daily). `results` are rounds already played,
  // when resuming a Daily that was left part-way.
  start(mode, tier, { codes = null, results = [] } = {}) {
    this.mode = mode;
    this.tier = tier;
    this.codes = codes;
    this.results = results.map((r) => ({ ...r }));
    this.hearts = START_HEARTS;
    this.lastCode = null;
    this.queue = [];
  }

  // Next flag to show. A fixed order always offers the current round's flag (so a
  // failed load retries it). Classic never repeats; Endless reshuffles the pool
  // when it runs out and never shows the same flag twice in a row.
  nextFlagCode() {
    if (this.codes) return this.codes[this.results.length];
    if (this.queue.length === 0) {
      let codes = poolFor(this.tier).map((f) => f.code);
      if (this.mode === 'classic') {
        // Failed loads consume codes, so a refill must not bring back played flags.
        const played = new Set(this.results.map((r) => r.code));
        codes = codes.filter((c) => !played.has(c));
      }
      this.queue = shuffle(codes, this.random);
      if (this.queue[0] === this.lastCode && this.queue.length > 1) {
        [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
      }
    }
    this.lastCode = this.queue.shift();
    return this.lastCode;
  }

  get round() {
    return this.results.length + 1;
  }

  // Mean match % of the rounds played so far.
  get average() {
    if (this.results.length === 0) return 0;
    return Math.round(this.results.reduce((sum, r) => sum + r.percent, 0) / this.results.length);
  }

  submit(code, guessHex, trueHex) {
    const { deltaE, percent, grade } = this.rate(guessHex, trueHex);
    let heartChange = 0;
    if (this.mode === 'endless') {
      if (percent < SAFE_PERCENT) heartChange = -1;
      else if (percent >= PERFECT_PERCENT && this.hearts < START_HEARTS) heartChange = 1;
      this.hearts += heartChange;
    }
    const result = { code, name: flagByCode(code).name, guessHex, trueHex, deltaE, percent, grade, heartChange };
    this.results.push(result);
    return result;
  }

  isOver() {
    if (this.mode === 'endless') return this.hearts <= 0;
    return this.results.length >= ROUNDS;
  }

  // Daily and Classic: average match %. Endless: flags painted.
  finalScore() {
    return this.mode === 'endless' ? this.results.length : this.average;
  }
}
