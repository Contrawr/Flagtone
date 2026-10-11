// Renders the app icons (icons/*.png) and the social preview card
// (docs/social-card.png) in headless Chromium, from icon.svg and a real
// screenshot of a round.
//
// Needs Playwright (npm i -g playwright). Usage: node dev/make-images.mjs
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { serve } from './serve.mjs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs'));
  }
}

const root = new URL('..', import.meta.url);
const out = (path) => new URL(path, root).pathname;
const mark = readFileSync(new URL('icon.svg', root), 'utf8');
// The favicon's outline keeps it visible on white tabs; large icons need less.
const iconMark = mark.replace('stroke-opacity=".2"', 'stroke-opacity=".12" stroke-width=".5"');
mkdirSync(out('icons'), { recursive: true });

const { chromium } = await loadPlaywright();
const { server, url } = await serve();
const browser = await chromium.launch();

// Icons: the mark on a light tile. `inset` is the share of the tile the mark fills.
async function icon(size, path, { inset = 0.78, radius = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#f5f5f7;border-radius:${radius}px">
      <div style="width:${size * inset}px;height:${size * inset}px">${iconMark.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </div></body>`);
  await page.screenshot({ path: out(path), omitBackground: radius > 0 });
  await page.close();
}

try {
  await icon(192, 'icons/icon-192.png');
  await icon(512, 'icons/icon-512.png');
  await icon(512, 'icons/icon-512-maskable.png', { inset: 0.6 });
  await icon(180, 'icons/apple-touch-icon.png');

  // A round in progress, with a fixed random seed so the image is reproducible.
  const game = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await game.addInitScript(() => {
    localStorage.setItem('flagtone:seenHelp', 'true');
    let a = 7;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await game.goto(`${url}/`);
  await game.click('#start');
  await game.waitForSelector('#lock');
  await game.waitForTimeout(2200); // let the hint blink finish
  const shot = (await game.screenshot()).toString('base64');
  await game.close();

  const card = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await card.goto(`${url}/dev/serve.mjs`); // any same-origin page, so the web font loads
  await card.setContent(`<!doctype html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap" rel="stylesheet">
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; }
      .card { width: 1280px; height: 640px; box-sizing: border-box; padding: 0 96px; display: grid;
        grid-template-columns: 1fr 340px; gap: 64px; align-items: center; overflow: hidden;
        background: radial-gradient(900px 500px at 85% 20%, #e9e9ff 0%, transparent 60%), #f5f5f7; color: #121216; }
      .brand { display: flex; align-items: center; gap: 16px; font-size: 40px; font-weight: 750; letter-spacing: -0.03em; }
      .brand svg { width: 64px; height: 64px; }
      h1 { margin: 40px 0 18px; font-size: 68px; line-height: 1.02; font-weight: 750; letter-spacing: -0.04em; }
      p { margin: 0; font-size: 26px; line-height: 1.4; color: #5c5c66; }
      .phone { width: 340px; margin-top: 140px; border-radius: 40px; overflow: hidden;
        box-shadow: 0 0 0 10px #121216, 0 30px 80px rgb(18 18 22 / 0.35); }
      .phone img { display: block; width: 100%; }
    </style></head><body>
    <div class="card">
      <div>
        <div class="brand">${mark}<span>Flagtone</span></div>
        <h1>Mix the missing<br>flag color.</h1>
        <p>Every flag is missing one color. Recreate it with hue, saturation and brightness. All 197 flags, daily puzzles.</p>
      </div>
      <div class="phone"><img src="data:image/png;base64,${shot}"></div>
    </div></body></html>`);
  await card.evaluate(() => document.fonts.ready);
  await card.screenshot({ path: out('docs/social-card.png') });
  console.log('Wrote icons/*.png and docs/social-card.png');
} finally {
  await browser.close();
  server.close();
}
