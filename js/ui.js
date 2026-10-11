// Screens and event wiring. Rules live in game.js, ratings in rating.js and
// everything kept between visits in records.js; this file only draws.
import { Game, ROUNDS, START_HEARTS, SAFE_PERCENT } from './game.js';
import { TIERS, flagByCode } from './flags.js';
import { loadFlag, flagUrl } from './flagLoader.js';
import { hsbToHex, hexToHsb } from './colors.js';
import { GRADES, gradeFor, describeMiss } from './rating.js';
import { Records, migrateStorage } from './records.js';
import { dateKey, dailyCodes, dailyNumber, dailyRoundRandom, DAILY_TIERS } from './daily.js';
import { shareText } from './share.js';

export const NAME = 'Flagtone';
const TIER_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible' };
const MODE_LABELS = { daily: 'Daily', classic: 'Classic', endless: 'Endless' };
const MAX_LOAD_ATTEMPTS = 5;
const MAX_END_ROWS = 60;
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
const EYE_ICON = icon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const HEART = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.4C1 8.3 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.7 3.8 4.3 7.1C19.5 16.4 12 21 12 21z"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const gradeById = (id) => GRADES.find((g) => g.id === id);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem('flagtone:probe');
    return s;
  } catch {
    return null;
  }
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported: no buzz.
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

