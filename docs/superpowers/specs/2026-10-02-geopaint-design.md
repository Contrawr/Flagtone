# GeoPaint — Design Spec

Date: 2026-10-02

## Summary

A browser game. The player sees a country's flag with one of its colors hidden and recreates that color with hue, saturation and brightness sliders. Each attempt is scored 0–10 by perceptual color distance.

## Platform

- Static web app: `index.html`, `style.css`, and plain ES modules. No build step, no framework, no backend.
- Served over HTTP (ES modules don't load from `file://`). For local dev, use `npx serve` or `python3 -m http.server`.
- Flags load at runtime from `https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/{code}.svg` (version pinned, 640×480 viewBox, lowercase ISO 3166-1 alpha-2 codes).

## Modes

### Standard
- 5 flags drawn from the chosen difficulty pool, with no repeats in one game.
- Each flag is scored 0–10. The end screen lists all 5 flags with your color, the true color and the score, plus a total out of 50.
- The best total per difficulty is saved in `localStorage`.

### Infinite
- Flags keep coming from the chosen pool. The pool is shuffled and reshuffled when it runs out, and a flag never repeats back to back.
- The player starts with 3 lives. A score below 7.0 costs a life, and the run ends at 0 lives.
- The streak counts every flag completed. The best streak per difficulty is saved in `localStorage`.

## Difficulty

Difficulty changes only which flags can appear. Each flag belongs to exactly one tier, and the pools don't overlap.

| Tier | Size | Content |
|---|---|---|
| Easy | ~40 | Very well-known flags (fr, jp, de, it, br, us, gb, ca, …) |
| Medium | ~60 | Remaining Europe, the Americas, major Asian countries |
| Hard | ~70 | Most of Africa, Central and Southeast Asia, the Middle East |
| Impossible | the rest | Small island states, Pacific nations, Bhutan, and so on. Sovereign states only, no territories. |

## Screens

1. **Home:** title, mode selector (Standard / Infinite), difficulty selector (4 pills), Start button. Best scores are shown under the selectors.
2. **Round** (layout follows the reference screenshot):
   - Header: GeoPaint logo and title. In Standard it also shows the round (e.g. "2 / 5"); in Infinite it shows hearts and the streak.
   - The country name, large.
   - The flag, with every element whose fill is the hidden color drawn in the current slider color, updating live.
   - Three pill-shaped sliders:
     - Hue: a rainbow gradient.
     - Saturation: gray to the full color at the current hue and brightness.
     - Brightness: black to the color at the current hue and saturation.
     - The saturation and brightness gradients redraw as the other sliders move.
   - A **Lock Color ✓** button.
   - Sliders start at a random hue, 50% saturation and 50% brightness.
3. **Reveal:** shown inline after locking.
   - The flag returns to its true colors.
   - Two swatches, "Yours" and "Actual", with their hex values.
   - The score, large, e.g. "8.4 / 10".
   - In Infinite, a lost life is announced.
   - A **Next** button.
4. **End:**
   - Standard: summary table and total out of 50.
   - Infinite: final streak and best streak.
   - Both: **Play again** and **Home** buttons.

Visual style: a warm off-white background, rounded chunky controls, and a yellow primary button, as in the reference screenshot. The layout works on phone widths: 16px side gutter, max content width ~520px, and sliders usable by touch. Light theme only.

## Scoring

- Convert both colors sRGB → CIELAB (D65) and compute **CIEDE2000** ΔE.
- `score = clamp(10 − ΔE / 4, 0, 10)`, rounded to 1 decimal.
- Reference points: ΔE 2 → 9.5, ΔE 12 → 7.0 (the Infinite life threshold), ΔE ≥ 40 → 0.

## Choosing the hidden color

`flagLoader.js` does this for each flag:

1. Fetch the SVG text (aborting after 8 s) and parse it with `DOMParser`.
2. Collect the fill and stroke colors of every element (some flags draw regions as strokes):
   - from the `fill`/`stroke` attributes or `style="fill:…"` / `style="stroke:…"`;
   - normalized to lowercase 6-digit hex (`#fff` → `#ffffff`, named colors via a small lookup);
   - skipping `none`, `url(...)` and `currentColor`.
3. Render the SVG to an offscreen 160×120 canvas and count pixels per fill color. A pixel counts toward a color if it lies within RGB distance 12 of it, which ignores anti-aliased edges.
4. Candidates are fill or stroke colors that cover ≥ 8% of the pixels. Pick one at random.
5. If no color qualifies, or the fetch or parse fails, discard the flag and draw another. After 5 failures in a row, show an error with a Retry button.

Recoloring:
- The round renders the parsed SVG inline.
- Every element whose normalized fill equals the hidden color, and every element whose normalized stroke equals it, is remembered along with its original inline value.
- On slider input, those elements get their `fill` (or `stroke`) set to the current color; the reveal restores the originals.
- Emblem details that share the hidden color are recolored too, which is intended: the player is matching that color.

Flags are prefetched one round ahead so the next flag shows instantly.

## Modules

| File | Responsibility | Depends on |
|---|---|---|
| `js/colors.js` | Pure functions: `hsbToRgb`, `rgbToHex`, `hexToRgb`, `rgbToLab`, `deltaE2000`, `scoreFromDeltaE`, `normalizeColor` | nothing |
| `js/flags.js` | `FLAGS` array of `{ code, name, tier }`, plus `poolFor(tier)` | nothing |
| `js/flagLoader.js` | `loadFlag(code) → { svgElement, hiddenHex, setGuess(hex) }`, plus prefetch cache | `colors.js` |
| `js/game.js` | State machine (home → round → reveal → end). Holds mode, tier, lives, streak, round results, persistence. No DOM access. | `colors.js`, `flags.js` |
| `js/ui.js` | DOM rendering and event wiring for each screen; calls into `game.js` and `flagLoader.js` | all of the above |
| `js/main.js` | Entry point; boots `ui.js` | `ui.js` |

`game.js` exposes plain methods (`start(mode, tier)`, `nextFlagCode()`, `submit(guessHex, trueHex) → result`, `isOver()`, `summary()`), so it can be tested without a browser.

## Testing

- `colors.js`: unit tests via `node --test`.
  - Known HSB→RGB values.
  - The CIEDE2000 reference pairs from Sharma et al. (2005), to 4 decimals.
  - Score mapping endpoints.
  - `normalizeColor` cases.
- `game.js`: unit tests via `node --test`.
  - Standard ends after exactly 5 rounds with no repeats.
  - Infinite loses a life below 7.0 and not at exactly 7.0.
  - Game over at 0 lives.
  - Best scores persist (with a stub storage object).
- `flags.js`: a test that every code is unique, every tier is non-empty, and every name is set.
- `flagLoader.js` and `ui.js`: manual check in the in-app browser. Play one Standard game per tier and one Infinite run to game over, and check the phone width layout.

## Out of scope

Daily challenge, the stats and archive screens from the screenshot, accounts and leaderboards, sound, dark mode, timers, and offline flag bundling.
