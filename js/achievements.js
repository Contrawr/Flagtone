// Badges. Each one checks a context built after every round and every finished
// game; unlocking is recorded by records.js.
import { FLAGS, REGIONS, flagByCode } from './flags.js';
import { PERFECT_PERCENT, COMBO_PERCENT } from './game.js';

const collected = (ctx) => Object.keys(ctx.collection).length;
const finished = (ctx, mode) => ctx.finished && ctx.game?.mode === mode;

export const ACHIEVEMENTS = [
  { id: 'first-game', icon: '🎨', name: 'First coat', desc: 'Finish your first game.', check: (c) => c.stats.games >= 1 },
  { id: 'first-perfect', icon: '💎', name: 'Spot on', desc: 'Get your first Perfect.', check: (c) => c.stats.perfects >= 1 },
  { id: 'perfect-25', icon: '🎯', name: 'Sharp eye', desc: 'Get 25 Perfects in total.', check: (c) => c.stats.perfects >= 25 },
  { id: 'flags-100', icon: '🖌️', name: 'Busy brush', desc: 'Paint 100 flags.', check: (c) => c.stats.flags >= 100 },
  { id: 'combo-3', icon: '🔥', name: 'On a roll', desc: 'Reach a combo of 3.', check: (c) => c.maxCombo >= 3 },
  { id: 'combo-6', icon: '⚡', name: 'Unstoppable', desc: 'Reach a combo of 6.', check: (c) => c.maxCombo >= 6 },
  { id: 'daily-1', icon: '📅', name: 'Daily habit', desc: 'Finish a Daily.', check: (c) => c.streak >= 1 || finished(c, 'daily') },
  { id: 'streak-7', icon: '🗓️', name: 'Week strong', desc: 'Keep a 7-day Daily streak.', check: (c) => c.streak >= 7 },
  {
    id: 'daily-great', icon: '👑', name: 'Flawless', desc: 'Score Great or better on all five Daily flags.',
    check: (c) => finished(c, 'daily') && c.game.results.every((r) => r.percent >= COMBO_PERCENT),
  },
  { id: 'classic-90', icon: '🏅', name: 'Masterpiece', desc: 'Average 90% or more in a Classic game.', check: (c) => finished(c, 'classic') && c.game.average >= 90 },
  { id: 'endless-10', icon: '❤️', name: 'Survivor', desc: 'Paint 10 flags in one Endless run.', check: (c) => c.game?.mode === 'endless' && c.game.results.length >= 10 },
  { id: 'endless-25', icon: '🛡️', name: 'Iron palette', desc: 'Paint 25 flags in one Endless run.', check: (c) => c.game?.mode === 'endless' && c.game.results.length >= 25 },
  { id: 'timed-500', icon: '⏱️', name: 'Quick hands', desc: 'Score 500 points in Time Attack.', check: (c) => c.game?.mode === 'timed' && c.game.points >= 500 },
  { id: 'timed-1000', icon: '🚀', name: 'Speed painter', desc: 'Score 1,000 points in Time Attack.', check: (c) => c.game?.mode === 'timed' && c.game.points >= 1000 },
  {
    id: 'two-color-perfect', icon: '🌗', name: 'Double vision', desc: 'Get a Perfect on a two-color flag.',
    check: (c) => Boolean(c.result?.parts) && c.result.percent >= PERFECT_PERCENT,
  },
  {
    id: 'impossible-great', icon: '🏝️', name: 'Island hopper', desc: 'Score Great or better on an Impossible flag.',
    check: (c) => Boolean(c.result) && flagByCode(c.result.code)?.tier === 'impossible' && c.result.percent >= COMBO_PERCENT,
  },
  { id: 'duel-win', icon: '⚔️', name: 'Duelist', desc: 'Win a duel.', check: (c) => c.duelWins >= 1 },
  { id: 'collect-50', icon: '🗂️', name: 'Collector', desc: 'Collect 50 flags.', check: (c) => collected(c) >= 50 },
  {
    id: 'collect-region', icon: '🌍', name: 'Continental', desc: 'Collect every flag of one region.',
    check: (c) => REGIONS.some((r) => FLAGS.filter((f) => f.region === r).every((f) => f.code in c.collection)),
  },
  { id: 'collect-all', icon: '🏆', name: 'World complete', desc: `Collect all ${FLAGS.length} flags.`, check: (c) => collected(c) >= FLAGS.length },
];

// Badges whose condition holds now but that aren't unlocked yet.
export function newlyUnlocked(ctx, unlocked) {
  return ACHIEVEMENTS.filter((a) => !(a.id in unlocked) && a.check(ctx));
}
