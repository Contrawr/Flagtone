# GeoPaint v2 — Design Spec

Date: 2026-10-09. Supersedes the parts of `2026-10-02-geopaint-design.md` listed
below; everything else there still holds.

## Goals

1. Flags at their **official proportions, colors and design**.
2. A **rating players understand** at a glance, and that teaches them what was off.
3. More reasons to come back, and a more polished design. The concept stays:
   one color of a flag is missing; mix it back in with hue, saturation and
   brightness sliders.

## Flags

- Source: [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags)
  at commit `c09927e` (Wikimedia Commons, corrected against flag legislation).
  flag-icons cropped every flag to 4:3 and approximated many colors.
- Vendored into `flags/{code}.svg` by `dev/vendor-flags.mjs`, which only inlines
  `<style>` class rules and expands named and short-hex colors. No CDN dependency.
- Hideable colors are precomputed into `js/flagData.js` by `dev/build-flag-data.mjs`,
  which runs `dev/check-flags.html` in headless Chromium:
  - The flag is rasterized at its true ratio (320 px on the long side).
  - Palette colors are clustered: shades within ΔE2000 3 of each other are one
    color, hidden together.
  - Clusters covering at least 8% of the opaque pixels can be hidden.
  - Precomputing makes every browser hide from the same list, which the Daily needs.
- The audit fails the build if preparing an SVG changes its render, or if hiding a
  color leaves more than 0.2% of the flag in that color.
- Prepared SVGs get per-flag id prefixes. Inline SVGs share the page's id
  namespace, and `<use href="#a">` would otherwise draw another flag's shapes.
- Recoloring covers fills, strokes and gradient `stop-color`s. A hidden black also
  repaints shapes that are black only by default, via an explicit root fill.

## Rating

- `match% = round(100 · exp(−(ΔE / 24)^1.5))`, where ΔE is CIEDE2000.
  - It is forgiving where differences are hard to see: ΔE 1 → 99%, ΔE 2 → 98%.
  - It is steep in the middle: ΔE 10 → 76%, ΔE 20 → 47%, ΔE 50 → 5%.
- Grades:

  | Grade | Match | Means |
  |---|---|---|
  | Perfect | 95+ | ΔE ≤ 3.3 |
  | Great | 85+ | |
  | Good | 70+ | ΔE ≈ 12 (the old Infinite threshold) |
  | Close | 50+ | |
  | Off | under 50 | |

  Each grade has a color and a share emoji: 🟪 🟩 🟨 🟧 🟥.
- Hint: the weighted CIEDE2000 lightness, chroma and hue terms are compared, and
  up to two terms that matter are named. Examples:
  - "A bit too dark and slightly too orange."
  - Wording for lightness: too light / too dark.
  - Wording for chroma: too vivid / too dull. When the target is white, black or
    gray, it says "too colorful" instead.
  - Wording for hue: the family the guess drifted toward (red, orange, yellow,
    green, teal, blue, purple, pink).
- The reveal also shows hue, saturation and brightness bars. Each marks your value
  and the real color's value. A hue or saturation that doesn't matter (white,
  black) is labeled "any works".

## Modes

| Mode | Flags | Score | Saved |
|---|---|---|---|
| Daily | 5 per date: easy, medium, medium, hard, impossible | Average match % | Progress per round; streak |
| Classic | 5 from the chosen tier, no repeats | Average match % | Best per tier |
| Endless | Chosen tier, reshuffled, no back-to-back repeats | Flags painted | Best per tier |

- Endless: under 70% costs a heart, and a Perfect wins a lost heart back (at most 3).
- Daily:
  - Flags, hidden colors and starting hues come from a mulberry32 generator
    seeded by FNV-1a of the date.
  - A Daily can't be replayed. A Daily left part-way resumes at the next flag, and
    a failed load retries the same flag.
- Storage keys move to `geopaint:v2:*`, since the old 0–50 bests aren't
  comparable. All storage access is guarded.

## Screens

- **Home:**
  - Daily card: play, continue, or the result with Share/Review, a streak and a
    countdown.
  - Free play: mode, difficulty, best score and Play.
  - Lifetime stats: flags painted, average match, perfects.
- **Round:**
  - Top bar: back, mode, and progress dots colored by grade (hearts and a count in
    Endless).
  - The country name, then the flag at its true ratio, in a fixed-height stage so
    the layout doesn't jump.
  - The hidden area flashes briefly.
  - Labeled sliders, then Lock color.
- **Reveal:**
  - The flag animates to its real colors, with "Hold to see yours" to compare.
  - A result card: match ring, grade, hint, heart change, a split You/Real swatch,
    and the comparison bars.
- **End:**
  - Score ring (or flag count), new-best badge or streak, and grade squares.
  - Per-flag rows: thumbnail, your color, the real color, and the match.
  - Share, Play again (not for the Daily), and Home.
- **How to play:** a dialog shown on the first visit and from the ? button.
- Keyboard: Enter locks and advances; arrow keys fine-tune the focused slider.
- Reduced motion turns animations off.

## Testing

- Unit tests (`npm test`):
  - colors and rating;
  - game rules for all modes;
  - Daily seeding;
  - records and storage failure;
  - share text;
  - flag-analysis helpers;
  - bundled-flag checks: one SVG per country, only hex colors, nothing executable,
    data ratio equal to the viewBox, and official ratios for well-known flags.
- `npm run test:browser` plays every mode in headless Chromium at 320, 375 and
  1280 px. It fails on console errors, horizontal overflow, overlapping header
  parts or a broken flow. It also forces a Perfect to check the heart regain,
  hold-to-compare and the copied share text.
