[SPEC]
- **Objective**: Overhaul `looking-glass.css`'s token layer to the new glass design-language:
  replace/extend `--color-text` with an `--ink`/`--ink-2`/`--ink-3` text hierarchy, add
  `--accent`/`--accent-soft`/`--series`, `--have`/`--have-soft`/`--learn`/`--learn-soft` (the
  same "already have" vs "worth learning" semantics as today's `--have-tone`/`--learn-tone` +
  surfaces, renamed), `--glass`/`--glass-2` (two translucency levels, replacing spec 017's single
  `--glass-tint`/`--glass-alpha`/`--glass-blur`), `--brd`/`--brd-2`, `--hi`, `--shadow`/
  `--shadow-lg`, `--plot`, `--grid`, `--page`, `--on-accent`, `--chip-bg`/`--chip-fg`,
  `--edge`/`--edge-b`, `--sheen-a`/`--sheen-b`, `--metal-hi`. **Both** light and dark
  `:root`/`[data-theme]` blocks get real (non-inert) values for all of these — this supersedes
  spec 017's dark-mode-inert constraint (`--glass-alpha: 0; --glass-blur: 0;`), per explicit human
  approval. Also lands: the page background (`--page`), and two fixed decorative radial-gradient
  "orbs" with slow drift+scale animation, plus the base `body`/`h1`/`h2` rules repointed at the
  new `--ink*` tokens.
- **Inputs/Outputs**: New CSS custom properties only (values given in the design spec — exact
  light/dark hex/rgba listed below); no component markup, no prop/data shape changes. Orbs are
  implemented as `body::before`/`body::after` (or a single fixed decorative container) — pure CSS,
  not new DOM elements, so they carry zero accessibility-tree footprint and need no `aria-hidden`.
- **Design Pattern**: none — simple case (token substitution + two decorative pseudo-elements).
- **Bounded-AI boundary**: N/A — presentation only. No file under `frontend/src/lib/*` is touched;
  no scoring/gap/join logic changes. Cypress should verify this by diff (no `lib/` file appears
  in the changeset).
- **UI Scope**: cosmetic — token/background changes only, zero DOM restructuring, zero new
  interactive elements.
