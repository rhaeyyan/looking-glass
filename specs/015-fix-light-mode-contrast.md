[SPEC]
- **Objective**: Fix every light-mode text/background pair that fails WCAG 2.x 4.5:1 for normal
  text, using token-level fixes only (no per-instance color overrides), consistent with spec 008's
  single-source-of-truth pattern:
  1. Darken `--color-accent` (looking-glass.css, light `:root`) until it clears 4.5:1 against
     `--color-bg` — this simultaneously fixes `.card-kicker`, `.tag-outline` text, `<a>` links,
     `.btn-primary`'s label-on-background pairing, and the checked `.seg-opt` pairing, since all of
     them derive from this one token pair.
  2. Darken `--have-tone` (looking-glass.css, light `:root` only — NOT the dark override blocks)
     until it clears 4.5:1 against `--color-bg` (currently ~4.49:1).
  3. Remove the `opacity: 0.6` dimming on `.lg-donut-label` (looking-glass.css) — replace with a
     token-driven color (e.g. a `color-mix()` against `--color-text` tuned to clear 4.5:1, or the
     full-opacity `--color-text`) since opacity-based dimming is what causes the failure at 9px.
  4. Darken `--text-muted` (matrix.css, light rule only — the `.matrix-root, .ladder-root,
     .narration-root, .leverage-root` block, NOT the dark overrides) until it clears 4.5:1 against
     its actual rendering surfaces (`--page-plane`, `--surface-1`, and the plot background) — this
     token feeds `.matrix-axis-x`/`.matrix-axis-y`, `.matrix-zone-lo`, and `.lev-rank`.
  5. Repoint `.matrix-zone-hi`'s `color` from `var(--series-1)` to `var(--text-secondary)` (already
     passes ~7:1) — `--series-1` stays untouched as a data-identity hue for actual chart markers;
     only this one annotation label stops borrowing a categorical series color for text.
- **Inputs/Outputs**: No data/props/JSON shape changes — pure CSS custom-property value edits +
  one `color` reassignment on one existing selector. No new DOM elements, no new classes.
- **Design Pattern**: none — simple case (token value correction, no variance to encapsulate).
- **Bounded-AI boundary**: N/A — presentation tokens only; no score, gap, join, or narration logic
  touched.
- **UI Scope**: cosmetic (existing DOM/layout unchanged; only color token values + one color
  reassignment).
- **Intellectual Control**: Fixing at the token level (not per-instance) means every current and
  future consumer of `--color-accent`/`--have-tone`/`--text-muted` inherits the corrected contrast
  automatically — the same discipline spec 008 already established for have/learn tones. Consult
  the `dataviz` skill before reassigning `.matrix-zone-hi`'s color, since it's the one fix that
  touches a chart-semantic token rather than a plain text token — confirm reassigning it to
  `--text-secondary` doesn't blur its role as a non-data-identity orientation label.
- **Constraints**: Do not touch any dark-mode token value (`@media (prefers-color-scheme: dark)`
  blocks or `[data-theme='dark']` blocks in either file) — this is a light-mode-only fix. Do not
  touch `--learn-tone`, `--text-secondary`, `.lg-header p`'s opacity, or any other pair already
  confirmed passing (see spec notes) — do not "fix" what isn't broken. No new custom properties
  beyond what's strictly needed for the `.lg-donut-label` fix; prefer reusing existing tokens
  (`--color-text`) over inventing a new one if a plain reference clears the bar. Every changed
  value must be independently WCAG-computed (relative luminance formula) against its real
  rendering surface(s), not eyeballed.
- **Edge Cases**: `--color-accent`'s new value must also be re-verified against `--color-surface`
  (used for `.input` borders/backgrounds in the same viewport) to confirm no regression there.
  `--text-muted` must be re-verified against all three surfaces it actually renders over
  (`--page-plane`, `--surface-1`, plot background), not just one — a single-surface check would be
  insufficient given it's used in three different contexts.
- **Files** (3):
    - `frontend/src/styles/looking-glass.css`
    - `frontend/src/components/matrix/matrix.css`
    - `frontend/src/styles/colorTokens.test.ts` (extend with a shared WCAG contrast-ratio helper +
      the new assertions — Cypress writes this first)
- **Tipping Point**: If more than ~2 more light-mode pairs are ever found failing after this, stop
  patching hexes ad hoc and add a small `contrastRatio(fg, bg)` assertion pass over the *entire*
  token block (all pairs), not just the specific failures found this round.

[FORCES]
1. Correcting the shared token > patching each visual instance separately
2. Simplicity > Pattern purity
