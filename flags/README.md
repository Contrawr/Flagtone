# Flags

One SVG per sovereign state in `js/flags.js`, named by lowercase ISO 3166-1
alpha-2 code (`xk` for Kosovo).

## Source

Copied from [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags)
at commit `c09927e63705529bbf59ca6684cd9b23225dddad` (2026-03-10). That collection is
drawn from Wikimedia Commons and corrected against each country's flag legislation,
so every flag keeps its **official proportions** (e.g. Switzerland 1:1, Qatar 11:28,
United States 10:19, Nepal's double pennant) and its **official colors**.
Flags are in the public domain.

## Normalization

`dev/vendor-flags.mjs` copies the files and rewrites colors only, so the game can
find and repaint them:

- `<style>` class rules are inlined as presentation attributes (Zimbabwe, Kiribati).
- Named and 3-digit hex colors become lowercase `#rrggbb`.

Shapes, proportions and color values are unchanged. `dev/check-flags.html?audit`
verifies that the prepared SVG renders identically to the file.

## Updating

```sh
git clone https://github.com/hampusborgos/country-flags /tmp/country-flags
node dev/vendor-flags.mjs /tmp/country-flags
node dev/build-flag-data.mjs   # regenerates js/flagData.js (needs Playwright)
npm test
```
