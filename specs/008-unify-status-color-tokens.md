[SPEC]
- **Objective**: Eliminate the cross-component color-semantic mismatch where "already have" /
  "worth learning" is coded as `--color-accent`/`--gap-tone` (looking-glass.css, used only by the
  donut) in one place and `--status-good`/`--status-critical` (matrix.css, used by the scatter and
  table) in another. Introduce ONE shared semantic pair — `--have-tone` / `--learn-tone` (+ their
  `-surface` tints) — defined once in `looking-glass.css`'s token block (light + both dark paths),
  and have `matrix.css` reference those tokens via `var()` instead of redeclaring its own
  `--status-good`/`--status-critical` values. Re-point the donut's `donutGradient` and legend
  swatches in `App.tsx` at the same shared tokens. Visual result: the donut ring, the scatter
  bubbles/flags, and the table's Status column all use the identical green/amber hues in both
  themes.
- **Inputs/Outputs**: No data shape changes. Output is purely CSS custom-property values + the
  three `var(...)` references swapped in `App.tsx`'s inline `style` props (`donutGradient`,
  `.lg-swatch` backgrounds). No new props, no new component state.
- **Design Pattern**: none — simple case (token consolidation, not an algorithmic variance).
- **Bounded-AI boundary**: N/A — presentation tokens only; no score, gap, or join logic touched.
- **UI Scope**: cosmetic (existing DOM/layout unchanged; only color token values/references).
- **Intellectual Control**: A single source of truth for "have" vs. "learn" semantics removes the
  exact failure mode already found once this session (matrix.css's dark-theme desync) — from
  recurring in a *different* pair of files. Any future component that needs the have/learn colors
  reads the one shared pair; it cannot silently pick the "wrong" system because there's only one.
- **Constraints**: No new CSS custom properties beyond the `--have-tone`/`--learn-tone`
  (+`-surface`) pair — do not introduce a third naming scheme. Preserve existing WCAG AA contrast
  ratios in both themes (spot-check the values already in matrix.css's `--status-good`/
  `--status-critical` — reuse those exact color values under the new shared names rather than
  inventing new ones, since they're already tuned for contrast in both themes). No behavior change,
  no new dependency.
- **Edge Cases**: `--color-neutral-400` ("not scored yet" donut segment / unscored gray) is
  correctly NOT part of this unification — it has no have/learn semantic and must keep its current
  neutral token untouched. Verify both the `@media (prefers-color-scheme: dark)` guarded block AND
  the unconditional `[data-theme='dark']` block in both files stay in sync (the exact rule that
  slipped last time).
- **Files** (3):
    - `frontend/src/styles/looking-glass.css`
    - `frontend/src/components/matrix/matrix.css`
    - `frontend/src/App.tsx`
- **Tipping Point**: If a third distinct semantic color (beyond have/learn/neutral) is ever needed
  app-wide, promote this ad hoc token pair into a documented palette section at the top of
  `looking-glass.css` rather than adding more inline pairs.

[FORCES]
1. One semantic source of truth > two independently-themed color systems for the same meaning
2. Simplicity > Pattern purity
