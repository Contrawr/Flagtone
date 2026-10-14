// Screens and event wiring. Rules live in game.js, ratings in rating.js and
// everything kept between visits in records.js; this file only draws.
import {
  Game, ROUNDS, START_HEARTS, SAFE_PERCENT, TIMED_SECONDS, TIME_BONUS, comboMultiplier, pickCodes, newSeed,
} from './game.js';
import { TIERS, REGIONS, FLAGS, flagByCode } from './flags.js';
import { loadFlag, flagUrl, canHideTwo } from './flagLoader.js';
import { hsbToHex, hexToHsb } from './colors.js';
import { GRADES, gradeFor, describeMiss } from './rating.js';
import { Records, migrateStorage } from './records.js';
import { dateKey, dailyCodes, dailyNumber, dailySeed, seededRandom, DAILY_TIERS } from './daily.js';
import { shareText, POOL_LABELS } from './share.js';
import { shareCardFile } from './shareCard.js';
import { rankingEnabled, cleanNickname, submitDaily, fetchBoard, topPercent, NICKNAME_MAX } from './ranking.js';
import { sounds, setMuted, isMuted } from './sound.js';
import { FLAG_DATA } from './flagData.js';
import { ACHIEVEMENTS, newlyUnlocked } from './achievements.js';
import { decodeDuel, duelUrl, duelOutcome } from './duel.js';

export const NAME = 'Flagtone';
const MODE_LABELS = { daily: 'Daily', classic: 'Classic', endless: 'Endless', timed: 'Time Attack', duel: 'Duel' };
const REGION_EMOJI = { europe: '🏰', africa: '🦁', americas: '🗽', asia: '🏯', oceania: '🏝️' };
const MAX_LOAD_ATTEMPTS = 5;
const MAX_END_ROWS = 60;
const TIMED_REVEAL_MS = 1700;
const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';

// The mark: a tricolor whose last band is the whole spectrum, the band you mix.
const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
  <defs>
    <linearGradient id="mark-spectrum" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff3b30"/><stop offset=".22" stop-color="#ffcc00"/>
      <stop offset=".44" stop-color="#34c759"/><stop offset=".64" stop-color="#00b8f0"/>
      <stop offset=".82" stop-color="#3d5cff"/><stop offset="1" stop-color="#b44dff"/>
    </linearGradient>
    <clipPath id="mark-clip"><rect x="3" y="6.5" width="26" height="19" rx="4"/></clipPath>
  </defs>
  <g clip-path="url(#mark-clip)">
    <rect x="3" y="6.5" width="9" height="19" fill="#1f3fbf"/>
    <rect x="12" y="6.5" width="8" height="19" fill="#ffffff"/>
    <rect x="20" y="6.5" width="9" height="19" fill="url(#mark-spectrum)"/>
  </g>
  <rect x="3.5" y="7" width="25" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".18"/>