// Counts a number up to `percent` and fills its meter, if there is one.
function animateScore(root, percent) {
  const num = root.querySelector('.count');
  const bar = root.querySelector('.meter i');
  if (reducedMotion()) {
    num.textContent = percent;
    if (bar) bar.style.width = `${percent}%`;
    return;
  }
  if (bar) {
    bar.getBoundingClientRect();
    requestAnimationFrame(() => { bar.style.width = `${percent}%`; });
  }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 700);
    num.textContent = Math.round(percent * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Hidden tabs don't run animation frames; make sure the final number lands.
  setTimeout(() => { num.textContent = percent; }, 900);
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

export function boot(app) {
  const storage = safeStorage();
  migrateStorage(storage);
  const records = new Records(storage);
  const game = new Game();
  const saved = records.read('choice');
  const choice = {
    mode: saved?.mode === 'endless' ? 'endless' : 'classic',
    tier: TIERS.includes(saved?.tier) ? saved.tier : 'easy',
  };
  let pending = null; // prefetched next flag
  let session = 0;    // bumps whenever the current screen's game is left behind
  let dailyKey = null;
  let primary = null; // the button Enter presses
  let timers = [];
  let helpShownOnce = false; // without storage, first-visit help would reopen on every Home

  const help = createHelp();
  const toast = createToast();

  function leave() {
    session++;
    pending = null;
    primary = null;
    for (const t of timers) clearInterval(t);
    timers = [];
  }

  function show(screen, html) {
    app.dataset.screen = screen;
    app.innerHTML = html;
    wireTopbar();
  }

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

  function wireTopbar() {
    app.querySelector('#quit')?.addEventListener('click', renderHome);
    app.querySelector('#help-btn')?.addEventListener('click', openHelp);
  }

  function modeTitle() {
    return game.mode === 'daily'
      ? `Daily #${dailyNumber(dailyKey)}`
      : `${MODE_LABELS[game.mode]} · ${TIER_LABELS[game.tier]}`;
  }

  function progress() {
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
    return topbar({ left: quitButton, center: esc(modeTitle()), right: progress() });
  }

  // Small line above the country name.
  function roundLabel() {
    if (game.mode === 'daily') return `${TIER_LABELS[DAILY_TIERS[game.results.length]]} · Flag ${game.round} of ${ROUNDS}`;
    if (game.mode === 'classic') return `Flag ${game.round} of ${ROUNDS}`;
    return `Flag ${game.round}`;
  }

  function formatBest(mode, best) {
    if (best == null) return 'No best score yet';
    return mode === 'endless' ? `Best run: ${best} ${best === 1 ? 'flag' : 'flags'}` : `Best: ${best}% average`;
  }

  async function share(text) {
    try {
      if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
        await navigator.share({ text });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Result copied');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand?.('copy');
      area.remove();
      toast(ok ? 'Result copied' : 'Couldn’t copy the result');
    }
  }

  function siteUrl() {
    return location.protocol.startsWith('http') ? location.origin + location.pathname : '';
  }

  // ---------- Home ----------
  function renderHome() {
    leave();
    const token = session;
    const today = dateKey();
    const daily = records.daily(today);
    const streak = records.dailyStreak(today);
    const stats = records.stats();
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
        <p class="card-text">The same flags for everyone, from easy to impossible. One try.</p>
        ${dailySlots([])}
        <button class="btn btn-primary btn-block btn-lg" id="daily-play">Play the Daily ${ARROW_ICON}</button>`;
    }

    show('home', `${topbar({ left: brand, right: helpButton })}
      <section class="screen home">
        <div class="hero">
          <h1>Mix the missing color.</h1>
          <p>Every flag is missing one color. Recreate it with hue, saturation and brightness, and see how close you get.</p>
        </div>
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
            <div class="segmented" style="--n:2" data-group="mode" role="group" aria-labelledby="mode-label">
              <button data-value="classic">Classic<small>5 flags</small></button>
              <button data-value="endless">Endless<small>${START_HEARTS} hearts</small></button>
            </div>
            <span class="field-label" id="tier-label">Difficulty</span>
            <div class="segmented seg-tier" style="--n:4" data-group="tier" role="group" aria-labelledby="tier-label">
              ${TIERS.map((t) => `<button data-value="${t}">${TIER_LABELS[t]}</button>`).join('')}
            </div>
            <p class="best" id="best"></p>
            <button class="btn btn-primary btn-block btn-lg" id="start">Play ${ARROW_ICON}</button>
          </article>
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
      app.querySelector('#daily-share').addEventListener('click', sameDay(() => share(shareText({
        mode: 'daily', results: daily.results, score: dailyAverage, dailyNumber: dailyNumber(today), url: siteUrl(),
      }))));
      app.querySelector('#daily-review').addEventListener('click', sameDay(reviewDaily));
    } else {
      app.querySelector('#daily-play').addEventListener('click', sameDay(startDaily));
    }
    timers.push(setInterval(() => {
      if (token !== session) return;
      if (dateKey() !== today) renderHome();
      else if (daily?.done) app.querySelector('#countdown').textContent = untilTomorrow();
    }, 20_000));

    const sync = () => {
      for (const group of app.querySelectorAll('.segmented')) {
        for (const btn of group.querySelectorAll('button')) {
          btn.setAttribute('aria-pressed', String(choice[group.dataset.group] === btn.dataset.value));
        }
      }
      app.querySelector('#best').textContent = formatBest(choice.mode, records.best(choice.mode, choice.tier));
    };
    for (const group of app.querySelectorAll('.segmented')) {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        choice[group.dataset.group] = btn.dataset.value;
        records.write('choice', choice);
        sync();
      });
    }
    app.querySelector('#start').addEventListener('click', startFreePlay);
    primary = daily?.done ? app.querySelector('#start') : app.querySelector('#daily-play');
    sync();
    if (!records.seenHelp && !helpShownOnce) openHelp();
  }

  function startFreePlay() {
    leave();
    game.start(choice.mode, choice.tier);
    startRound();
  }

  function startDaily() {
    leave();
    dailyKey = dateKey();
    const progressSoFar = records.daily(dailyKey);
    game.start('daily', null, { codes: dailyCodes(dailyKey), results: progressSoFar?.results ?? [] });
    if (game.isOver()) renderEnd();
    else startRound();
  }

  function reviewDaily() {
    leave();
    dailyKey = dateKey();
    game.start('daily', null, { codes: dailyCodes(dailyKey), results: records.daily(dailyKey)?.results ?? [] });
    renderEnd();
  }

  // ---------- Loading flags ----------
  // The Daily's flags are fixed, so a failed load retries the same flag with the
  // same seed; free play moves on to another flag.
  async function loadFixed(code, token) {
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      if (token !== session) return null;
      const random = dailyRoundRandom(dailyKey, code);
      try {
        const flag = await loadFlag(code, random);
        return { code, flag, startHue: Math.floor(random() * 360) };
      } catch (err) {
        console.warn(`Retrying flag ${code}:`, err);
      }
    }
    throw new Error(`Could not load ${code}`);
  }

  async function loadNextFlag(token) {
    if (game.codes) return loadFixed(game.nextFlagCode(), token);
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      if (token !== session) return null;
      const code = game.nextFlagCode();
      try {
        return { code, flag: await loadFlag(code), startHue: Math.floor(Math.random() * 360) };
      } catch (err) {
        console.warn(`Skipping flag ${code}:`, err);
      }
    }
    throw new Error('Could not load any flag');
  }

  function prefetchIfNeeded() {
    if (game.mode !== 'endless' && game.round >= ROUNDS) return;
    pending = game.codes ? loadFixed(game.codes[game.results.length + 1], session) : loadNextFlag(session);
    pending.catch(() => {});
  }

  function roundShell(main, side) {
    return `${gameTopbar()}
      <section class="screen round">
        <div class="round-main">${main}</div>
        <div class="round-side" id="panel">${side}</div>
      </section>`;
  }

  async function startRound() {
    const token = session;
    primary = null;
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

  function renderRound({ code, flag, startHue }) {
    const name = flagByCode(code).name;
    show('round', roundShell(`<p class="eyebrow">${roundLabel()}</p>
        <h1 class="country">${esc(name)}</h1>
        <div class="stage"><div class="flag-frame" style="--ratio:${flag.ratio}"></div></div>
        <div class="under-flag">${game.round === 1 ? '<p class="hint">One color is wrong. Mix the real one back in.</p>' : ''}</div>`,
    `<div class="controls">
        <div class="sliders">
          ${sliderRow('hue', 'Hue', 360)}
          ${sliderRow('sat', 'Saturation', 100)}
          ${sliderRow('bri', 'Brightness', 100)}
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="lock">Lock color</button>
      </div>`));
    flag.svg.classList.remove('revealing');
    flag.svg.setAttribute('aria-label', `Flag of ${name}, with one color missing`);
    app.querySelector('.flag-frame').append(flag.svg);

    const hue = app.querySelector('#hue');
    const sat = app.querySelector('#sat');
    const bri = app.querySelector('#bri');
    hue.value = startHue;
    sat.value = 50;
    bri.value = 50;
    hue.style.setProperty('--track', HUE_GRADIENT);

    const current = () => hsbToHex(Number(hue.value), sat.value / 100, bri.value / 100);
    const paint = () => {
      const h = Number(hue.value), s = sat.value / 100, b = bri.value / 100;
      const color = current();
      hue.style.setProperty('--thumb', hsbToHex(h, 1, 1));
      sat.style.setProperty('--track', `linear-gradient(to right, ${hsbToHex(h, 0, b)}, ${hsbToHex(h, 1, b)})`);
      sat.style.setProperty('--thumb', color);
      bri.style.setProperty('--track', `linear-gradient(to right, #000000, ${hsbToHex(h, s, 1)})`);
      bri.style.setProperty('--thumb', color);
      for (const [input, text] of [[hue, `${hue.value}°`], [sat, `${sat.value}%`], [bri, `${bri.value}%`]]) {
        app.querySelector(`#${input.id}-out`).textContent = text;
        input.setAttribute('aria-valuetext', text);
      }
      flag.setGuess(color);
    };
    for (const input of [hue, sat, bri]) input.addEventListener('input', paint);
    paint();

    // Blink the area to paint by flipping it to a contrasting shade a few times.
    // Repainting the same targets as the guess blinks exactly the hidden color.
    let blinkTimer = null;
    if (!reducedMotion()) {
      let step = 0;
      const blink = () => {
        const guess = current();
        flag.setGuess(step % 2 === 0 ? contrastOf(guess) : guess);
        if (++step < 6) blinkTimer = setTimeout(blink, 260);
      };
      blinkTimer = setTimeout(blink, 300);
    }

    const lock = app.querySelector('#lock');
    primary = lock;
    lock.addEventListener('click', () => {
      clearTimeout(blinkTimer);
      if (game.mode === 'daily' && (records.daily(dailyKey)?.results.length ?? 0) > game.results.length) {
        toast('This Daily moved on in another tab');
        renderHome();
        return;
      }
      const values = { h: Number(hue.value), s: Number(sat.value), b: Number(bri.value) };
      const result = game.submit(code, current(), flag.hiddenHex);
      if (game.mode === 'daily') records.saveDaily(dailyKey, game.results, game.isOver());
      const outcome = game.isOver() ? records.finishGame(game) : null;
      if (game.isOver()) pending = null;
      if (result.heartChange < 0) vibrate([70, 50, 70]);
      else if (result.grade === 'perfect') vibrate(25);
      renderReveal({ name, flag, result, values, outcome });
    }, { once: true });
  }

  function compareBars(values, guessHex, trueHex) {
    const t = hexToHsb(trueHex);
    const hueMatters = t.s >= 0.04 && t.v >= 0.04;
    const satMatters = t.v >= 0.04;
    const baseH = hueMatters ? t.h : values.h;
    const marker = (pct, hex, target = false) =>
      `<i class="marker${target ? ' target' : ''}" style="left:${Math.min(100, Math.max(0, pct))}%;background:${hex}"></i>`;
    const row = (label, note, background, you, real) => `<div class="cmp-row">
        <span>${label}${note ? `<small>${note}</small>` : ''}</span>
        <div class="cmp-bar" style="background:${background}">${marker(you, guessHex)}${real == null ? '' : marker(real, trueHex, true)}</div>
      </div>`;
    return `<div class="compare" aria-hidden="true">
      ${row('Hue', hueMatters ? '' : 'any works', HUE_GRADIENT, (values.h / 360) * 100, hueMatters ? (t.h / 360) * 100 : null)}
      ${row('Saturation', satMatters ? '' : 'any works', `linear-gradient(to right, ${hsbToHex(baseH, 0, Math.max(t.v, 0.5))}, ${hsbToHex(baseH, 1, Math.max(t.v, 0.5))})`, values.s, satMatters ? t.s * 100 : null)}
      ${row('Brightness', '', `linear-gradient(to right, #000000, ${hsbToHex(baseH, t.s, 1)})`, values.b, t.v * 100)}
      <div class="cmp-legend"><span><i style="background:${guessHex}"></i>Yours</span><span><i class="target" style="background:${trueHex}"></i>Flag</span></div>
    </div>`;
  }

  function renderReveal({ name, flag, result, values, outcome }) {
    app.querySelector('.topbar').outerHTML = gameTopbar();
    wireTopbar();
    if (result.heartChange) app.querySelector('.hearts')?.classList.add('pop');

    flag.svg.classList.add('revealing');
    flag.reveal();
    flag.svg.setAttribute('aria-label', `Flag of ${name}`);
    setTimeout(() => flag.svg.classList.remove('revealing'), 700);

    const grade = gradeById(result.grade);
    const tip = describeMiss(result.guessHex, result.trueHex) || `${grade.blurb}.`;
    let heartNote = '';
    if (result.heartChange < 0) heartNote = `<p class="heart-note lost">−1 heart · under ${SAFE_PERCENT}%</p>`;
    if (result.heartChange > 0) heartNote = '<p class="heart-note won">+1 heart for a Perfect</p>';
    const over = game.isOver();

    const under = app.querySelector('.under-flag');
    under.innerHTML = `<button class="chip" id="compare" aria-pressed="false">${EYE_ICON}<span>Hold to see yours</span></button>`;
    const chip = under.querySelector('#compare');
    const showMine = (on) => {
      if (on) flag.setGuess(result.guessHex);
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

    const panel = app.querySelector('#panel');
    panel.innerHTML = `<div class="card result" data-grade="${grade.id}">
        <p class="visually-hidden" role="status">${result.percent}% match: ${grade.label}. ${esc(tip)}</p>
        <div class="result-head">
          <div class="big-num" aria-hidden="true"><span class="count">0</span><span class="unit">%</span></div>
          ${grade.id === 'perfect' && !reducedMotion() ? burst() : ''}
          <span class="grade-label">${grade.label}</span>
        </div>
        <div class="meter" aria-hidden="true"><i></i></div>
        <div class="verdict"><p class="tip">${esc(tip)}</p>${heartNote}</div>
        <div class="swatches" aria-hidden="true">
          <div class="swatch"><i style="background:${result.guessHex}"></i><span>Yours</span><code>${result.guessHex}</code></div>
          <div class="swatch"><i style="background:${result.trueHex}"></i><span>Flag</span><code>${result.trueHex}</code></div>
        </div>
        ${compareBars(values, result.guessHex, result.trueHex)}
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="next">${over ? 'See results' : 'Next flag'} ${ARROW_ICON}</button>`;
    animateScore(panel.querySelector('.result'), result.percent);

    const next = panel.querySelector('#next');
    next.addEventListener('click', () => (over ? renderEnd({ outcome }) : startRound()), { once: true });
    next.focus({ preventScroll: true });
    primary = next;
    panel.querySelector('.result').scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // ---------- End ----------
  function renderEnd({ outcome = null } = {}) {
    leave();
    const { mode } = game;
    const score = game.finalScore();
    const daily = mode === 'daily';
    let title = `${MODE_LABELS[mode]} · ${TIER_LABELS[game.tier]} complete`;
    if (daily) title = `Daily #${dailyNumber(dailyKey)} complete`;
    if (mode === 'endless') title = 'Out of hearts';

    let headline;
    if (mode === 'endless') {
      headline = `<div class="end-score">${score}</div>
        <p class="end-sub">${score === 1 ? 'flag' : 'flags'} painted${score ? ` · ${game.average}% average` : ''}</p>`;
    } else {
      const grade = gradeFor(score);
      headline = `<div class="end-score"><span class="count">0</span><span class="unit">%</span></div>
        <p class="end-sub">average match <span class="grade-label" data-grade="${grade.id}">${grade.label}</span></p>`;
    }
    let extra = '';
    if (outcome?.isNewBest) extra = '<span class="badge">New best</span>';
    else if (daily) {
      const streak = records.dailyStreak(dailyKey);
      if (streak) extra = `<p class="end-sub">🔥 ${streak}-day streak</p>`;
    } else extra = `<p class="end-sub">${formatBest(mode, records.best(mode, game.tier))}</p>`;

    const shown = game.results.slice(-MAX_END_ROWS);
    show('end', `${topbar({ left: quitButton, center: esc(modeTitle()) })}
      <section class="screen end">
        <div class="end-head">
          <h1>${title}</h1>
          ${headline}
          ${extra}
          ${squares(game.results)}
        </div>
        <ol class="card results"></ol>
        ${game.results.length > shown.length ? `<p class="more">Showing your last ${MAX_END_ROWS} flags</p>` : ''}
        <div class="end-actions">
          <button class="btn btn-primary btn-block btn-lg" id="share">${SHARE_ICON}Share result</button>
          <div class="btn-row">
            ${daily ? '' : '<button class="btn btn-secondary" id="again">Play again</button>'}
            <button class="btn btn-secondary" id="home"${daily ? ' style="grid-column: 1 / -1"' : ''}>Home</button>
          </div>
        </div>
        ${daily ? `<p class="fineprint">Next Daily in ${untilTomorrow()}</p>` : ''}
      </section>`);
    if (mode !== 'endless') animateScore(app.querySelector('.end-head'), score);

    const list = app.querySelector('.results');
    for (const r of shown) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="thumb"><img alt="" loading="lazy"></span><span class="name"></span>
        <span class="pair"><i></i><i></i></span><span class="grade-label pct" data-grade="${r.grade}">${r.percent}%</span>`;
      li.querySelector('img').src = flagUrl(r.code);
      li.querySelector('.name').textContent = r.name;
      const [guess, truth] = li.querySelectorAll('.pair i');
      guess.style.background = r.guessHex;
      guess.title = `Yours ${r.guessHex}`;
      truth.style.background = r.trueHex;
      truth.title = `Flag ${r.trueHex}`;
      li.setAttribute('aria-label', `${r.name}: ${r.percent}% match, ${gradeById(r.grade).label}`);
      list.append(li);
    }

    const text = shareText({
      mode, tier: game.tier, results: game.results, score,
      dailyNumber: daily ? dailyNumber(dailyKey) : null, url: siteUrl(),
    });
    app.querySelector('#share').addEventListener('click', () => share(text));
    app.querySelector('#home').addEventListener('click', renderHome);
    const again = app.querySelector('#again');
    again?.addEventListener('click', () => {
      leave();
      game.start(mode, game.tier);
      startRound();
    });
    primary = again ?? app.querySelector('#share');
  }

  // ---------- Help & toast ----------
  function createHelp() {
    const dialog = document.createElement('dialog');
    dialog.className = 'help';
    dialog.setAttribute('aria-labelledby', 'help-title');
    dialog.innerHTML = `<h2 id="help-title">How to play</h2>
      <ol class="steps">
        <li>One color is missing from the flag. Its area starts out in a random color and blinks briefly.</li>
        <li>Mix the real color with the Hue, Saturation and Brightness sliders. The flag updates as you go.</li>
        <li>Lock it in to see how close you got, and what was off.</li>
      </ol>
      <h3>Match</h3>
      <dl class="grade-table">${GRADES.map((g, i) => `<div><dt><span class="grade-label" data-grade="${g.id}">${g.label}</span>
        <span>${g.min ? `${g.min}%+` : `&lt;${GRADES[i - 1].min}%`}</span></dt><dd>${g.blurb}</dd></div>`).join('')}</dl>
      <h3>Modes</h3>
      <ul class="modes">
        <li><b>Daily</b>: five flags, the same for everyone, once a day.</li>
        <li><b>Classic</b>: five flags; your score is the average match.</li>
        <li><b>Endless</b>: ${START_HEARTS} hearts. Under ${SAFE_PERCENT}% costs a heart; a Perfect wins one back.</li>
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

  renderHome();
}
