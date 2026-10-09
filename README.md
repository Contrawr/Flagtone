# GeoPaint

A flag is missing one color. Mix it back in with hue, saturation and brightness
sliders, and see how close you got.

- **Daily**: five flags, the same for everyone each day. Progress is saved, and
  finished days build a streak.
- **Classic**: five flags from one difficulty; your score is the average match.
- **Endless**: three hearts. A round under 70% costs a heart; a Perfect wins one back.

Difficulty (Easy, Medium, Hard, Impossible) only changes which flags can appear,
from household names to Pacific island states.

## Rating

Each guess is compared with the real color by perceptual distance (CIEDE2000) and
shown as a match percentage:

| Grade | Match | Means |
|---|---|---|
| Perfect | 95%+ | Practically identical |
| Great | 85%+ | Hard to tell apart |
| Good | 70%+ | Close at a glance |
| Close | 50%+ | Right idea, visibly off |
| Off | under 50% | A different color |

After each flag, a short hint says what was off ("A bit too dark and slightly too
orange."), and three bars mark where your hue, saturation and brightness were
compared with the real color.

## Flags

All 197 sovereign states, bundled in [`flags/`](flags/README.md) at their official
proportions and colors (from Wikimedia Commons via
[hampusborgos/country-flags](https://github.com/hampusborgos/country-flags)). They're
served with the game, so it relies on no third-party service apart from the web font.

## Run it

It's a static site with no build step. ES modules need HTTP, so serve the folder:

```sh
npm start              # http://127.0.0.1:8123/
```

(`python3 -m http.server` works too.)

## Develop

```sh
npm test               # unit tests (Node's built-in runner)
npm run test:browser   # plays every mode in headless Chromium (needs Playwright)
npm run flags:data     # re-analyzes the flags into js/flagData.js (needs Playwright)
```

`dev/check-flags.html` shows every flag with the colors the game may hide; add
`?audit` to also verify that hiding a color leaves no trace of it.

| File | What it does |
|---|---|
| `js/ui.js` | Screens and event wiring |
| `js/game.js` | Rules for one play-through (no DOM, no storage) |
| `js/rating.js` | Match %, grades and the "what was off" hint |
| `js/colors.js` | HSB/RGB/hex, CIELAB and CIEDE2000 |
| `js/records.js` | Best scores, stats and Daily progress in `localStorage` |
| `js/daily.js` | Date keys and the seeded Daily selection |
| `js/share.js` | Spoiler-free result text |
| `js/flagLoader.js` | Loads a flag SVG and repaints its hidden color |
| `js/flags.js` | Countries and difficulty tiers |
| `js/flagData.js` | Generated: each flag's ratio and hideable colors |
| `js/flagAnalysis.js` | Dev only: finds hideable colors by rasterizing a flag |
