[SPEC]
- **Objective**: Restyle the demand×scarcity scatter bubbles (`SkillMatrix.tsx`/`matrix.css`) with
  a "brushed-metal" gradient-banded fill (hard tonal break, not the current flat/color-mix fill)
  using `--metal-hi`/`--plot`/`--grid`, and give the plot area itself a glass backdrop
  (`--plot` token) with the new 15px card radius from spec 020.
- **Inputs/Outputs**: `SkillMatrix.tsx`'s per-bubble `background` computation changes from a
  solid/`color-mix` value to a CSS `linear-gradient` with hard percentage stops (banded, not a
  soft radial gloss) built from the same three tiers it already computes (have / gap / leverage-
  tier accent) — same tier-selection logic, only the resulting CSS value's shape changes.
  `matrix.css`'s `.matrix-plot`/`.matrix-point` gain the new token-based glass/metal treatment.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — presentation only. Confirmed by inspection: the corner flag badge
  (`.matrix-point-flag`, ✓/✕) and crowd-aware label hiding (`CROWD_DIST`/`crowded[]` in
  `SkillMatrix.tsx`) are **already implemented** — this task does not add either; it only changes
  the bubble fill's CSS shape and the plot's backdrop tokens. No change to `formatNum`, coordinate
  scaling (`scaleToPlot`), tier thresholds, or any value read from `RoleSkillRow`.
- **UI Scope**: cosmetic — no new elements, no change to which data renders where; only the
  `background` value's CSS shape (gradient vs solid) and surrounding plot/point CSS.
- **Intellectual Control**: Because the flag badge and crowd-aware labels were verified pre-
  existing before writing this SPEC, the task is deliberately narrowed to the bubble fill + plot
  backdrop only — avoids the common mistake of re-implementing already-correct a11y logic and
  introducing a regression.
- **Constraints**: The non-color-only encoding contract is NOT negotiable and must be re-verified,
  not assumed, after the gradient-banding change: position + size + the ✓/✕ glyph badge + the
  accessible `aria-label` + the full table alternative must still fully carry the have/gap/
  leverage-tier meaning without the gradient. Card radius: reuse spec 020's `--radius-card: 15px`
  on `.matrix-root`. Matrix cards remain otherwise "no card chrome of their own" per spec 017's
  original note — this task supersedes only the *fill/backdrop treatment*, not that ownership
  boundary (App.tsx's `.card.blueprint` wrapper still frames the section).
- **Edge Cases**: The gradient-banded fill must still read correctly at the smallest bubble size
  (`Math.max(20, ...)` px, per existing sizing) — a banded gradient can become muddy/illegible at
  very small sizes; verify visually and, if needed, simplify the band count at small sizes rather
  than let it degrade silently. `prefers-reduced-motion` handling for `.matrix-point`'s existing
  hover/focus scale transition is unchanged — do not add new unconditional motion. Dark-mode
  bubble contrast against the new `--plot` backdrop must be re-checked (composite-then-check) for
  the ✓/✕ flag badge's existing color pairs (`--status-good`/`--status-critical` on
  `--status-good-surface`/`--status-critical-surface`), since the surrounding backdrop is changing
  even though the flag's own token values are not.
- **Files** (3):
    - `frontend/src/components/matrix/SkillMatrix.tsx`
    - `frontend/src/components/matrix/matrix.css`
    - `frontend/src/components/matrix/SkillMatrix.test.tsx` (extend — assert non-color-only
      encoding channels (glyph, aria-label content, crowd-based label visibility) are unchanged
      by the fill restyle; assert no coordinate/tier/threshold logic changed)
- **Tipping Point**: If a future skill-density increase (many more rows per role) makes the plot
  too crowded for the current bubble-size formula regardless of fill style, that's a new SPEC
  (e.g. clustering/aggregation) — this task does not address bubble-count scaling.

[FORCES]
1. Verified-existing a11y channels preserved untouched > convenience of re-deriving them
2. Simplicity > Pattern purity
