// Screens and event wiring. Rules live in game.js, ratings in rating.js and
// everything kept between visits in records.js; this file only draws.
import { Game, ROUNDS, START_HEARTS, SAFE_PERCENT } from './game.js';
import { TIERS, flagByCode } from './flags.js';
import { loadFlag, flagUrl } from './flagLoader.js';
import { hsbToHex, hexToHsb } from './colors.js';
import { GRADES, gradeFor, describeMiss } from './rating.js';
import { Records } from './records.js';
import { dateKey, dailyCodes, dailyNumber, dailyRoundRandom } from './daily.js';
import { shareText } from './share.js';

const TIER_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible' };
const MODE_LABELS = { daily: 'Daily', classic: 'Classic', endless: 'Endless' };
const MAX_LOAD_ATTEMPTS = 5;
const MAX_END_ROWS = 60;
const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
const RING_C = 2 * Math.PI * 42;

const LOGO = `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true">
  <g transform="rotate(-8 22 26)">
    <rect x="4" y="11" width="36" height="30" rx="7" fill="#fff" stroke="#ddd6cf" stroke-width="2"/>
    <rect x="10" y="17" width="8" height="18" fill="#3b6fd4"/>
    <rect x="18" y="17" width="8" height="18" fill="#f5f1ed"/>
    <rect x="26" y="17" width="8" height="18" fill="#e04848"/>
  </g>
  <path d="M33 14 41 4l4 3-8 11z" fill="#2b2a29"/>
  <path d="M31 15c2-1 4 0 5 2-1 3-4 4-7 3 1-2 0-4 2-5z" fill="#2b2a29"/>
</svg>`;
const icon = (d, w = 2.4) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const BACK_ICON = icon('<path d="M15 18 9 12l6-6"/>');
const HELP_ICON = icon('<circle cx="12" cy="12" r="9.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17.2h.01"/>', 2.2);
const CHECK_ICON = icon('<path d="m5 13 4 4L19 7"/>', 2.6);
const ARROW_ICON = icon('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.6);
const SHARE_ICON = icon('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>', 2.2);
const EYE_ICON = icon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 2.2);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const gradeById = (id) => GRADES.find((g) => g.id === id);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem('geopaint:probe');
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

function ring(grade, big = false) {
  return `<div class="ring${big ? ' big' : ''}" data-grade="${grade}">
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="42"/>
      <circle class="meter" cx="50" cy="50" r="42" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>
    <strong aria-hidden="true"><span><span class="num">0</span><span class="unit">%</span></span></strong>
  </div>`;
}

function animateRing(el, percent) {
  const meter = el.querySelector('.meter');
  const num = el.querySelector('.num');
  const offset = RING_C * (1 - percent / 100);
  el.classList.toggle('full', percent >= 100);
  if (reducedMotion()) {
    meter.style.strokeDashoffset = offset;
    num.textContent = percent;
    return;
  }
  meter.getBoundingClientRect();
  requestAnimationFrame(() => { meter.style.strokeDashoffset = offset; });
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
  const colors = ['#7c5cff', '#f0cf6c', '#23a55a', '#e04848', '#3b6fd4'];
  const dots = Array.from({ length: 14 }, (_, i) =>
    `<i style="--a:${(i * 360) / 14}deg;--c:${colors[i % colors.length]}"></i>`).join('');
  return `<div class="burst" aria-hidden="true">${dots}</div>`;
}

function squares(results) {
  return `<div class="squares" aria-hidden="true">${results
    .map((r) => `<i data-grade="${r.grade}"></i>`).join('')}</div>`;
}