- **Intellectual Control**: This is the one SPEC every other glass-redesign task depends on, so it
  is scoped to *tokens + orbs + page background only* — no component consumes the new tokens yet
  (that's specs 019-022), which keeps this task reviewable as a pure data/value change. Backward
  compatibility is handled deliberately, not accidentally: `--have-tone`/`--learn-tone`/
  `--have-tone-surface`/`--learn-tone-surface` (consumed today by `App.tsx` inline styles and by
  `matrix.css`'s `--status-good`/`--status-critical` mapping) are kept as **aliases** —
  `--have-tone: var(--have); --learn-tone: var(--learn);` etc. — rather than deleted, so this task
  does not force a simultaneous edit of every consumer file. Radii are deliberately NOT touched
  here: the design uses per-component values (13px sidebar cards, 15px scorecard/matrix/table),
  not one uniform token, so `--radius-md` stays at its current `4px` as the generic
  button/input/tag radius; each of specs 019-022 introduces its own card-specific radius token
  explicitly, so the 4px→13px/15px change is visible in the diff of the SPEC that actually uses it,
  never a silent global flip here.
- **Constraints**: Scope to `looking-glass.css` only — do not touch `matrix.css` (which still reads
  `--have-tone`/`--learn-tone` via the alias) or any component file. Orb animation
  (`translate3d`/`scale`, 26s/34s alternating direction) must be gated behind
  `@media (prefers-reduced-motion: no-preference)`, per the existing `.lg-fade`/
  `.lg-skeleton-shimmer` convention — the no-preference fallback state is simply the orbs static
  (or not rendered), never a broken/jumping layout. Confirm (do not silently assume) the existing
  `@import` font-weight set (Poppins 400/500/600/700, Inter 300-700, JetBrains Mono 400/500/600)
  already covers every weight the new design uses — no import change is expected but must be
  verified, not skipped. Light-theme token values (exact): `--ink:#16202b; --ink-2:#4a5765;
  --ink-3:#6b7784; --accent:#2f5a86; --accent-soft:#416180; --series:#2a78d6;
  --have:#1a7a4b; --have-soft:rgba(26,122,75,0.14); --learn:#8a3b12;
  --learn-soft:rgba(138,59,18,0.14); --glass:rgba(255,255,255,0.55);
  --glass-2:rgba(255,255,255,0.72); --brd:rgba(255,255,255,0.8); --brd-2:rgba(22,32,43,0.09);
  --hi:rgba(255,255,255,0.9); --shadow:0 10px 34px rgba(21,38,58,0.13);
  --shadow-lg:0 22px 60px rgba(21,38,58,0.18); --plot:rgba(255,255,255,0.62);
  --grid:rgba(22,32,43,0.08); --page:#eef1f6; --on-accent:#ffffff;
  --chip-bg:rgba(47,90,134,0.10); --chip-fg:#2f5a86; --edge:rgba(255,255,255,0.95);
  --edge-b:rgba(22,32,43,0.12); --sheen-a:rgba(255,255,255,0.5); --sheen-b:rgba(255,255,255,0.14);
  --metal-hi:rgba(255,255,255,0.55)`. Dark-theme token values (exact): `--ink:#eef1f4;
  --ink-2:#aeb8c4; --ink-3:#8b96a3; --accent:#8fbcea; --accent-soft:#7fb0e0; --series:#5c9dea;
  --have:#63d69a; --have-soft:rgba(99,214,154,0.16); --learn:#e8a37e;
  --learn-soft:rgba(232,163,126,0.16); --glass:rgba(126,152,184,0.187);
  --glass-2:rgba(126,152,184,0.22); --brd:rgba(255,255,255,0.16); --brd-2:rgba(255,255,255,0.1);
  --hi:rgba(255,255,255,0.34); --shadow:0 12px 38px rgba(0,0,0,0.4);
  --shadow-lg:0 26px 70px rgba(0,0,0,0.5); --plot:rgba(16,22,30,0.42);
  --grid:rgba(255,255,255,0.07); --page:#0e141b; --on-accent:#ffffff;
  --chip-bg:rgba(143,188,234,0.16); --chip-fg:#cfe4fb; --edge:rgba(255,255,255,0.34);
  --edge-b:rgba(0,0,0,0.45); --sheen-a:rgba(255,255,255,0.16); --sheen-b:rgba(255,255,255,0.04);
  --metal-hi:rgba(255,255,255,0.22)`.
- **Edge Cases**: `--glass`/`--glass-2` in dark mode composite over `--page:#0e141b` (a much
  darker backdrop than light mode's `#eef1f6`) — do not assume the light-mode contrast-check
  methodology's PASS result carries over; every `--ink*` text token must be freshly checked
  against `--glass`/`--glass-2` alpha-composited over `--page` (and any other real dark-mode
  backdrop still in play) via `contrastRatio`. Body background must switch from the flat
  `--color-bg`/`--page` to actually show the orbs behind it (orbs must not be fully occluded by an
  opaque body background) while the page itself must still be indistinguishable in overall
  lightness/darkness from before at a glance (orbs are a subtle accent, not a wash).
- **Files** (2):
    - `frontend/src/styles/looking-glass.css`
    - `frontend/src/styles/glass-v2-tokens.test.ts` (new — extends `colorTokens.test.ts`'s
      exported `contrastRatio`/`hexToRgb`/`resolveToHex`; asserts every new light+dark token value
      matches the exact spec above, asserts the `--have-tone`/`--learn-tone` aliases resolve to
      the new `--have`/`--learn` values, asserts `--glass`/`--glass-2` composited over every real
      backdrop token clears AA for every `--ink*` token in BOTH themes, and asserts the orb
      animation is absent/static under `prefers-reduced-motion: reduce`)
- **Tipping Point**: Once every consumer (specs 019-022) has migrated off `--have-tone`/
  `--learn-tone` onto `--have`/`--learn` directly, the aliases become dead weight — a Banyan
  cleanup pass should remove them at that point, not before (removing them now would break
  `matrix.css` and `App.tsx` inline styles this task deliberately does not touch).

[FORCES]
1. Deterministic, testable contrast guarantee (composite-then-check) > visual-judgment-call glass tuning
2. Minimal-footprint alias compatibility > forcing a simultaneous full-codebase token rename
3. Simplicity > Pattern purity
