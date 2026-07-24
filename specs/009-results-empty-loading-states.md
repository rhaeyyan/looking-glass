[SPEC]
- **Objective**: Give `.lg-results` two states it currently lacks: (1) an **empty state** shown
  when no role is selected yet (`status === 'idle'`) — a short illustrative placeholder card
  inviting the user to complete Step 1, instead of blank space; (2) a **loading skeleton** shown
  while `status === 'loading'` — placeholder blocks shaped like the eventual scorecard/scatter/table
  (not just a bare sentence), so content doesn't "pop" in unstyled. Both are pure presentation:
  gated entirely on the existing `status` state machine already in `App.tsx`; no new state field,
  no new fetch, no timing logic.
- **Inputs/Outputs**: Consumes the existing `status: Status` union (`'idle'|'loading'|'success'|
  'error'`) already in `App.tsx`. No new types. Renders new markup only; no prop/API changes to
  `SkillMatrix`/`SkillLeverageTable`.
- **Design Pattern**: none — simple case (conditional rendering on an existing enum already
  switched over in the same component).
- **Bounded-AI boundary**: N/A — no data computation; purely presentational states over already-
  fetched (or not-yet-fetched) rows.
- **UI Scope**: structural (new DOM appears in `.lg-results` for the idle and loading states that
  previously rendered nothing / a single paragraph).
- **Intellectual Control**: Reuses the state machine that already exists (`status`) rather than
  inventing a parallel one — the empty/skeleton states are a direct, exhaustive switch over the
  same four-value union already driving the rest of the column, so they can't drift out of sync
  with the real fetch lifecycle.
- **Constraints**: Skeleton "shimmer"/pulse animation, if used, MUST be gated behind
  `@media (prefers-reduced-motion: no-preference)` exactly like the existing `.lg-fade`/
  `.matrix-point` transitions — a static (non-animated) skeleton block is the reduced-motion
  fallback. No new dependency (pure CSS, no skeleton library). Keep both new blocks inside the
  existing `.card.blueprint` visual language (reuse `.card`/`.blueprint`/`.corner` classes) rather
  than inventing a new visual idiom.
- **Edge Cases**: The `status === 'error'` and `status === 'success' && rows.length === 0` cases
  are already handled (existing `<p role="alert">` / `<p role="status">`) — do not duplicate or
  regress those; only `idle` (empty state) and `loading` (skeleton) are new. The skeleton must not
  read as real content to a screen reader — use `aria-hidden="true"` on the placeholder blocks with
  a single `role="status"` live-region text ("Loading skill profile…", already present) carrying
  the actual announcement.
- **Files** (2):
    - `frontend/src/App.tsx`
    - `frontend/src/styles/looking-glass.css`
- **Tipping Point**: If a third distinct results-column state is ever needed (e.g., a partial/
  degraded-data state), extract the state→markup switch into its own small component rather than
  growing the `main` JSX further inline.

[FORCES]
1. Perceived-performance continuity (skeleton/empty state) > leaving default browser blank-space
2. Simplicity > Pattern purity
