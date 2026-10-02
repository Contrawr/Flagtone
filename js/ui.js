// DOM rendering and event wiring. Game rules live in game.js; this file only draws.
import { Game, STANDARD_ROUNDS, START_LIVES } from './game.js';
import { TIERS, flagByCode } from './flags.js';
import { loadFlag } from './flagLoader.js';
import { hsbToHex } from './colors.js';

const TIER_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible' };
const MODE_LABELS = { standard: 'Standard', infinite: 'Infinite' };
const MAX_LOAD_ATTEMPTS = 5;
const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';

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
const HOME_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>`;

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem('geopaint:probe');
    return s;
  } catch {
    return null;
  }
}

function verdictFor(score) {
  if (score >= 9.5) return 'Perfect match!';
  if (score >= 8.5) return 'Excellent';
  if (score >= 7) return 'Close';
  if (score >= 4) return 'Not quite';
  return 'Way off';
}

function formatBest(mode, best) {
  if (best == null) return 'No best score yet';
  return mode === 'standard' ? `Best: ${best} / 50` : `Best streak: ${best}`;
}

export function boot(app) {
  const game = new Game({ storage: safeStorage() });
  const choice = { mode: 'standard', tier: 'easy' };
  let pending = null;
  let session = 0; // bumps whenever the current game is abandoned or replaced

  function header({ sub, left = '', right = '' }) {
    return `<header class="header">
      <div class="header-left">${left}</div>
      <div class="brand">${LOGO}<div><div class="brand-name">GeoPaint</div><div class="brand-sub">${sub}</div></div></div>
      <div class="header-right">${right}</div>
    </header>`;
  }

  function gameHeader() {
    const right = game.mode === 'standard'
      ? `<span class="pill">${Math.min(game.round, STANDARD_ROUNDS)} / ${STANDARD_ROUNDS}</span>`
      : `<span class="hearts" aria-label="${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left">${'♥'.repeat(game.lives)}<span class="lost">${'♥'.repeat(START_LIVES - game.lives)}</span></span>
         <span class="pill" aria-label="Streak">${game.results.length}</span>`;
    return header({
      sub: `${MODE_LABELS[game.mode]} · ${TIER_LABELS[game.tier]}`,
      left: `<button class="icon-btn" id="quit" aria-label="Back to home">${HOME_ICON}</button>`,
      right,
    });
  }

  function wireQuit() {
    app.querySelector('#quit').addEventListener('click', renderHome);
  }

  // ---------- Home ----------
  function renderHome() {
    pending = null;
    session++;
    app.innerHTML = `${header({ sub: 'Flag color matching' })}
      <section>
        <h1 class="title">Match the missing color</h1>
        <p class="lead">Every flag is missing one color.<br>Mix it back in with the sliders.</p>
        <div class="field">
          <span class="label">Mode</span>
          <div class="seg" data-group="mode">
            <button data-value="standard">Standard<small>5 flags</small></button>
            <button data-value="infinite">Infinite<small>3 lives</small></button>
          </div>
        </div>
        <div class="field">
          <span class="label">Difficulty</span>
          <div class="seg seg-4" data-group="tier">
            ${TIERS.map((t) => `<button data-value="${t}">${TIER_LABELS[t]}</button>`).join('')}
          </div>
        </div>
        <p class="best" id="best"></p>
        <button class="primary" id="start">Start</button>
      </section>`;

    const sync = () => {
      for (const group of app.querySelectorAll('.seg')) {
        for (const btn of group.querySelectorAll('button')) {
          btn.setAttribute('aria-pressed', String(choice[group.dataset.group] === btn.dataset.value));
        }
      }
      app.querySelector('#best').textContent = formatBest(choice.mode, game.bestFor(choice.mode, choice.tier));
    };
    for (const group of app.querySelectorAll('.seg')) {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        choice[group.dataset.group] = btn.dataset.value;
        sync();
      });
    }
    app.querySelector('#start').addEventListener('click', () => {
      game.start(choice.mode, choice.tier);
      session++;
      pending = null;
      startRound();
    });
    sync();
  }

  // ---------- Loading flags ----------
  async function loadNextFlag(token) {
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      if (token !== session) return null;
      const code = game.nextFlagCode();
      try {
        return { code, flag: await loadFlag(code) };
      } catch (err) {
        console.warn(`Skipping flag ${code}:`, err);
      }
    }
    throw new Error('Could not load any flag');
  }

  function prefetchIfNeeded() {
    const more = game.mode === 'infinite' || game.round < STANDARD_ROUNDS;
    if (!more) return;
    pending = loadNextFlag(session);
    pending.catch(() => {});
  }

  async function startRound() {
    const token = session;
    app.innerHTML = `${gameHeader()}
      <section>
        <h1 class="title country">&nbsp;</h1>
        <div class="flag-frame loading"></div>
      </section>`;
    wireQuit();

    const promise = pending ?? loadNextFlag(token);
    pending = null;
    let next;
    try {
      next = await promise;
    } catch {
      if (token !== session) return;
      renderLoadError();
      return;
    }
    if (token !== session || !next) return; // user left meanwhile
    renderRound(next);
    prefetchIfNeeded();
  }

  function renderLoadError() {
    app.innerHTML = `${gameHeader()}
      <section>
        <p class="error">Couldn't load flags. Check your connection.</p>
        <button class="primary" id="retry">Retry</button>
      </section>`;
    wireQuit();
    app.querySelector('#retry').addEventListener('click', startRound);
  }

  // ---------- Round ----------
  function renderRound({ code, flag }) {
    app.innerHTML = `${gameHeader()}
      <section>
        <h1 class="title country"></h1>
        <div class="flag-frame"></div>
        <div class="controls">
          <div class="sliders">
            <input type="range" class="slider" id="hue" min="0" max="360" step="1" aria-label="Hue">
            <input type="range" class="slider" id="sat" min="0" max="100" step="1" aria-label="Saturation">
            <input type="range" class="slider" id="bri" min="0" max="100" step="1" aria-label="Brightness">
          </div>
          <button class="primary" id="lock">Lock Color ${CHECK_ICON}</button>
        </div>
      </section>`;
    wireQuit();
    app.querySelector('.country').textContent = flagByCode(code).name;
    flag.svg.setAttribute('aria-label', `Flag of ${flagByCode(code).name}`);
    app.querySelector('.flag-frame').append(flag.svg);

    const hue = app.querySelector('#hue');
    const sat = app.querySelector('#sat');
    const bri = app.querySelector('#bri');
    hue.value = Math.floor(Math.random() * 361);
    sat.value = 50;
    bri.value = 50;
    hue.style.background = HUE_GRADIENT;

    const current = () => hsbToHex(Number(hue.value), sat.value / 100, bri.value / 100);
    const paint = () => {
      const h = Number(hue.value), s = sat.value / 100, b = bri.value / 100;
      sat.style.background = `linear-gradient(to right, ${hsbToHex(h, 0, b)}, ${hsbToHex(h, 1, b)})`;
      bri.style.background = `linear-gradient(to right, #000000, ${hsbToHex(h, s, 1)})`;
      flag.setGuess(current());
    };
    for (const input of [hue, sat, bri]) input.addEventListener('input', paint);
    paint();

    app.querySelector('#lock').addEventListener('click', () => {
      const result = game.submit(code, current(), flag.hiddenHex);
      flag.reveal();
      renderReveal(result);
    });
  }

  function renderReveal(result) {
    if (game.mode === 'infinite') {
      // Lives and the streak changed. (Standard keeps showing the current round.)
      app.querySelector('.header').outerHTML = gameHeader();
      wireQuit();
    }
    const controls = app.querySelector('.controls');
    controls.innerHTML = `<div class="reveal">
        <div class="swatches">
          <div class="swatch"><div class="chip" id="chip-guess"></div>Yours<code id="hex-guess"></code></div>
          <div class="score"><strong id="score"></strong><span>/ 10</span></div>
          <div class="swatch"><div class="chip" id="chip-true"></div>Actual<code id="hex-true"></code></div>
        </div>
        <p class="verdict" id="verdict"></p>
        <button class="primary" id="next"></button>
      </div>`;
    controls.querySelector('#chip-guess').style.background = result.guessHex;
    controls.querySelector('#chip-true').style.background = result.trueHex;
    controls.querySelector('#hex-guess').textContent = result.guessHex;
    controls.querySelector('#hex-true').textContent = result.trueHex;
    controls.querySelector('#score').textContent = result.score.toFixed(1);
    const verdict = controls.querySelector('#verdict');
    verdict.textContent = verdictFor(result.score);
    if (result.lostLife) {
      const lost = document.createElement('span');
      lost.className = 'lost';
      lost.textContent = ' · −1 life';
      verdict.append(lost);
    }
    const next = controls.querySelector('#next');
    next.textContent = game.isOver() ? 'See results' : 'Next flag';
    next.addEventListener('click', () => (game.isOver() ? renderEnd() : startRound()));
    next.focus();
  }

  // ---------- End ----------
  function renderEnd() {
    pending = null;
    session++;
    const standard = game.mode === 'standard';
    const best = game.bestFor(game.mode, game.tier);
    app.innerHTML = `${header({ sub: `${MODE_LABELS[game.mode]} · ${TIER_LABELS[game.tier]}` })}
      <section>
        <h1 class="title">${standard ? 'Results' : 'Out of lives'}</h1>
        <p class="big-score">${standard ? `${game.total}<span> / 50</span>` : `${game.results.length}<span> flags</span>`}</p>
        ${game.isNewBest ? '<span class="badge">New best!</span>' : `<p class="best">${formatBest(game.mode, best)}</p>`}
        <ol class="results"></ol>
        <button class="primary" id="again">Play again</button>
        <button class="secondary" id="home">Home</button>
      </section>`;
    const list = app.querySelector('.results');
    for (const r of game.results) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="pair"><i></i><i></i></span><span class="name"></span><span class="pts"></span>`;
      const [guess, truth] = li.querySelectorAll('i');
      guess.style.background = r.guessHex;
      guess.title = `Yours ${r.guessHex}`;
      truth.style.background = r.trueHex;
      truth.title = `Actual ${r.trueHex}`;
      li.querySelector('.name').textContent = r.name;
      li.querySelector('.pts').textContent = r.score.toFixed(1);
      list.append(li);
    }
    app.querySelector('#again').addEventListener('click', () => {
      game.start(game.mode, game.tier);
      session++;
      startRound();
    });
    app.querySelector('#home').addEventListener('click', renderHome);
  }

  renderHome();
}
