[SPEC]
- **Objective**: Introduce glassmorphism visual accents (translucent, blurred surface treatment)
  on `.card.blueprint` and `.nav` chrome only, in light mode only, layered onto the existing
  "blueprint" technical aesthetic (corner brackets, hairline borders) rather than replacing it.
  Exact rule being applied: **no text ever renders directly on a raw `rgba()` translucent surface
  without a computed contrast check against every real "behind" color it could sit over in this
  app** (`--color-bg`, `--color-surface`, `--color-neutral-100` — the only backdrops that exist
  here; no photographic/video backdrops in this app, so the worst case is fully enumerable). No new
  inner opaque wrapper `<div>` — this is a deliberate simplicity choice over the alternative
  "text on an inner opaque layer" pattern, justified below.
- **Inputs/Outputs**: New CSS custom properties for the glass treatment (e.g. `--glass-tint`,
  `--glass-alpha`, `--glass-blur`), a `backdrop-filter: blur(...)` + translucent `background` added
  to `.card.blueprint` and `.nav`, defined only in the light `:root` token block. No prop/data shape
  changes.
- **Design Pattern**: none — simple case (a stylistic surface treatment, not an algorithmic
  variance to encapsulate).
- **Bounded-AI boundary**: N/A — presentation only.
- **UI Scope**: cosmetic (styling/chrome on the existing `.card.blueprint`/`.nav` DOM — no new
  elements, no layout restructuring).
- **Intellectual Control**: Because every backdrop in this app is a flat token color (not an image),
  "will text stay readable under a translucent card" is a deterministic, computable question, not a
  visual judgment call — so it's specified as a Cypress-testable computation (alpha-composite the
  glass tint over each candidate backdrop, then WCAG-contrast-check every text token that renders
  inside `.card.blueprint`/`.nav` against the composited result), reusing spec 015's contrast-ratio
  helper. This is why no inner opaque wrapper is needed: the composited-surface approach gives the
  same guarantee with zero DOM change, which is simpler and has nothing new to keep in sync.
  Consult the `dataviz` skill to confirm the glass treatment doesn't extend into matrix.css's own
  surfaces — `.matrix-root`/`.ladder-root`/`.narration-root`/`.leverage-root` explicitly have "no
  card chrome of their own" (existing comment) and their inner surfaces (`--surface-1`, sticky
  column backgrounds, point rings) must stay fully opaque hex, unmodified, so the scatter/table's
  have/gap color-coding is never read against a blurred/translucent background.
- **Constraints**: Scope to `looking-glass.css` only — do not touch `matrix.css`. Do not add or
  change any `[data-theme='dark']` or `@media (prefers-color-scheme: dark)` value — dark mode must
  render pixel/behavior-identical to today; if the glass tokens need a dark-mode value to avoid an
  accidental cascade change, set it to fully opaque/no-blur (reproducing today's exact look), and
  add a regression test proving it. Any transition/blur-in motion introduced must be gated behind
  `prefers-reduced-motion: no-preference`, per existing codebase convention (`.lg-fade`,
  `.lg-skeleton-shimmer`). Must build on spec 015's corrected `--color-accent`/`--have-tone` values
  — do not compute the worst-case contrast check against the pre-fix (failing) hex values.
- **Edge Cases**: The nav's theme-toggle `.seg` control and any `:focus-visible` outline must remain
  legible against the new translucent nav background (outline color is non-text, 3:1 minimum, but
  verify it isn't now sitting on a busier/blurred background that visually competes with it).
  Buttons (`.btn`, `.btn-primary`) inside a glass card must still individually meet contrast — if
  `.btn-primary`'s own opaque background (fixed post-spec-015) sits inside a translucent card, that's
  fine (button has its own solid background), but plain `.btn` (transparent background, text-only)
  inside the glass card needs the same composited-surface check as any other text.
- **Files** (2):
    - `frontend/src/styles/looking-glass.css`
    - a Cypress-authored contrast test file (extend spec 015's test file, reusing its
      `contrastRatio` helper, rather than duplicating it) asserting the composited-surface
      contrast for every enumerable backdrop × every text token used inside `.card.blueprint`/
      `.nav`, plus a dark-mode regression assertion (byte-identical or computed-identical
      background/text behavior pre- and post-change)
- **Tipping Point**: If a future feature needs glass treatment over a non-flat-token backdrop (a
  photo, a video, user-uploaded imagery), this deterministic enumerable-backdrop approach breaks
  down — that would require the inner-opaque-layer pattern (or a real-time contrast sampler) and a
  new SPEC; do not stretch this token-math approach to cover that case.

[FORCES]
1. Deterministic, testable contrast guarantee > visual-judgment-call glass tuning
2. Simplicity (no new DOM wrapper) > structural purity of an inner-opaque-layer pattern
3. Simplicity > Pattern purity