export function boot(app) {
  const records = new Records(safeStorage());
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
  const helpButton = `<button class="icon-btn" id="help-btn" aria-label="How to play">${HELP_ICON}</button>`;
  const backButton = `<button class="icon-btn" id="quit" aria-label="Back to home">${BACK_ICON}</button>`;

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
        `<span${i < game.hearts ? '' : ' class="lost"'}>♥</span>`).join('');
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
    return topbar({ left: backButton, center: esc(modeTitle()), right: progress() });
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
      dailyBody = `<div class="daily-done">${ring(gradeFor(dailyAverage).id)}
          <div><p class="end-sub" style="margin:0 0 6px">Today’s average</p>${squares(daily.results)}</div></div>
        <div class="button-row"><button class="secondary" id="daily-share">${SHARE_ICON}Share</button>
          <button class="secondary" id="daily-review">Review</button></div>
        <p class="next-daily">Next Daily in <span id="countdown">${untilTomorrow()}</span></p>`;
    } else if (daily?.results.length) {
      dailyBody = `<p>You’re on flag ${daily.results.length + 1} of ${ROUNDS}. Pick up where you left off.</p>
        <button class="primary" id="daily-play">Continue ${ARROW_ICON}</button>`;
    } else {
      dailyBody = `<p>Five flags, the same for everyone today. One try.</p>
        <button class="primary" id="daily-play">Play today’s flags ${ARROW_ICON}</button>`;
    }

    app.innerHTML = `${topbar({ right: helpButton })}
      <section class="screen home">
        <div class="hero">${LOGO}<h1>GeoPaint</h1><p>Paint the missing color back into the flag.</p></div>
        <div class="card daily">
          <div class="daily-head">
            <h2>Daily <small>#${dailyNumber(today)} · ${esc(dateLabel)}</small></h2>
            ${streak ? `<span class="streak" title="Daily streak" aria-label="${streak}-day streak">🔥 ${streak}</span>` : ''}
          </div>
          ${dailyBody}
        </div>
        <h2 class="section-title">Free play</h2>
        <div class="field">
          <div class="seg" data-group="mode" role="group" aria-label="Mode">
            <button data-value="classic">Classic<small>5 flags</small></button>
            <button data-value="endless">Endless<small>${START_HEARTS} hearts</small></button>
          </div>
        </div>
        <div class="field">
          <div class="seg seg-4" data-group="tier" role="group" aria-label="Difficulty">
            ${TIERS.map((t) => `<button data-value="${t}">${TIER_LABELS[t]}</button>`).join('')}
          </div>
        </div>
        <p class="best" id="best"></p>
        <button class="primary" id="start">Play ${ARROW_ICON}</button>
        ${stats.flags ? `<div class="stats">
          <div><strong>${stats.flags}</strong><span>flags painted</span></div>
          <div><strong>${Math.round(stats.percentSum / stats.flags)}%</strong><span>average match</span></div>
          <div><strong>${stats.perfects}</strong><span>perfect</span></div>
        </div>` : ''}
      </section>`;
    wireTopbar();

    // After midnight the card shows yesterday's Daily: redraw instead of acting on it.
    const sameDay = (action) => () => (dateKey() === today ? action() : renderHome());
    if (daily?.done) {
      animateRing(app.querySelector('.daily .ring'), dailyAverage);
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
      for (const group of app.querySelectorAll('.seg')) {
        for (const btn of group.querySelectorAll('button')) {
          btn.setAttribute('aria-pressed', String(choice[group.dataset.group] === btn.dataset.value));
        }
      }
      app.querySelector('#best').textContent = formatBest(choice.mode, records.best(choice.mode, choice.tier));
    };
    for (const group of app.querySelectorAll('.seg')) {
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

  async function startRound() {
    const token = session;
    primary = null;
    app.innerHTML = `${gameTopbar()}
      <section class="screen round">
        <h1 class="country">&nbsp;</h1>
        <p class="subtitle">&nbsp;</p>
        <div class="stage"><div class="flag-frame loading"></div></div>
      </section>`;
    wireTopbar();

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
    app.innerHTML = `${gameTopbar()}
      <section class="screen">
        <p class="error">Couldn’t load the flag. Check your connection and try again.</p>
        <button class="primary" id="retry">Retry</button>
      </section>`;
    wireTopbar();
    primary = app.querySelector('#retry');
    primary.addEventListener('click', startRound);
  }

  // ---------- Round ----------
  function sliderRow(id, label, max) {
    return `<label class="slider-row" for="${id}">
      <span class="slider-label">${label}<output id="${id}-out" for="${id}"></output></span>
      <input type="range" class="slider" id="${id}" min="0" max="${max}" step="1">
    </label>`;
  }

  function renderRound({ code, flag, startHue }) {
    const name = flagByCode(code).name;
    app.innerHTML = `${gameTopbar()}
      <section class="screen round">
        <h1 class="country">${esc(name)}</h1>
        <p class="subtitle">${game.round === 1 ? 'One color is wrong. Mix the real one back in.' : '&nbsp;'}</p>
        <div class="stage"><div class="flag-frame" style="--ratio:${flag.ratio}"></div></div>
        <div class="under-flag"></div>
        <div id="panel">
          <div class="sliders">
            ${sliderRow('hue', 'Hue', 360)}
            ${sliderRow('sat', 'Saturation', 100)}
            ${sliderRow('bri', 'Brightness', 100)}
          </div>
          <button class="primary" id="lock">Lock color ${CHECK_ICON}</button>
        </div>
      </section>`;
    wireTopbar();
    flag.svg.classList.remove('revealing');
    flag.svg.setAttribute('aria-label', `Flag of ${name}, with one color missing`);
    app.querySelector('.flag-frame').append(flag.svg);

    const hue = app.querySelector('#hue');
    const sat = app.querySelector('#sat');
    const bri = app.querySelector('#bri');
    hue.value = startHue;
    sat.value = 50;
    bri.value = 50;
    hue.style.background = HUE_GRADIENT;

    const current = () => hsbToHex(Number(hue.value), sat.value / 100, bri.value / 100);
    const paint = () => {
      const h = Number(hue.value), s = sat.value / 100, b = bri.value / 100;
      sat.style.background = `linear-gradient(to right, ${hsbToHex(h, 0, b)}, ${hsbToHex(h, 1, b)})`;
      bri.style.background = `linear-gradient(to right, #000000, ${hsbToHex(h, s, 1)})`;
      for (const [input, text] of [[hue, `${hue.value}°`], [sat, `${sat.value}%`], [bri, `${bri.value}%`]]) {
        app.querySelector(`#${input.id}-out`).textContent = text;
        input.setAttribute('aria-valuetext', text);
      }
      flag.setGuess(current());
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
      <div class="cmp-legend"><span><i style="background:${guessHex}"></i>Yours</span><span><i class="target" style="background:${trueHex}"></i>Real flag</span></div>
    </div>`;
  }

  function renderReveal({ name, flag, result, values, outcome }) {
    app.querySelector('.topbar').outerHTML = gameTopbar();
    wireTopbar();
    if (result.heartChange) app.querySelector('.hearts')?.classList.add('pop');
    app.querySelector('.subtitle').innerHTML = '&nbsp;';

    flag.svg.classList.add('revealing');
    flag.reveal();
    flag.svg.setAttribute('aria-label', `Flag of ${name}`);
    setTimeout(() => flag.svg.classList.remove('revealing'), 700);

    const grade = gradeById(result.grade);
    const tip = describeMiss(result.guessHex, result.trueHex) || `${grade.blurb}.`;
    let heartNote = '';
    if (result.heartChange < 0) heartNote = `<p class="heart-note lost">−1 heart · under ${SAFE_PERCENT}%</p>`;
    if (result.heartChange > 0) heartNote = '<p class="heart-note won">+1 heart for a Perfect!</p>';
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
        <div class="result-top">
          <div style="position:relative">${ring(grade.id)}${grade.id === 'perfect' && !reducedMotion() ? burst() : ''}</div>
          <div class="verdict">
            <p class="grade-label">${grade.label}</p>
            <p class="tip">${esc(tip)}</p>
            ${heartNote}
          </div>
          <div class="split" aria-hidden="true">
            <div class="split-chip"><i style="background:${result.guessHex}"></i><i style="background:${result.trueHex}"></i></div>
            <div class="split-legend"><span>You</span><span>Real</span></div>
            <code>${result.trueHex}</code>
          </div>
        </div>
        ${compareBars(values, result.guessHex, result.trueHex)}
      </div>
      <button class="primary" id="next">${over ? 'See results' : 'Next flag'} ${ARROW_ICON}</button>`;
    animateRing(panel.querySelector('.ring'), result.percent);

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
    let title = 'Game complete';
    if (daily) title = `Daily #${dailyNumber(dailyKey)} complete`;
    if (mode === 'endless') title = 'Out of hearts';

    let headline;
    if (mode === 'endless') {
      headline = `<p class="big-count">${score}</p>
        <p class="end-sub">${score === 1 ? 'flag' : 'flags'} painted${score ? ` · ${game.average}% average` : ''}</p>`;
    } else {
      headline = `${ring(gradeFor(score).id, true)}<p class="end-sub">average match</p>`;
    }
    let extra = '';
    if (outcome?.isNewBest) extra = '<span class="badge">New best!</span>';
    else if (daily) {
      const streak = records.dailyStreak(dailyKey);
      if (streak) extra = `<p class="end-sub">🔥 ${streak}-day streak</p>`;
    } else extra = `<p class="end-sub">${formatBest(mode, records.best(mode, game.tier))}</p>`;

    const shown = game.results.slice(-MAX_END_ROWS);
    app.innerHTML = `${topbar({ left: backButton, center: esc(modeTitle()) })}
      <section class="screen end">
        <div class="end-head">
          <h1>${title}</h1>
          ${headline}
          ${extra}
          ${squares(game.results)}
        </div>
        <ol class="results"></ol>
        ${game.results.length > shown.length ? `<p class="more">Showing your last ${MAX_END_ROWS} flags</p>` : ''}
        <button class="primary" id="share">Share result ${SHARE_ICON}</button>
        <div class="button-row">
          ${daily ? '' : '<button class="secondary" id="again">Play again</button>'}
          <button class="secondary" id="home"${daily ? ' style="grid-column: 1 / -1"' : ''}>Home</button>
        </div>
        ${daily ? `<p class="next-daily">Next Daily in ${untilTomorrow()}</p>` : ''}
      </section>`;
    wireTopbar();
    if (mode !== 'endless') animateRing(app.querySelector('.end-head .ring'), score);

    const list = app.querySelector('.results');
    for (const r of shown) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="thumb"><img alt="" loading="lazy"></span><span class="name"></span>
        <span class="pair"><i></i><i></i></span><span class="pct" data-grade="${r.grade}">${r.percent}%</span>`;
      li.querySelector('img').src = flagUrl(r.code);
      li.querySelector('.name').textContent = r.name;
      const [guess, truth] = li.querySelectorAll('.pair i');
      guess.style.background = r.guessHex;
      guess.title = `Yours ${r.guessHex}`;
      truth.style.background = r.trueHex;
      truth.title = `Real ${r.trueHex}`;
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
        <li>One color is missing from the flag. Its area starts out in a random color and flashes briefly.</li>
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
      <form method="dialog"><button class="primary" autofocus>Got it</button></form>`;
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