</svg>`;
const icon = (d, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CLOSE_ICON = icon('<path d="M18 6 6 18M6 6l12 12"/>');
const HELP_ICON = icon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2.1-2.4 3.5"/><path d="M12 17h.01"/>');
const ARROW_ICON = icon('<path d="M5 12h14M13 6l6 6-6 6"/>');
const SHARE_ICON = icon('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>');
const SWORDS_ICON = icon('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l-2 2M7 17l-3 3"/>');
const IMAGE_ICON = icon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>');
const TROPHY = '🏆';
const EYE_ICON = icon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const SOUND_ON = icon('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>');
const SOUND_OFF = icon('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>');
const CHEVRON = icon('<path d="m9 6 6 6-6 6"/>');
const HEART = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.4C1 8.3 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.7 3.8 4.3 7.1C19.5 16.4 12 21 12 21z"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const gradeById = (id) => GRADES.find((g) => g.id === id);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => n.toLocaleString('en-US');

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem('flagtone:probe');
    return s;
  } catch {
    return null;
  }
}

// A shade far from `hex` in brightness, for blinking the area to paint.
function contrastOf(hex) {
  const { h, s, v } = hexToHsb(hex);
  return hsbToHex(h, s * 0.6, v > 0.55 ? v - 0.45 : Math.min(1, v + 0.45));
}

function untilTomorrow() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(1, Math.ceil((midnight - now) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}

// Counts a number up to `value` and fills its meter, if there is one.
function animateScore(root, value, percentForMeter = value) {
  const num = root.querySelector('.count');
  const bar = root.querySelector('.meter i');
  if (reducedMotion()) {
    num.textContent = fmt(value);
    if (bar) bar.style.width = `${percentForMeter}%`;
    return;
  }
  if (bar) {
    bar.getBoundingClientRect();
    requestAnimationFrame(() => { bar.style.width = `${percentForMeter}%`; });
  }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 700);
    num.textContent = fmt(Math.round(value * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Hidden tabs don't run animation frames; make sure the final number lands.
  setTimeout(() => { num.textContent = fmt(value); }, 900);
}

function burst() {
  const colors = ['#8b5cf6', '#eab308', '#22c55e', '#ef4444', '#3b82f6'];
  const dots = Array.from({ length: 14 }, (_, i) =>
    `<i style="--a:${(i * 360) / 14}deg;--c:${colors[i % colors.length]}"></i>`).join('');
  return `<div class="burst" aria-hidden="true">${dots}</div>`;
}

// The Daily's five flags as tiles: difficulty bars, then each round's match once played.
function dailySlots(results) {
  return `<div class="slots" aria-hidden="true">${DAILY_TIERS.map((tier, i) => {
    const r = results[i];
    const level = TIERS.indexOf(tier) + 1;
    const bars = [1, 2, 3, 4].map((b) => `<i${b <= level ? ' class="on"' : ''}></i>`).join('');
    return `<div class="slot"${r ? ` data-grade="${r.grade}"` : ''}>
      <span class="slot-face">${r ? `${r.percent}%` : '?'}</span><span class="bars">${bars}</span>
    </div>`;
  }).join('')}</div>`;
}

function squares(results) {
  return `<div class="squares" aria-hidden="true">${results
    .map((r) => `<i data-grade="${r.grade}"></i>`).join('')}</div>`;
}

// Flag-colored confetti for a Perfect, a new best or a duel win.
function confetti(colors) {
  if (reducedMotion()) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.cssText = `--x:${Math.random() * 100}vw;--d:${(Math.random() * 40 - 20).toFixed(1)}vw;--r:${Math.round(Math.random() * 720 - 360)}deg;` +
      `--t:${(1.6 + Math.random() * 1.4).toFixed(2)}s;--delay:${(Math.random() * 0.35).toFixed(2)}s;background:${colors[i % colors.length]};` +
      `width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px`;
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3400);
}

// Two drifting rows of flags for the home screen.
function flagMarquee() {
  const pool = FLAGS.filter((f) => f.tier === 'easy' || f.tier === 'medium').map((f) => f.code);
  const pick = (n) => Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]);
  const row = (codes, reverse) => {
    const imgs = codes.map((c) => `<img src="${flagUrl(c)}" alt="" style="aspect-ratio:${FLAG_DATA[c].ratio}">`).join('');
    return `<div class="marquee-row${reverse ? ' reverse' : ''}"><div class="marquee-track">${imgs}${imgs}</div></div>`;
  };
  return `<div class="marquee" aria-hidden="true">${row(pick(14), false)}${row(pick(14), true)}</div>`;
}

const flagColors = (code) => FLAG_DATA[code]?.colors.map((c) => c.hex) ?? [];

export function boot(app) {
  const storage = safeStorage();
  migrateStorage(storage);
  const records = new Records(storage);
  const game = new Game();
  const saved = records.read('choice');
  const choice = {
    mode: ['classic', 'endless', 'timed'].includes(saved?.mode) ? saved.mode : 'classic',
    by: saved?.by === 'region' ? 'region' : 'tier',
    tier: TIERS.includes(saved?.tier) ? saved.tier : 'easy',
    region: REGIONS.includes(saved?.region) ? saved.region : 'europe',
  };
  const choicePool = () => (choice.by === 'region' ? choice.region : choice.tier);
  const linkDuel = decodeDuel(new URLSearchParams(location.search).get('duel'));
  let duel = null;     // the duel being played, from a link
  let pending = null;  // prefetched next flag
  let session = 0;     // bumps whenever the current screen's game is left behind
  let dailyKey = null;
  let primary = null;  // the button Enter presses
  let timers = [];
  let clock = null;    // Time Attack: { running, last }
  setMuted(records.read('muted') === true);
  let helpShownOnce = false; // without storage, first-visit help would reopen on every Home

  const help = createHelp();
  const toast = createToast();
  const badgeToast = createBadgeToast();

  function leave() {
    session++;
    pending = null;
    primary = null;
    clock = null;
    for (const t of timers) { clearInterval(t); clearTimeout(t); }
    timers = [];
  }

  function show(screen, html) {
    app.dataset.screen = screen;
    app.innerHTML = html;
    wireTopbar();
    window.scrollTo?.(0, 0);
  }

  // A soft tap for buttons that don't have a sound of their own.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button');
    if (btn && !btn.matches('#lock, #next, #sound-btn, .color-tab')) sounds.tap();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // A held Enter would otherwise click whatever button just took focus (Next).
    if (e.repeat) {
      if (!e.target.closest?.('textarea')) e.preventDefault();
      return;
    }
    if (help.open || !primary?.isConnected) return;
    if (e.target.closest?.('button, a, textarea, select, input:not([type=range])')) return;
    e.preventDefault();
    primary.click();
  });

  // ---------- Shared pieces ----------
  function topbar({ left = '', center = '', right = '' }) {
    return `<header class="topbar">
      <div class="tb-left">${left}</div><div class="tb-center">${center}</div><div class="tb-right">${right}</div>
    </header>`;
  }
  const brand = `<div class="brand">${MARK}<span>${NAME}</span></div>`;
  const helpButton = `<button class="icon-btn" id="help-btn" aria-label="How to play">${HELP_ICON}</button>`;
  const quitButton = `<button class="icon-btn" id="quit" aria-label="Back to home">${CLOSE_ICON}</button>`;
  const soundButton = () => `<button class="icon-btn" id="sound-btn" aria-pressed="${!isMuted()}" aria-label="Sound and vibration">${isMuted() ? SOUND_OFF : SOUND_ON}</button>`;

  function wireTopbar() {
    app.querySelector('#quit')?.addEventListener('click', renderHome);
    app.querySelector('#help-btn')?.addEventListener('click', openHelp);
    app.querySelector('#sound-btn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      setMuted(!isMuted());
      records.write('muted', isMuted());
      btn.innerHTML = isMuted() ? SOUND_OFF : SOUND_ON;
      btn.setAttribute('aria-pressed', String(!isMuted()));
      sounds.tap();
    });
  }

  function modeTitle() {
    if (game.mode === 'daily') return `Daily #${dailyNumber(dailyKey)}`;
    return `${MODE_LABELS[game.mode]} · ${POOL_LABELS[game.pool]}`;
  }

  function progress() {
    if (game.mode === 'timed') {
      return `<span class="pill timer${game.timeLeft <= 10 ? ' urgent' : ''}" id="timer" aria-label="Seconds left">⏱ <span>${Math.ceil(game.timeLeft)}</span></span>
        <span class="pill" id="points" aria-label="Points">${fmt(game.points)}</span>`;
    }
    if (game.mode === 'endless') {
      const hearts = Array.from({ length: START_HEARTS }, (_, i) =>
        `<span${i < game.hearts ? '' : ' class="lost"'}>${HEART}</span>`).join('');
      const n = game.results.length;
      return `<span class="hearts" role="img" aria-label="${game.hearts} of ${START_HEARTS} hearts">${hearts}</span>
        <span class="pill" aria-label="${n} ${n === 1 ? 'flag' : 'flags'} painted">${n}</span>`;
    }
    const dots = Array.from({ length: ROUNDS }, (_, i) => {
      const r = game.results[i];
      if (r) return `<li data-grade="${r.grade}"></li>`;
      return i === game.results.length ? '<li class="current"></li>' : '<li></li>';
    }).join('');
    return `<ol class="dots" aria-label="Round ${Math.min(game.round, ROUNDS)} of ${ROUNDS}">${dots}</ol>`;
  }

  function gameTopbar() {
    const bar = game.mode === 'timed'
      ? `<div class="timer-bar" aria-hidden="true"><i style="width:${Math.min(100, (game.timeLeft / TIMED_SECONDS) * 100)}%"></i></div>`
      : '';
    return topbar({ left: `<div class="tb-buttons">${quitButton}${soundButton()}</div>`, center: esc(modeTitle()), right: progress() }) + bar;
  }

  function refreshTopbar() {
    app.querySelector('.timer-bar')?.remove();
    app.querySelector('.topbar').outerHTML = gameTopbar();
    wireTopbar();
  }

  // Small line above the country name.
  function roundLabel() {
    if (game.mode === 'daily') return `${POOL_LABELS[DAILY_TIERS[game.results.length]]} · Flag ${game.round} of ${ROUNDS}`;
    if (game.mode === 'classic' || game.mode === 'duel') return `Flag ${game.round} of ${ROUNDS}`;
    return `Flag ${game.round}`;
  }

  function formatBest(mode, best) {
    if (best == null) return 'No best score yet';
    if (mode === 'endless') return `Best run: ${best} ${best === 1 ? 'flag' : 'flags'}`;
    if (mode === 'timed') return `Best: ${fmt(best)} points`;
    return `Best: ${best}% average`;
  }

  const coarse = () => window.matchMedia?.('(pointer: coarse)').matches;

  // Draws the result picture ahead of time: phones only allow sharing straight
  // from the tap, with no waiting in between.
  function prepareCard(options) {
    const card = { file: null };
    shareCardFile(options).then((file) => { card.file = file; }).catch(() => {});
    return card;
  }

  async function share(text, card = null) {
    try {
      if (navigator.share && coarse()) {
        const files = card?.file ? [card.file] : [];
        if (files.length && navigator.canShare?.({ files, text })) await navigator.share({ files, text });
        else await navigator.share({ text });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to the clipboard');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand?.('copy');
      area.remove();
      toast(ok ? 'Copied to the clipboard' : 'Couldn’t copy');
    }
  }

  function saveImage(card) {
    if (!card.file) {
      toast('The picture is still being drawn');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(card.file);
    a.download = card.file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function siteUrl() {
    return location.protocol.startsWith('http') ? location.origin + location.pathname : '';
  }

  // ---------- Badges ----------
  // Checks badges after a round (and after a finished game) and announces new ones.
  function checkBadges({ result = null, finished = false } = {}) {
    const ctx = {
      stats: records.stats(),
      collection: records.collection(),
      streak: records.dailyStreak(dateKey()),
      ...records.counters(),
      game,
      result,
      finished,
    };
    const fresh = newlyUnlocked(ctx, records.unlocked());
    records.unlock(fresh.map((a) => a.id), dateKey());
    fresh.forEach((a, i) => setTimeout(() => badgeToast(a), 900 + i * 2600));
  }

  // ---------- Daily ranking ----------
  // Sends today's finished Daily if it hasn't been sent yet, then fetches the board.
  // Resolves to the board, or null without a nickname or on a network error.
  async function refreshRank(day, results) {
    const player = records.player();
    if (!rankingEnabled() || !player.nickname) return null;
    try {
      if (!records.ranked(day)) {
        await submitDaily({ day, playerId: player.id, nickname: player.nickname, results });
      }
      const board = await fetchBoard({ day, playerId: player.id });
      if (board.place) records.saveRanked(day, { place: board.place, total: board.total });
      return board;
    } catch (err) {
      console.warn('Ranking unavailable:', err);
      return null;
    }
  }

  // The ranking card on a finished Daily: a nickname form the first time, then
  // your place and the top ten.
  function mountRanking(el, day, results, onRank) {
    const token = session;
    const player = records.player();
    if (!player.nickname) {
      el.innerHTML = `<h2>${TROPHY} Today’s ranking</h2>
        <p class="card-text">Pick a nickname to see your place. No account needed.</p>
        <form class="nick-form" novalidate>
          <input id="nickname" name="nickname" maxlength="${NICKNAME_MAX}" autocomplete="nickname" autocapitalize="off"
            spellcheck="false" placeholder="Nickname" aria-label="Nickname" required>
          <button class="btn btn-primary" type="submit">Join</button>
        </form>
        <p class="nick-error" role="alert"></p>`;
      const form = el.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = cleanNickname(form.nickname.value);
        if (!name) {
          el.querySelector('.nick-error').textContent = `Use 2 to ${NICKNAME_MAX} letters, numbers, spaces, dots, dashes or underscores.`;
          return;
        }
        records.setNickname(name);
        mountRanking(el, day, results, onRank);
      });
      return;
    }
    el.innerHTML = `<h2>${TROPHY} Today’s ranking</h2><p class="card-text rank-status">Loading…</p>`;
    refreshRank(day, results).then((board) => {
      if (token !== session || !el.isConnected) return;
      if (!board?.place) {
        el.innerHTML = `<h2>${TROPHY} Today’s ranking</h2>
          <p class="card-text rank-status">Couldn’t reach the ranking right now.</p>
          <button class="btn btn-secondary btn-block" id="rank-retry">Try again</button>`;
        el.querySelector('#rank-retry').addEventListener('click', () => mountRanking(el, day, results, onRank));
        return;
      }
      onRank?.(board);
      const row = (r) => `<li${r.me ? ' class="me"' : ''}><span class="rank-place">${r.place}</span>
          <span class="rank-name">${esc(r.nickname)}</span>
          <span class="grade-label" data-grade="${gradeFor(r.score).id}">${r.score}%</span></li>`;
      const inTop = board.top.some((r) => r.me);
      const top = topPercent(board.place, board.total);
      el.innerHTML = `<h2>${TROPHY} Today’s ranking</h2>
        <div class="rank-head">
          <div class="big-num">#${board.place}<span class="unit"> of ${fmt(board.total)}</span></div>
          ${top ? `<span class="pill">${top}</span>` : ''}
        </div>
        <ol class="rank-list">${board.top.map(row).join('')}${!inTop && board.mine ? `<li class="gap" aria-hidden="true">⋯</li>${row(board.mine)}` : ''}</ol>
        <p class="fineprint">Playing as ${esc(player.nickname)} · ranking resets every day</p>`;
    });
  }

  // ---------- Home ----------
  function renderHome() {
    leave();
    const token = session;
    const today = dateKey();
    const daily = records.daily(today);
    const streak = records.dailyStreak(today);
    const stats = records.stats();
    const collection = records.collection();
    const unlocked = records.unlocked();
    const dateLabel = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const dailyAverage = daily?.done
      ? Math.round(daily.results.reduce((s, r) => s + r.percent, 0) / daily.results.length)
      : null;

    let dailyBody;
    if (daily?.done) {
      const grade = gradeFor(dailyAverage);
      dailyBody = `<h2>Done for today</h2>
        <div class="daily-score">
          <div class="big-num"><span class="count">0</span><span class="unit">%</span></div>
          <p><span class="grade-label" data-grade="${grade.id}">${grade.label}</span> average</p>
        </div>
        ${dailySlots(daily.results)}
        ${rankingEnabled() ? '<button class="rank-line" id="daily-rank" hidden></button>' : ''}
        <div class="btn-row">
          <button class="btn btn-secondary" id="daily-share">${SHARE_ICON}Share</button>
          <button class="btn btn-secondary" id="daily-review">Review</button>
        </div>
        <p class="fineprint">Next Daily in <span id="countdown">${untilTomorrow()}</span></p>`;
    } else if (daily?.results.length) {
      dailyBody = `<h2>Keep going</h2>
        <p class="card-text">You’re on flag ${daily.results.length + 1} of ${ROUNDS}. Pick up where you left off.</p>
        ${dailySlots(daily.results)}
        <button class="btn btn-primary btn-block btn-lg" id="daily-play">Continue ${ARROW_ICON}</button>`;
    } else {
      dailyBody = `<h2>Today’s five flags</h2>
        <p class="card-text">The same flags for everyone, from easy to impossible. The last two may hide two colors.</p>
        ${dailySlots([])}
        <button class="btn btn-primary btn-block btn-lg" id="daily-play">Play the Daily ${ARROW_ICON}</button>`;
    }

    let duelCard = '';
    if (linkDuel) {
      const played = records.duel(linkDuel.seed);
      const theirs = Math.round(linkDuel.percents.reduce((a, b) => a + b, 0) / ROUNDS);
      if (played) {
        const o = duelOutcome(played.results.map((r) => r.percent), linkDuel.percents);
        const verdict = { win: 'You won', loss: 'They won', draw: 'A draw' }[o.result];
        duelCard = `<article class="card duel-card" data-result="${o.result}">
          <div class="card-head"><span class="eyebrow">${SWORDS_ICON} Duel · ${POOL_LABELS[linkDuel.pool]}</span></div>
          <h2>${verdict}, ${o.me}% to ${o.them}%</h2>
          <div class="btn-row"><button class="btn btn-secondary" id="duel-review">See the duel</button>
            <button class="btn btn-secondary" id="duel-dismiss">Close</button></div>
        </article>`;
      } else {
        duelCard = `<article class="card duel-card">
          <div class="card-head"><span class="eyebrow">${SWORDS_ICON} You’ve been challenged</span></div>
          <h2>Beat ${theirs}% on five ${POOL_LABELS[linkDuel.pool]} flags</h2>
          <p class="card-text">Same flags, same missing colors. Highest average wins.</p>
          <button class="btn btn-primary btn-block btn-lg" id="duel-play">Accept the duel ${ARROW_ICON}</button>
        </article>`;
      }
    }

    const nCollected = Object.keys(collection).length;
    const nBadges = ACHIEVEMENTS.filter((a) => a.id in unlocked).length;
    const recentBadges = ACHIEVEMENTS.filter((a) => a.id in unlocked).slice(-4).map((a) => a.icon).join('') || '🔒';

    show('home', `${topbar({ left: brand, right: `${soundButton()}${helpButton}` })}
      <section class="screen home">
        <div class="hero">
          <h1>Mix the missing color.</h1>
          <p>Every flag is missing a color. Recreate it with hue, saturation and brightness, and see how close you get.</p>
        </div>
        ${flagMarquee()}
        ${duelCard}
        <div class="home-grid">
          <article class="card daily">
            <div class="card-head">
              <span class="eyebrow">Daily #${dailyNumber(today)} · ${esc(dateLabel)}</span>
              ${streak ? `<span class="pill streak" title="Daily streak" aria-label="${streak}-day streak">🔥 ${streak}</span>` : ''}
            </div>
            ${dailyBody}
          </article>
          <article class="card free">
            <div class="card-head"><span class="eyebrow">Free play</span></div>
            <h2>Play your way</h2>
            <span class="field-label" id="mode-label">Mode</span>
            <div class="segmented" style="--n:3" data-group="mode" role="group" aria-labelledby="mode-label">
              <button data-value="classic">Classic<small>5 flags</small></button>
              <button data-value="endless">Endless<small>${START_HEARTS} hearts</small></button>
              <button data-value="timed">Time Attack<small>${TIMED_SECONDS} sec</small></button>
            </div>
            <span class="field-label" id="flags-label">Flags</span>
            <div class="segmented seg-small" style="--n:2" data-group="by" role="group" aria-labelledby="flags-label">
              <button data-value="tier">By difficulty</button>
              <button data-value="region">By region</button>
            </div>
            <div class="segmented seg-tier" style="--n:4" data-group="tier" role="group" aria-label="Difficulty">
              ${TIERS.map((t) => `<button data-value="${t}">${POOL_LABELS[t]}</button>`).join('')}
            </div>
            <div class="segmented seg-region" style="--n:3" data-group="region" role="group" aria-label="Region">
              ${REGIONS.map((r) => `<button data-value="${r}">${REGION_EMOJI[r]} ${POOL_LABELS[r]}</button>`).join('')}
            </div>
            <p class="best" id="best"></p>
            <button class="btn btn-primary btn-block btn-lg" id="start">Play ${ARROW_ICON}</button>
          </article>
        </div>
        <div class="hub">
          <button class="card hub-card" id="open-collection">
            <span class="eyebrow">Collection</span>
            <strong><span>${nCollected}</span> / ${FLAGS.length}</strong>
            <span class="hub-bar"><i style="width:${(nCollected / FLAGS.length) * 100}%"></i></span>
            <span class="hub-more">Your flags ${CHEVRON}</span>
          </button>
          <button class="card hub-card" id="open-badges">
            <span class="eyebrow">Badges</span>
            <strong><span>${nBadges}</span> / ${ACHIEVEMENTS.length}</strong>
            <span class="hub-icons" aria-hidden="true">${recentBadges}</span>
            <span class="hub-more">Your badges ${CHEVRON}</span>
          </button>
        </div>
        ${stats.flags ? `<div class="card stats">
          <div><strong>${stats.flags}</strong><span>flags painted</span></div>
          <div><strong>${Math.round(stats.percentSum / stats.flags)}%</strong><span>average</span></div>
          <div><strong>${stats.perfects}</strong><span>perfect</span></div>
        </div>` : ''}
        <p class="credit">Flags from Wikimedia Commons, in the public domain.</p>
      </section>`);

    // After midnight the card shows yesterday's Daily: redraw instead of acting on it.
    const sameDay = (action) => () => (dateKey() === today ? action() : renderHome());
    if (daily?.done) {
      animateScore(app.querySelector('.daily-score'), dailyAverage);
      const shared = {
        mode: 'daily', results: daily.results, score: dailyAverage, dailyNumber: dailyNumber(today), url: siteUrl(), streak,
        rank: records.ranked(today),
      };
      const rankLine = app.querySelector('#daily-rank');
      if (rankLine) {
        const showRank = (r) => {
          if (!r?.place) return;
          rankLine.innerHTML = `${TROPHY} <b>#${r.place}</b> of ${fmt(r.total)} today <span>${CHEVRON}</span>`;
          rankLine.hidden = false;
        };
        showRank(shared.rank);
        rankLine.addEventListener('click', sameDay(reviewDaily));
        refreshRank(today, daily.results).then((r) => {
          if (token !== session || !r) return;
          shared.rank = r;
          showRank(r);
        });
      }
      const card = prepareCard(shared);
      app.querySelector('#daily-share').addEventListener('click', sameDay(() => share(shareText(shared), card)));
      app.querySelector('#daily-review').addEventListener('click', sameDay(reviewDaily));
    } else {
      app.querySelector('#daily-play').addEventListener('click', sameDay(startDaily));
    }
    app.querySelector('#duel-play')?.addEventListener('click', startDuel);
    app.querySelector('#duel-review')?.addEventListener('click', reviewDuel);
    app.querySelector('#duel-dismiss')?.addEventListener('click', () => {
      history.replaceState?.(null, '', location.pathname);
      location.reload();
    });
    app.querySelector('#open-collection').addEventListener('click', renderCollection);
    app.querySelector('#open-badges').addEventListener('click', renderBadges);
    timers.push(setInterval(() => {
      if (token !== session) return;
      if (dateKey() !== today) renderHome();
      else if (daily?.done) app.querySelector('#countdown').textContent = untilTomorrow();
    }, 20_000));

    const sync = () => {
      for (const group of app.querySelectorAll('.free .segmented')) {
        for (const btn of group.querySelectorAll('button')) {
          btn.setAttribute('aria-pressed', String(choice[group.dataset.group] === btn.dataset.value));
        }
      }
      app.querySelector('.seg-tier').hidden = choice.by !== 'tier';
      app.querySelector('.seg-region').hidden = choice.by !== 'region';
      app.querySelector('#best').textContent = formatBest(choice.mode, records.best(choice.mode, choicePool()));
    };
    for (const group of app.querySelectorAll('.free .segmented')) {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        choice[group.dataset.group] = btn.dataset.value;
        records.write('choice', choice);
        sync();
      });
    }
    app.querySelector('#start').addEventListener('click', startFreePlay);
    primary = app.querySelector('#duel-play') ?? (daily?.done ? app.querySelector('#start') : app.querySelector('#daily-play'));
    sync();
    if (!records.seenHelp && !helpShownOnce) openHelp();
  }

  function startFreePlay() {
    leave();
    const pool = choicePool();
    if (choice.mode === 'classic') {
      const seed = newSeed();
      game.start('classic', pool, { seed, codes: pickCodes(pool, seed) });
    } else {
      game.start(choice.mode, pool);
    }
    if (game.mode === 'timed') startClock();
    startRound();
  }

  function startDaily() {
    leave();
    dailyKey = dateKey();
    const progressSoFar = records.daily(dailyKey);
    game.start('daily', null, { codes: dailyCodes(dailyKey), seed: dailySeed(dailyKey), results: progressSoFar?.results ?? [] });
    if (game.isOver()) renderEnd();
    else startRound();
  }

  function reviewDaily() {
    leave();
    dailyKey = dateKey();
    game.start('daily', null, { codes: dailyCodes(dailyKey), seed: dailySeed(dailyKey), results: records.daily(dailyKey)?.results ?? [] });
    renderEnd();
  }

  function startDuel() {
    leave();
    duel = linkDuel;
    game.start('duel', duel.pool, { codes: duel.codes, seed: duel.seed });
    startRound();
  }

  function reviewDuel() {
    leave();
    duel = linkDuel;
    game.start('duel', duel.pool, { codes: duel.codes, seed: duel.seed, results: records.duel(duel.seed)?.results ?? [] });
    renderEnd();
  }

  // ---------- Time Attack clock ----------
  function startClock() {
    const token = session;
    clock = { running: false, last: performance.now(), shownSecond: TIMED_SECONDS };
    timers.push(setInterval(() => {
      if (token !== session || !clock) return;
      const now = performance.now();
      const dt = (now - clock.last) / 1000;
      clock.last = now;
      if (!clock.running) return;
      const expired = game.tick(dt);
      const timer = app.querySelector('#timer');
      if (timer) {
        const sec = Math.ceil(game.timeLeft);
        timer.querySelector('span').textContent = sec;
        timer.classList.toggle('urgent', game.timeLeft <= 10);
        if (sec !== clock.shownSecond && sec <= 10 && sec > 0) sounds.clock(sec <= 5);
        clock.shownSecond = sec;
      }
      const bar = app.querySelector('.timer-bar i');
      if (bar) bar.style.width = `${Math.min(100, (game.timeLeft / TIMED_SECONDS) * 100)}%`;
      if (expired) {
        clock.running = false;
        sounds.timeUp();
        const outcome = records.finishGame(game);
        checkBadges({ finished: true });
        toast('Time’s up!');
        timers.push(setTimeout(() => renderEnd({ outcome }), 700));
      }
    }, 100));
  }

  function runClock(on) {
    if (!clock) return;
    clock.last = performance.now();
    clock.running = on;
  }

  // ---------- Loading flags ----------
  // A round: the flag, how many colors it hides, and the sliders' starting hues.
  // Seeded games retry the same flag with the same seed; free play moves on.
  async function loadRound(code, token) {
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      if (token !== session) return null;
      const random = game.roundRandom(code);
      const chance = game.seed ? seededRandom(`${game.seed}:${code}:two`)() : Math.random();
      const count = game.wantsTwoColors(chance) && canHideTwo(code) ? 2 : 1;
      try {
        const flag = await loadFlag(code, random, count);
        return { code, flag, startHues: flag.hidden.map(() => Math.floor(random() * 360)) };
      } catch (err) {
        console.warn(`Couldn’t load flag ${code}:`, err);
        if (!game.codes) code = game.nextFlagCode();
      }
    }
    throw new Error(`Could not load ${code}`);
  }

  const loadNextFlag = (token) => loadRound(game.nextFlagCode(), token);

  function prefetchIfNeeded() {
    if (game.codes && game.round >= ROUNDS) return;
    pending = game.codes ? loadRound(game.codes[game.results.length + 1], session) : loadNextFlag(session);
    pending.catch(() => {});
  }

  function roundShell(main, side) {
    return `${gameTopbar()}
      <section class="screen round">
        <div class="round-main">${main}</div>
        <div class="round-side" id="panel">${side}</div>
      </section>`;
  }

  function comboPill() {
    return game.combo >= 2
      ? `<span class="combo-pill" title="Great or better in a row">🔥 Combo ×${game.combo}</span>`
      : '';
  }

  async function startRound() {
    const token = session;
    primary = null;
    runClock(false);
    show('round', roundShell(`<p class="eyebrow">${roundLabel()}</p>
        <h1 class="country">&nbsp;</h1>
        <div class="stage"><div class="flag-frame loading"></div></div>`, ''));

    const promise = pending ?? loadNextFlag(token);
    pending = null;
    let next;
    try {
      next = await promise;
    } catch {
      if (token === session) renderLoadError();
      return;
    }
    if (token !== session || !next) return; // the player left meanwhile
    renderRound(next);
    prefetchIfNeeded();
  }

  function renderLoadError() {
    show('round', `${gameTopbar()}
      <section class="screen">
        <p class="error">Couldn’t load the flag. Check your connection and try again.</p>
        <button class="btn btn-primary btn-block btn-lg" id="retry">Retry</button>
      </section>`);
    primary = app.querySelector('#retry');
    primary.addEventListener('click', startRound);
  }

  // ---------- Round ----------
  function sliderRow(id, label, max) {
    return `<div class="slider-row">
      <div class="slider-head"><label for="${id}">${label}</label><output id="${id}-out" for="${id}"></output></div>
      <input type="range" class="slider" id="${id}" min="0" max="${max}" step="1">
    </div>`;
  }

  function renderRound({ code, flag, startHues }) {
    const name = flagByCode(code).name;
    const two = flag.hidden.length > 1;
    let hint = '';
    if (two) hint = '<p class="hint">Two colors are wrong. Switch between them with the tabs.</p>';
    else if (game.round === 1) hint = '<p class="hint">One color is wrong. Mix the real one back in.</p>';
    show('round', roundShell(`<p class="eyebrow">${roundLabel()}${comboPill()}</p>
        <h1 class="country">${esc(name)}</h1>
        <div class="stage"><div class="glow" aria-hidden="true"></div><div class="flag-frame enter" style="--ratio:${flag.ratio}"></div></div>
        <div class="under-flag">${hint}</div>`,
    `<div class="controls">
        ${two ? `<div class="color-tabs" role="tablist" aria-label="Missing colors">
          ${flag.hidden.map((_, i) => `<button class="color-tab" role="tab" data-i="${i}" aria-selected="${i === 0}"><i></i>Color ${i + 1}</button>`).join('')}
        </div>` : ''}
        <div class="sliders">
          ${sliderRow('hue', 'Hue', 360)}
          ${sliderRow('sat', 'Saturation', 100)}
          ${sliderRow('bri', 'Brightness', 100)}
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="lock">Lock ${two ? 'colors' : 'color'}</button>
      </div>`));
    flag.svg.classList.remove('revealing');
    flag.svg.setAttribute('aria-label', `Flag of ${name}, with ${two ? 'two colors' : 'one color'} missing`);
    app.querySelector('.flag-frame').append(flag.svg);

    const hue = app.querySelector('#hue');
    const sat = app.querySelector('#sat');
    const bri = app.querySelector('#bri');
    const glow = app.querySelector('.glow');
    const tabs = [...app.querySelectorAll('.color-tab')];
    // One HSB state per hidden color; the sliders edit the active one.
    const states = startHues.map((h) => ({ h, s: 50, b: 50 }));
    let active = 0;
    const colorOf = (st) => hsbToHex(st.h, st.s / 100, st.b / 100);
    const guesses = () => states.map(colorOf);
    hue.style.setProperty('--track', HUE_GRADIENT);

    const paint = () => {
      const st = states[active];
      const h = st.h, s = st.s / 100, b = st.b / 100;
      const color = colorOf(st);
      hue.style.setProperty('--thumb', hsbToHex(h, 1, 1));
      sat.style.setProperty('--track', `linear-gradient(to right, ${hsbToHex(h, 0, b)}, ${hsbToHex(h, 1, b)})`);
      sat.style.setProperty('--thumb', color);
      bri.style.setProperty('--track', `linear-gradient(to right, #000000, ${hsbToHex(h, s, 1)})`);
      bri.style.setProperty('--thumb', color);
      for (const [input, text] of [[hue, `${st.h}°`], [sat, `${st.s}%`], [bri, `${st.b}%`]]) {
        app.querySelector(`#${input.id}-out`).textContent = text;
        input.setAttribute('aria-valuetext', text);
      }
      flag.hidden[active].setGuess(color);
      tabs[active]?.querySelector('i').style.setProperty('background', color);
      glow.style.setProperty('--glow', color);
    };
    const select = (i) => {
      active = i;
      hue.value = states[i].h;
      sat.value = states[i].s;
      bri.value = states[i].b;
      tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === i)));
      paint();
    };
    for (const [input, key] of [[hue, 'h'], [sat, 's'], [bri, 'b']]) {
      input.addEventListener('input', () => {
        states[active][key] = Number(input.value);
        paint();
        sounds.tick(input.value / input.max);
      });
    }
    flag.hidden.forEach((hid, i) => hid.setGuess(colorOf(states[i])));
    tabs.forEach((t, i) => {
      t.querySelector('i').style.background = colorOf(states[i]);
      t.addEventListener('click', () => {
        if (active === i) return;
        sounds.tab();
        select(i);
        blink([i], 2);
      });
    });
    select(0);

    // Blink areas to paint by flipping them to a contrasting shade a few times.
    // Repainting the same targets as the guess blinks exactly the hidden color.
    let blinkTimer = null;
    function blink(indexes, times = 3) {
      clearTimeout(blinkTimer);
      if (reducedMotion()) return;
      const order = indexes.flatMap((i) => Array(times * 2).fill(i));
      let step = 0;
      const tick = () => {
        const i = order[step];
        const guess = colorOf(states[i]);
        const on = step % 2 === 0;
        flag.hidden[i].setGuess(on ? contrastOf(guess) : guess);
        if (on) sounds.blink();
        if (++step < order.length) blinkTimer = setTimeout(tick, 230);
      };
      blinkTimer = setTimeout(tick, 300);
    }
    blink(flag.hidden.map((_, i) => i), two ? 2 : 3);
    runClock(true);

    const lock = app.querySelector('#lock');
    primary = lock;
    lock.addEventListener('click', () => {
      clearTimeout(blinkTimer);
      runClock(false);
      if (game.isOver()) return; // Time Attack ran out meanwhile
      if (game.mode === 'daily' && (records.daily(dailyKey)?.results.length ?? 0) > game.results.length) {
        toast('This Daily moved on in another tab');
        renderHome();
        return;
      }
      const values = states.map((st) => ({ ...st }));
      const hiddenHexes = flag.hidden.map((h) => h.hex);
      const result = game.submit(code, two ? guesses() : guesses()[0], two ? hiddenHexes : hiddenHexes[0]);
      if (game.mode === 'daily') records.saveDaily(dailyKey, game.results, game.isOver());
      if (game.mode === 'duel' && game.isOver()) records.saveDuel(duel.seed, game.results);
      const isNewFlag = records.collect(code, result.percent);
      records.noteCombo(result.combo);
      let outcome = null;
      if (game.isOver()) {
        outcome = records.finishGame(game);
        if (game.mode === 'duel' && duelOutcome(game.results.map((r) => r.percent), duel.percents).result === 'win') {
          records.noteDuelWin();
        }
        pending = null;
      }
      sounds.lock();
      checkBadges({ result, finished: game.isOver() });
      renderReveal({ name, flag, result, values, outcome, isNewFlag });
    }, { once: true });
  }

  function compareBars(value, guessHex, trueHex) {
    const t = hexToHsb(trueHex);
    const hueMatters = t.s >= 0.04 && t.v >= 0.04;
    const satMatters = t.v >= 0.04;
    const baseH = hueMatters ? t.h : value.h;
    const marker = (pct, hex, target = false) =>
      `<i class="marker${target ? ' target' : ''}" style="left:${Math.min(100, Math.max(0, pct))}%;background:${hex}"></i>`;
    const row = (label, note, background, you, real) => `<div class="cmp-row">
        <span>${label}${note ? `<small>${note}</small>` : ''}</span>
        <div class="cmp-bar" style="background:${background}">${marker(you, guessHex)}${real == null ? '' : marker(real, trueHex, true)}</div>
      </div>`;
    return `${row('Hue', hueMatters ? '' : 'any works', HUE_GRADIENT, (value.h / 360) * 100, hueMatters ? (t.h / 360) * 100 : null)}
      ${row('Saturation', satMatters ? '' : 'any works', `linear-gradient(to right, ${hsbToHex(baseH, 0, Math.max(t.v, 0.5))}, ${hsbToHex(baseH, 1, Math.max(t.v, 0.5))})`, value.s, satMatters ? t.s * 100 : null)}
      ${row('Brightness', '', `linear-gradient(to right, #000000, ${hsbToHex(baseH, t.s, 1)})`, value.b, t.v * 100)}`;
  }

  function renderReveal({ name, flag, result, values, outcome, isNewFlag }) {
    refreshTopbar();
    if (result.heartChange) app.querySelector('.hearts')?.classList.add('pop');
    const eyebrow = app.querySelector('.round-main .eyebrow');
    eyebrow.innerHTML = `${roundLabel().replace(`${game.round}`, `${game.round - 1}`)}${comboPill()}`;

    flag.svg.classList.add('revealing');
    flag.reveal();
    flag.svg.setAttribute('aria-label', `Flag of ${name}`);
    setTimeout(() => flag.svg.classList.remove('revealing'), 700);
    const frame = app.querySelector('.flag-frame');
    frame.classList.remove('enter');
    frame.classList.add('shine');
    app.querySelector('.glow')?.style.setProperty('--glow', result.trueHex);

    const parts = result.parts ?? [{ guessHex: result.guessHex, trueHex: result.trueHex, percent: result.percent, grade: result.grade }];
    const two = parts.length > 1;
    const grade = gradeById(result.grade);
    const worst = parts.reduce((a, b) => (b.percent < a.percent ? b : a));
    const tip = describeMiss(worst.guessHex, worst.trueHex) || `${grade.blurb}.`;
    const tipText = two && describeMiss(worst.guessHex, worst.trueHex)
      ? `Color ${parts.indexOf(worst) + 1}: ${tip.charAt(0).toLowerCase()}${tip.slice(1)}`
      : tip;
    const notes = [];
    if (result.heartChange < 0) notes.push(`<p class="heart-note lost">−1 heart · under ${SAFE_PERCENT}%</p>`);
    if (result.heartChange > 0) notes.push('<p class="heart-note won">+1 heart for a Perfect</p>');
    if (result.combo >= 2) notes.push(`<p class="combo-note">🔥 Combo ×${result.combo}${game.mode === 'timed' ? ` · points ×${comboMultiplier(result.combo)}` : ''}</p>`);
    if (game.mode === 'timed') {
      notes.push(`<p class="gain">+${fmt(result.points)} points${result.timeBonus ? ` · +${result.timeBonus}s` : ''}</p>`);
    }
    if (isNewFlag) notes.push('<p class="new-flag">New in your collection</p>');
    const over = game.isOver();

    setTimeout(() => {
      sounds.grade(result.grade);
      if (result.heartChange < 0) sounds.heartLost();
      if (result.heartChange > 0) setTimeout(sounds.heartWon, 350);
      if (result.combo >= 2) sounds.combo(result.combo);
      if (result.timeBonus) setTimeout(sounds.timeBonus, 250);
      if (isNewFlag) sounds.collect();
    }, 180);
    if (result.grade === 'perfect') confetti([...flagColors(result.code), result.trueHex]);

    const under = app.querySelector('.under-flag');
    under.innerHTML = `<button class="chip" id="compare" aria-pressed="false">${EYE_ICON}<span>Hold to see yours</span></button>`;
    const chip = under.querySelector('#compare');
    const showMine = (on) => {
      if (on) parts.forEach((p, i) => flag.hidden[i].setGuess(p.guessHex));
      else flag.reveal();
      chip.setAttribute('aria-pressed', String(on));
      chip.querySelector('span').textContent = on ? 'Showing yours' : 'Hold to see yours';
    };
    chip.addEventListener('pointerdown', (e) => {
      chip.setPointerCapture?.(e.pointerId);
      showMine(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      chip.addEventListener(type, () => showMine(false));
    }
    chip.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        showMine(true);
      }
    });
    chip.addEventListener('keyup', () => showMine(false));
    chip.addEventListener('blur', () => showMine(false));
    chip.addEventListener('contextmenu', (e) => e.preventDefault());

    const swatches = parts.map((p, i) => `<div class="swatch-pair">
        ${two ? `<span class="swatch-title">Color ${i + 1} <b class="grade-label" data-grade="${p.grade}">${p.percent}%</b></span>` : ''}
        <div class="swatches">
          <div class="swatch"><i style="background:${p.guessHex}"></i><span>Yours</span><code>${p.guessHex}</code></div>
          <div class="swatch"><i style="background:${p.trueHex}"></i><span>Flag</span><code>${p.trueHex}</code></div>
        </div>
      </div>`).join('');
    const compare = `<div class="compare" aria-hidden="true">
        ${two ? `<div class="color-tabs small">${parts.map((p, i) => `<button class="color-tab" data-i="${i}" aria-selected="${i === 0}"><i style="background:${p.trueHex}"></i>Color ${i + 1}</button>`).join('')}</div>` : ''}
        <div class="cmp-rows">${compareBars(values[0], parts[0].guessHex, parts[0].trueHex)}</div>
        <div class="cmp-legend"><span><i style="background:${parts[0].guessHex}"></i>Yours</span><span><i class="target" style="background:${parts[0].trueHex}"></i>Flag</span></div>
      </div>`;

    const panel = app.querySelector('#panel');
    const auto = game.mode === 'timed' && !over;
    panel.innerHTML = `<div class="card result${result.heartChange < 0 ? ' shake' : ''}" data-grade="${grade.id}">
        <p class="visually-hidden" role="status">${result.percent}% match: ${grade.label}. ${esc(tipText)}</p>
        <div class="result-head">
          <div class="big-num" aria-hidden="true"><span class="count">0</span><span class="unit">%</span></div>
          ${grade.id === 'perfect' && !reducedMotion() ? burst() : ''}
          <span class="grade-label">${grade.label}</span>
        </div>
        <div class="meter" aria-hidden="true"><i></i></div>
        <div class="verdict"><p class="tip">${esc(tipText)}</p>${notes.join('')}</div>
        ${swatches}
        ${compare}
      </div>
      <button class="btn btn-primary btn-block btn-lg${auto ? ' auto' : ''}" id="next">${over ? 'See results' : 'Next flag'} ${ARROW_ICON}</button>`;
    animateScore(panel.querySelector('.result'), result.percent);

    panel.querySelectorAll('.compare .color-tab').forEach((t) => t.addEventListener('click', () => {
      const i = Number(t.dataset.i);
      sounds.tab();
      panel.querySelectorAll('.compare .color-tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      panel.querySelector('.cmp-rows').innerHTML = compareBars(values[i], parts[i].guessHex, parts[i].trueHex);
      const legend = panel.querySelectorAll('.cmp-legend i');
      legend[0].style.background = parts[i].guessHex;
      legend[1].style.background = parts[i].trueHex;
    }));

    const next = panel.querySelector('#next');
    let advanced = false;
    const go = () => {
      if (advanced) return;
      advanced = true;
      if (over) renderEnd({ outcome });
      else startRound();
    };
    next.addEventListener('click', go);
    next.focus({ preventScroll: true });
    primary = next;
    if (auto) timers.push(setTimeout(() => { if (next.isConnected) go(); }, TIMED_REVEAL_MS));
    panel.querySelector('.result').scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // ---------- End ----------
  function renderEnd({ outcome = null } = {}) {
    leave();
    const { mode } = game;
    const score = game.finalScore();
    const daily = mode === 'daily';
    const isDuel = mode === 'duel';
    let title = `${MODE_LABELS[mode]} · ${POOL_LABELS[game.pool]} complete`;
    if (daily) title = `Daily #${dailyNumber(dailyKey)} complete`;
    if (mode === 'endless') title = 'Out of hearts';
    if (mode === 'timed') title = 'Time’s up';

    let headline;
    if (mode === 'endless') {
      headline = `<div class="end-score">${score}</div>
        <p class="end-sub">${score === 1 ? 'flag' : 'flags'} painted${score ? ` · ${game.average}% average` : ''}</p>`;
    } else if (mode === 'timed') {
      headline = `<div class="end-score"><span class="count">0</span></div>
        <p class="end-sub">points · ${game.results.length} ${game.results.length === 1 ? 'flag' : 'flags'}${game.bestCombo >= 2 ? ` · best combo ×${game.bestCombo}` : ''}</p>`;
    } else {
      const grade = gradeFor(score);
      headline = `<div class="end-score"><span class="count">0</span><span class="unit">%</span></div>
        <p class="end-sub">average match <span class="grade-label" data-grade="${grade.id}">${grade.label}</span></p>`;
    }

    let duelBlock = '';
    let duelResult = null;
    if (isDuel && duel) {
      const o = duelOutcome(game.results.map((r) => r.percent), duel.percents);
      duelResult = o.result;
      const verdict = { win: 'You win the duel!', loss: 'They win this one', draw: 'It’s a draw' }[o.result];
      duelBlock = `<div class="card duel-result" data-result="${o.result}">
          <p class="duel-verdict">${verdict}</p>
          <div class="duel-table">
            <span class="duel-h"></span><span class="duel-h">Them</span><span class="duel-h">You</span>
            ${game.results.map((r, i) => `<span class="duel-name">${esc(r.name)}</span>
              <span class="grade-label" data-grade="${gradeFor(duel.percents[i]).id}">${duel.percents[i]}%</span>
              <span class="grade-label" data-grade="${r.grade}">${r.percent}%</span>`).join('')}
            <span class="duel-name"><b>Average</b></span><b>${o.them}%</b><b>${o.me}%</b>
          </div>
        </div>`;
    }

    let extra = '';
    if (outcome?.isNewBest) extra = '<span class="badge">New best</span>';
    else if (daily) {
      const streak = records.dailyStreak(dailyKey);
      if (streak) extra = `<p class="end-sub">🔥 ${streak}-day streak</p>`;
    } else if (!isDuel) extra = `<p class="end-sub">${formatBest(mode, records.best(mode, game.pool))}</p>`;

    const canChallenge = (mode === 'classic' || isDuel) && game.results.length === ROUNDS;
    const shown = game.results.slice(-MAX_END_ROWS);
    show('end', `${topbar({ left: quitButton, center: esc(modeTitle()) })}
      <section class="screen end">
        <div class="end-head">
          <h1>${title}</h1>
          ${headline}
          ${extra}
          ${squares(game.results)}
        </div>
        ${daily && game.isOver() && rankingEnabled() ? '<section class="card ranking" id="ranking" aria-live="polite"></section>' : ''}
        ${duelBlock}
        <ol class="card results"></ol>
        ${game.results.length > shown.length ? `<p class="more">Showing your last ${MAX_END_ROWS} flags</p>` : ''}
        <div class="end-actions">
          ${canChallenge ? `<button class="btn btn-primary btn-block btn-lg" id="challenge">${SWORDS_ICON}${isDuel ? 'Challenge them back' : 'Challenge a friend'}</button>` : ''}
          <button class="btn ${canChallenge ? 'btn-secondary' : 'btn-primary btn-lg'} btn-block" id="share">${SHARE_ICON}Share result</button>
          ${coarse() ? '' : `<button class="btn btn-ghost btn-block" id="save-image">${IMAGE_ICON}Save as picture</button>`}
          <div class="btn-row">
            ${daily || isDuel ? '' : '<button class="btn btn-secondary" id="again">Play again</button>'}
            <button class="btn btn-secondary" id="home"${daily || isDuel ? ' style="grid-column: 1 / -1"' : ''}>Home</button>
          </div>
        </div>
        ${daily ? `<p class="fineprint">Next Daily in ${untilTomorrow()}</p>` : ''}
      </section>`);
    if (mode === 'timed') animateScore(app.querySelector('.end-head'), score, 100);
    else if (mode !== 'endless') animateScore(app.querySelector('.end-head'), score);

    // Only at the end of a game just played, not when reviewing.
    if (outcome) {
      if (duelResult) sounds.duel(duelResult);
      else sounds.finish(outcome.isNewBest || (mode === 'endless' ? score >= 10 : mode === 'timed' ? score >= 500 : score >= 70));
      if (outcome.isNewBest || duelResult === 'win') confetti(['#8b5cf6', '#22c55e', '#eab308', '#3b82f6', '#ef4444']);
    }

    const list = app.querySelector('.results');
    for (const [i, r] of shown.entries()) {
      const li = document.createElement('li');
      li.style.setProperty('--i', Math.min(i, 12));
      const pairs = (r.parts ?? [r]).map(() => '<span class="pair"><i></i><i></i></span>').join('');
      li.innerHTML = `<span class="thumb"><img alt="" loading="lazy"></span><span class="name"></span>
        <span class="pairs">${pairs}</span><span class="grade-label pct" data-grade="${r.grade}">${r.percent}%</span>`;
      li.querySelector('img').src = flagUrl(r.code);
      li.querySelector('.name').textContent = r.name;
      li.querySelectorAll('.pair').forEach((pair, j) => {
        const p = (r.parts ?? [r])[j];
        const [guess, truth] = pair.querySelectorAll('i');
        guess.style.background = p.guessHex;
        guess.title = `Yours ${p.guessHex}`;
        truth.style.background = p.trueHex;
        truth.title = `Flag ${p.trueHex}`;
      });
      li.setAttribute('aria-label', `${r.name}: ${r.percent}% match, ${gradeById(r.grade).label}`);
      list.append(li);
    }

    const shared = {
      rank: daily ? records.ranked(dailyKey) : null,
      mode, pool: game.pool, results: game.results, score, url: siteUrl(),
      dailyNumber: daily ? dailyNumber(dailyKey) : null,
      streak: daily ? records.dailyStreak(dailyKey) : 0,
      bestCombo: game.bestCombo,
      duel: isDuel && duel ? duelOutcome(game.results.map((r) => r.percent), duel.percents) : null,
    };
    let card = prepareCard(shared);
    app.querySelector('#share').addEventListener('click', () => share(shareText(shared), card));
    const ranking = app.querySelector('#ranking');
    if (ranking) {
      mountRanking(ranking, dailyKey, game.results, (board) => {
        if (shared.rank?.place === board.place && shared.rank?.total === board.total) return;
        shared.rank = { place: board.place, total: board.total };
        card = prepareCard(shared);
      });
    }
    app.querySelector('#save-image')?.addEventListener('click', () => saveImage(card));
    app.querySelector('#challenge')?.addEventListener('click', () => {
      const url = duelUrl(siteUrl(), {
        pool: game.pool, seed: game.seed, codes: game.codes, percents: game.results.map((r) => r.percent),
      });
      share(`⚔️ I scored ${score}% on five ${POOL_LABELS[game.pool]} flags in Flagtone. Can you beat me?\n${url}`);
    });
    app.querySelector('#home').addEventListener('click', renderHome);
    const again = app.querySelector('#again');
    again?.addEventListener('click', () => {
      leave();
      if (mode === 'classic') {
        const seed = newSeed();
        game.start('classic', game.pool, { seed, codes: pickCodes(game.pool, seed) });
      } else {
        game.start(mode, game.pool);
      }
      if (mode === 'timed') startClock();
      startRound();
    });
    primary = app.querySelector('#challenge') ?? again ?? app.querySelector('#share');
  }

  // ---------- Collection ----------
  function renderCollection() {
    leave();
    const collection = records.collection();
    const n = Object.keys(collection).length;
    const sections = REGIONS.map((region) => {
      const flags = FLAGS.filter((f) => f.region === region).sort((a, b) => a.name.localeCompare(b.name));
      const got = flags.filter((f) => f.code in collection).length;
      const tiles = flags.map((f) => {
        const best = collection[f.code];
        const ratio = FLAG_DATA[f.code].ratio;
        if (best == null) {
          return `<li class="tile locked" title="Not played yet"><span class="tile-flag" style="aspect-ratio:${ratio}">?</span><span class="tile-name">???</span></li>`;
        }
        return `<li class="tile" title="${esc(f.name)}: best ${best}%">
          <img class="tile-flag" src="${flagUrl(f.code)}" alt="" loading="lazy" style="aspect-ratio:${ratio}">
          <span class="tile-name">${esc(f.name)}</span>
          <span class="grade-label" data-grade="${gradeFor(best).id}">${best}%</span></li>`;
      }).join('');
      return `<section class="region">
          <div class="region-head"><h2>${REGION_EMOJI[region]} ${POOL_LABELS[region]}</h2><span>${got} / ${flags.length}</span></div>
          <div class="hub-bar"><i style="width:${(got / flags.length) * 100}%"></i></div>
          <ul class="tiles">${tiles}</ul>
        </section>`;
    }).join('');
    show('collection', `${topbar({ left: quitButton, center: 'Collection' })}
      <section class="screen collection">
        <div class="end-head"><h1>Your flags</h1><div class="end-score">${n}<span class="unit"> / ${FLAGS.length}</span></div>
          <p class="end-sub">Every flag you play joins your collection, with your best match.</p></div>
        ${sections}
      </section>`);
  }

  // ---------- Badges ----------
  function renderBadges() {
    leave();
    const unlocked = records.unlocked();
    const n = ACHIEVEMENTS.filter((a) => a.id in unlocked).length;
    const cards = ACHIEVEMENTS.map((a) => {
      const date = unlocked[a.id];
      return `<li class="badge-card${date ? '' : ' locked'}">
          <span class="badge-icon" aria-hidden="true">${a.icon}</span>
          <strong>${esc(a.name)}</strong>
          <span>${esc(a.desc)}</span>
          <small>${date ? `Unlocked ${esc(new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}` : 'Locked'}</small>
        </li>`;
    }).join('');
    show('badges', `${topbar({ left: quitButton, center: 'Badges' })}
      <section class="screen badges">
        <div class="end-head"><h1>Your badges</h1><div class="end-score">${n}<span class="unit"> / ${ACHIEVEMENTS.length}</span></div></div>
        <ul class="badge-grid">${cards}</ul>
      </section>`);
  }

  // ---------- Help & toasts ----------
  function createHelp() {
    const dialog = document.createElement('dialog');
    dialog.className = 'help';
    dialog.setAttribute('aria-labelledby', 'help-title');
    dialog.innerHTML = `<h2 id="help-title">How to play</h2>
      <ol class="steps">
        <li>A color is missing from the flag. Its area starts out in a random color and blinks briefly.</li>
        <li>Mix the real color with the Hue, Saturation and Brightness sliders. Some flags hide two colors; switch between them with the tabs.</li>
        <li>Lock it in to see how close you got, and what was off.</li>
      </ol>
      <h3>Match</h3>
      <dl class="grade-table">${GRADES.map((g, i) => `<div><dt><span class="grade-label" data-grade="${g.id}">${g.label}</span>
        <span>${g.min ? `${g.min}%+` : `&lt;${GRADES[i - 1].min}%`}</span></dt><dd>${g.blurb}</dd></div>`).join('')}</dl>
      <h3>Modes</h3>
      <ul class="modes">
        <li><b>Daily</b>: five flags, the same for everyone, once a day.</li>
        <li><b>Classic</b>: five flags; your score is the average match. Challenge a friend to the same five.</li>
        <li><b>Endless</b>: ${START_HEARTS} hearts. Under ${SAFE_PERCENT}% costs a heart; a Perfect wins one back.</li>
        <li><b>Time Attack</b>: ${TIMED_SECONDS} seconds. Great adds ${TIME_BONUS.great}s, Perfect adds ${TIME_BONUS.perfect}s.</li>
        <li><b>Combo</b>: Great or better in a row builds a combo that multiplies Time Attack points.</li>
      </ul>
      <form method="dialog"><button class="btn btn-primary btn-block btn-lg" autofocus>Got it</button></form>`;
    dialog.addEventListener('close', () => records.markHelpSeen());
    document.body.append(dialog);
    return dialog;
  }

  function openHelp() {
    helpShownOnce = true;
    help.showModal();
    help.scrollTop = 0;
  }

  function createToast() {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
    let timer;
    return (message) => {
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('show'), 1800);
    };
  }

  function createBadgeToast() {
    const el = document.createElement('div');
    el.className = 'badge-toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
    let timer;
    return (badge) => {
      el.innerHTML = `<span class="badge-icon" aria-hidden="true">${badge.icon}</span>
        <span><small>Badge unlocked</small><strong>${esc(badge.name)}</strong></span>`;
      el.classList.add('show');
      sounds.badge();
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('show'), 2400);
    };
  }

  renderHome();
}
