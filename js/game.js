// Game state machine. No DOM access: storage, randomness and scoring are injected.
import { matchScore } from './colors.js';
import { poolFor, flagByCode } from './flags.js';

export const STANDARD_ROUNDS = 5;
export const START_LIVES = 3;
export const LIFE_THRESHOLD = 7;

function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor({ storage = null, random = Math.random, score = matchScore } = {}) {
    this.storage = storage;
    this.random = random;
    this.score = score;
    this.mode = null;
    this.tier = null;
  }

  start(mode, tier) {
    this.mode = mode;
    this.tier = tier;
    this.results = [];
    this.lives = START_LIVES;
    this.lastCode = null;
    this.queue = [];
    this.isNewBest = false;
  }

  // Next flag to show. Standard never repeats; Infinite reshuffles the pool when
  // it runs out and never shows the same flag twice in a row.
  nextFlagCode() {
    if (this.queue.length === 0) {
      const codes = poolFor(this.tier).map((f) => f.code);
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

  get total() {
    return Math.round(this.results.reduce((sum, r) => sum + r.score, 0) * 10) / 10;
  }

  submit(code, guessHex, trueHex) {
    const { deltaE, score } = this.score(guessHex, trueHex);
    const lostLife = this.mode === 'infinite' && score < LIFE_THRESHOLD;
    if (lostLife) this.lives -= 1;
    const result = { code, name: flagByCode(code).name, guessHex, trueHex, deltaE, score, lostLife };
    this.results.push(result);
    if (this.isOver()) this.saveBest();
    return result;
  }

  isOver() {
    if (this.mode === 'standard') return this.results.length >= STANDARD_ROUNDS;
    return this.lives <= 0;
  }

  // Standard: total out of 50. Infinite: flags completed (the streak).
  finalScore() {
    return this.mode === 'standard' ? this.total : this.results.length;
  }

  bestFor(mode, tier) {
    try {
      const raw = this.storage?.getItem(`geopaint:best:${mode}:${tier}`);
      return raw == null ? null : Number(raw);
    } catch {
      return null;
    }
  }

  saveBest() {
    const previous = this.bestFor(this.mode, this.tier);
    const current = this.finalScore();
    if (previous == null || current > previous) {
      this.isNewBest = true;
      try {
        this.storage?.setItem(`geopaint:best:${this.mode}:${this.tier}`, String(current));
      } catch {
        // Storage unavailable (private mode): the best score just isn't kept.
      }
    }
  }
}
