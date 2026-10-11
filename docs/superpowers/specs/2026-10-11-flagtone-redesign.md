# Flagtone — Rename and Redesign

Date: 2026-10-11. Builds on `2026-10-09-geopaint-v2-design.md`; the game rules and
rating are unchanged.

## Name

GeoPaint is now **Flagtone**: flag + tone, as in color chips. The mark is a tricolor
whose third band is the whole spectrum, the band you mix.

- Saved progress moves from `geopaint:v2:*` to `flagtone:*`. On first load,
  `migrateStorage` copies any old keys over once, so bests, stats and the Daily
  streak survive the rename.
- The Daily seed string keeps the old name, so every date keeps its puzzle.

## Look

- **Themes:** neutral surfaces in light and dark, following the device. Flag colors
  are the only strong color on screen; buttons are ink (black in light, white in
  dark).
- **Type:** Inter with optical sizing, tight tracking on headings, and tabular
  figures for every number.
- **Sizes:**
  - buttons 48 px tall, or 52 px for primary actions, with 14 px corners;
  - icon buttons 40 px;
  - cards with 20 px corners and a 1 px border.
- **Controls:**
  - mode and difficulty are segmented controls;
  - sliders have 26 px gradient tracks and round thumbs filled with the color they
    produce;
  - progress dots stretch into a pill for the current flag.
- **Home:** a Daily card with five flag slots (difficulty bars, then each round's
  match), a Free play card, and a lifetime stats strip. On wide screens the two
  cards sit side by side.
- **Round:** an eyebrow (tier and flag number), the country, then the flag. On wide
  screens the controls and the result sit in a card to the right of the flag.
- **Reveal:**
  - the big match number with its grade and a meter;
  - the hint, "Yours" and "Flag" swatches with hex codes;
  - the hue, saturation and brightness comparison bars.
- **End:** the big score, the grade, a new-best badge or the streak, then the flags
  in one card, then Share, Play again and Home.

## Publishing

- MIT license.
- `.nojekyll` and relative paths, so GitHub Pages can serve the repository root as is.
- `manifest.webmanifest` and PNG icons, so the game can be added to a home screen.
- `docs/social-card.png` for the repository's social preview.
- A GitHub Actions workflow runs the unit tests and the headless playthrough on
  every pull request.
- `dev/make-images.mjs` redraws the icons and the card.
