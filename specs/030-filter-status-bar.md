# [SPEC] 030 — FilterStatusBar component

- **Objective**: Build a new, standalone, presentational `FilterStatusBar` component that renders the one new copy string from the design handoff — filtered vs. unfiltered — plus a clear-filter action. Not wired into `App.tsx` yet (that's SPEC 033); this task only builds and unit-verifies the component in isolation.
- **Inputs/Outputs**:
  ```ts
  function FilterStatusBar(props: {
    selectedGroup: string | null
    filteredCount: number
    totalCount: number
    onClear: () => void
  }): JSX.Element
  ```
  Filtered (`selectedGroup !== null`): renders `✓ <selectedGroup> — the matrix and table below show <filteredCount> of <totalCount> skills`, plus a `✕ Clear filter` `<button>` calling `onClear`.
  Unfiltered (`selectedGroup === null`): renders `Showing all <totalCount> skills — select a group above to narrow the matrix and table`, no clear button.
  Root element: `role="status"` + `aria-live="polite"`, per README "Interactions & behavior."
- **Design Pattern**: none — simple case. `Simplicity > Pattern purity`.
- **Bounded-AI boundary**: 100% deterministic. `filteredCount`/`totalCount`/`selectedGroup` are passed in verbatim by the caller (`Array.length`, already-existing state) — this component performs no computation, join, or ranking of its own, and makes no LLM call.
- **Verification Oracle**: `frontend/src/components/matrix/FilterStatusBar.test.tsx` (new file — the component itself does not exist yet, so importing/rendering it is a real, currently-failing red). No e2e needed at this stage since nothing calls it yet; end-to-end wiring is verified by SPEC 033's oracle.
- **UI Scope**: structural (new component, new DOM).
- **Intellectual Control**: A single-purpose, fully controlled component (four props in, one render out, no internal state) is trivial to reason about and test in isolation before it's wired into `App.tsx`'s larger render tree — mirrors this codebase's existing precedent (`SeniorityFraming.tsx`, `TopGapNarration.tsx`), which are each single-purpose renderers of already-computed values with their own component-level oracle.
- **Constraints**: No new NPM dependency. Reuse only existing CSS custom properties (`--series-1`, `--border`, `--text-muted`, per README's Band 2 spec) in `matrix.css` — do not invent new color literals. Glyphs (`✓`, `✕`) must be wrapped in `aria-hidden="true"` spans with the surrounding text carrying the actual accessible/announced meaning, mirroring the existing idiom in `.matrix-legend-chip`, `.lev-status-icon`, and `.breakdown-entry-selected-badge` (all in `matrix.css`) — do not let the raw glyph sit as the only accessible content. No animation/transition needed here (a plain status line), unless a background-color change is added for the filtered/unfiltered visual difference, in which case it must sit behind `prefers-reduced-motion: no-preference`, matching every other transition in this stylesheet.
- **Edge Cases**: `totalCount === 0` should not occur in practice (caller only renders this once `hasRows` is true, i.e., `rows.length > 0`) — no special-case null-render logic required inside the component itself; document this assumption in the test file rather than defensively coding around it (avoid the CLAUDE.md-flagged failure mode of adding code that pads coverage of a case that structurally cannot occur). `filteredCount === totalCount` while `selectedGroup !== null` is valid (a group filter that happens to include every skill) and must still render the filtered copy, not silently fall back to the unfiltered string.
- **Files**:
  1. `frontend/src/components/matrix/FilterStatusBar.tsx` (new)
  2. `frontend/src/components/matrix/FilterStatusBar.test.tsx` (new)
  3. `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: If a third status-bar variant is ever needed (e.g., "no matches" for a future search-within-filter feature), promote the two string templates into a small lookup rather than nesting a third ternary branch.

```markdown
[FORCES]
1. Isolated, controlled component now > wiring it into App.tsx before its own contract is locked
2. Simplicity > Pattern purity
```
