// Plays every mode in headless Chromium at phone size and fails on console errors,
// horizontal overflow or a broken flow. Optionally saves screenshots.
//
// Needs Playwright (npm i -g playwright). Usage: node dev/playthrough.mjs [screenshot-dir]
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs'));
  }
}

const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const { chromium } = await loadPlaywright();
const { server, url } = await serve();
const browser = await chromium.launch();
const errors = [];
const log = (...args) => console.log(...args);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function newPage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}

async function shot(page, name) {
  if (!shots) return;
  await page.waitForTimeout(950); // let entrance and reveal animations finish
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
}

// The header's three parts must not overlap.
async function headerFits(page, where) {
  const gaps = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    const [l, c, r] = ['.tb-left', '.tb-center', '.tb-right'].map(box);
    return [c.left - l.right, r.left - c.right];
  });
  check(gaps.every((g) => g >= 0), `${where}: header parts overlap (${gaps})`);
}

async function noOverflow(page, where) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  check(sw <= w, `${where}: page is ${sw}px wide in a ${w}px viewport`);
}

async function setSliders(page, h, s, b) {
  await page.evaluate(([h, s, b]) => {
    for (const [id, v] of [['hue', h], ['sat', s], ['bri', b]]) {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, [h, s, b]);
}

// Sets the sliders, locks the color and returns the announced result.
async function playRound(page, { hsb = [200, 60, 70] } = {}) {
  await page.waitForSelector('#lock');
  const name = await page.textContent('.country');
  await setSliders(page, ...hsb);
  await page.click('#lock');
  await page.waitForSelector('#next');
  const pct = await page.textContent('.result [role=status]');
  return `${name}: ${pct}`;
}

try {
  // ---------- Phone ----------
  const page = await newPage({ width: 375, height: 667 });
  await page.goto(`${url}/`);
  await page.waitForSelector('dialog.help[open]');
  await shot(page, '01-help');
  await page.click('dialog.help button');
  await shot(page, '02-home');
  await noOverflow(page, 'home');

  // Daily: play two rounds, leave, resume, finish.
  await page.click('#daily-play');
  await page.waitForSelector('#lock');
  await shot(page, '03-round');
  await noOverflow(page, 'round');
  log('daily', await playRound(page, { hsb: [0, 80, 80] }));
  await shot(page, '04-reveal');
  await noOverflow(page, 'reveal');
  await page.click('#next');
  log('daily', await playRound(page));
  await page.click('#quit');
  check(/flag 3 of 5/.test(await page.textContent('.daily')), 'daily progress kept');
  await page.click('#daily-play');
  for (let i = 0; i < 3; i++) {
    log('daily', await playRound(page, { hsb: [i * 100, 50, 90] }));
    await page.click('#next');
  }
  await page.waitForSelector('.end');
  await shot(page, '05-daily-end');
  await noOverflow(page, 'end');
  check(/Daily #\d+ complete/.test(await page.textContent('h1')), 'daily end title');
  await page.click('#home');
  await page.waitForSelector('#daily-review');
  await shot(page, '06-home-after-daily');

  // Classic on Hard.
  await page.click('[data-value=hard]');
  await page.click('#start');
  for (let i = 0; i < 5; i++) {
    log('classic', await playRound(page, { hsb: [i * 70, 70, 60] }));
    const dots = await page.$$eval('.dots li[data-grade]', (els) => els.length);
    check(dots === i + 1, `classic dots after round ${i + 1}: ${dots}`);
    await page.click('#next');
  }
  await page.waitForSelector('.end');
  check((await page.$$('.results li')).length === 5, 'classic lists 5 flags');
  await shot(page, '07-classic-end');

  // Endless on Impossible: black loses hearts on almost every flag.
  await page.click('#home');
  await page.click('[data-value=endless]');
  await page.click('[data-value=impossible]');
  await page.click('#start');
  let rounds = 0;
  while (!(await page.$('.end')) && rounds < 40) {
    log('endless', await playRound(page, { hsb: [0, 0, 0] }));
    if (rounds === 0) {
      await headerFits(page, 'endless');
      await shot(page, '08-endless-reveal');
    }
    rounds++;
    await page.click('#next');
    await page.waitForSelector('#lock, .end');
  }
  check(/Out of hearts/.test(await page.textContent('h1')), 'endless ends');
  await shot(page, '09-endless-end');

  await page.click('#home');
  await page.waitForSelector('.stats');
  await shot(page, '10-home-stats');

  // ---------- Small phone ----------
  const small = await newPage({ width: 320, height: 568 });
  await small.goto(`${url}/`);
  await shot(small, '11-small-help');
  await small.click('dialog.help button');
  await noOverflow(small, 'small home');
  await small.click('[data-value=endless]');
  await small.click('[data-value=impossible]');
  await small.click('#start');
  await small.waitForSelector('#lock');
  await noOverflow(small, 'small round');
  await headerFits(small, 'small endless');
  await shot(small, '12-small-round');
  await playRound(small);
  await noOverflow(small, 'small reveal');
  await shot(small, '13-small-reveal');

  // ---------- Desktop ----------
  const desk = await newPage({ width: 1280, height: 800 });
  await desk.goto(`${url}/`);
  await desk.click('dialog.help button');
  await desk.click('#start');
  await desk.waitForSelector('#lock');
  await shot(desk, '14-desktop-round');
  await desk.keyboard.press('Enter');
  await desk.waitForSelector('#next');
  await shot(desk, '15-desktop-reveal');

  // ---------- Perfect rounds, compare and share ----------
  // Serve flag data where every flag can hide only its first color, so the test
  // knows the answer and can set the sliders to it.
  const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.route('**/js/flagData.js', async (route) => {
    const body = await (await route.fetch()).text();
    await route.fulfill({
      contentType: 'text/javascript',
      body: body + '\nfor (const d of Object.values(FLAG_DATA)) d.colors.length = 1;\n',
    });
  });
  const pp = await ctx.newPage();
  pp.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  pp.on('pageerror', (e) => errors.push(e.message));
  await pp.goto(`${url}/`);
  await pp.click('dialog.help button');
  await pp.click('[data-value=endless]');
  await pp.click('[data-value=easy]');
  await pp.click('#start');
  const answer = () => pp.evaluate(async () => {
    const { FLAGS } = await import('/js/flags.js');
    const { FLAG_DATA } = await import('/js/flagData.js');
    const { hexToHsb } = await import('/js/colors.js');
    const name = document.querySelector('.country').textContent;
    const { h, s, v } = hexToHsb(FLAG_DATA[FLAGS.find((f) => f.name === name).code].colors[0].hex);
    return [Math.round(h), Math.round(s * 100), Math.round(v * 100)];
  });
  await pp.waitForSelector('#lock');
  // Pick the opposite of the answer to lose a heart.
  const [h0, , v0] = await answer();
  log('perfect', await playRound(pp, { hsb: [(h0 + 180) % 360, 100, v0 > 50 ? 0 : 100] }));
  check((await pp.$$('.hearts .lost')).length === 1, 'lost a heart');
  await pp.click('#next');
  await pp.waitForSelector('#lock');
  log('perfect', await playRound(pp, { hsb: await answer() }));
  check(/Perfect/.test(await pp.textContent('.grade-label')), 'perfect grade');
  check(/\+1 heart/.test(await pp.textContent('.verdict')), 'perfect wins a heart');
  check((await pp.$$('.hearts .lost')).length === 0, 'heart restored');
  await pp.waitForTimeout(150);
  await shot(pp, '16-perfect');

  // Hold to compare shows the guess, release shows the real flag again.
  const chip = await pp.$('#compare');
  const box = await chip.boundingBox();
  await pp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await pp.mouse.down();
  check(await pp.$eval('#compare', (el) => el.getAttribute('aria-pressed')) === 'true', 'compare pressed');
  check(await pp.$$eval('.flag-svg [style*="fill"]', (els) => els.length) > 0, 'guess painted while holding');
  await pp.mouse.up();
  check(await pp.$eval('#compare', (el) => el.getAttribute('aria-pressed')) === 'false', 'compare released');

  // Run out of hearts, then share.
  while (!(await pp.$('.end'))) {
    await pp.click('#next');
    await pp.waitForSelector('#lock');
    const [h, , v] = await answer();
    await playRound(pp, { hsb: [(h + 180) % 360, 100, v > 50 ? 0 : 100] });
    if (await pp.$('#next')) {
      const label = await pp.textContent('#next');
      if (/results/.test(label)) {
        await pp.click('#next');
        break;
      }
    }
  }
  await pp.waitForSelector('.end');
  await pp.click('#share');
  await pp.waitForSelector('.toast.show');
  const clip = await pp.evaluate(() => navigator.clipboard.readText());
  log('shared:', JSON.stringify(clip));
  check(/^GeoPaint Endless · Easy · 5 flags 🎨\n🟥🟪🟥🟥🟥\nhttp/.test(clip), 'share text');
  await ctx.close();

  check(errors.length === 0, `console errors:\n${errors.join('\n')}`);
  log('OK');
} catch (err) {
  console.error('FAILED:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
