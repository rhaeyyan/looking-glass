# 027 — Skill-group breakdown UI (follow-on to spec 026)

## Context

Spec 026 shipped the deterministic data layer: `computeSkillGroupBreakdown()`
(`frontend/src/lib/skillGroupBreakdown.ts`) groups a role's scored rows by `skill_group` and
returns them already sorted (desc by `avg_arbitrage_score`, null-last, alphabetical tie-break).
That spec explicitly deferred rendering to a follow-on and flagged one key finding: a live
enumeration found **37 distinct `skill_group` values**, well past its own 15–20 Tipping Point —
so this SPEC must not assume a flat chip layout.

**Design decision**: rather than a chip row or a second chart (which would duplicate the existing
scatter's position/size encoding over an aggregate with no new plottable dimension), this reuses
the codebase's existing idiom for "arbitrary-N ranked scored rows" — the same scrollable,
accessible list pattern `SkillLeverageTable` already established — plus a text filter to narrow
the 37-value set. Each group entry doubles as a toggle that filters the rows passed to the
existing `SkillMatrix`/`SkillLeverageTable` via a plain array `.filter()` in `App.tsx`; neither of
those two already-hardened components (touch/hover a11y fixes from spec 018) is modified.

Lane: **OBSERVABLE**, but with a real oracle needed for the cross-component filter interaction —
structural UI scope, routed to **Magnolia**.

## [SPEC]

- **Objective**: Render `computeSkillGroupBreakdown(rows, haveSkillKeys)`'s output as a new
  `SkillGroupBreakdown` panel — "which skill group is driving your score" — slotted between the
  existing scorecard and `SkillMatrix`/`SkillLeverageTable` in `App.tsx`. The panel is a ranked,
  scrollable list of skill groups (verbatim order from the data layer — no re-sort in the
  component) with an accessible text filter to narrow the 37-value set, and each group entry is a
  toggle that filters the rows passed to `SkillMatrix`/`SkillLeverageTable` down to that one
  `skill_group` (selecting the same group again clears the filter — not a one-way narrowing, same
  reversibility rule as spec 010's tap-reveal).
- **Inputs/Outputs**:
  - `SkillGroupBreakdown` component props: `{ rows: RoleSkillRow[]; haveSkillKeys?: Set<string> }`
    — same props already threaded through `SkillMatrix`/`SkillLeverageTable` in `App.tsx`, no new
    data-fetch.
  - Internally calls `computeSkillGroupBreakdown(rows, haveSkillKeys)` (frontend/src/lib/skillGroupBreakdown.ts,
    already built by spec 026) exactly once per render — do not reimplement the groupby/sort here.
  - Local UI state only, both additive/reversible, neither written back to score/gap data:
    `filterText: string` (controlled `<input type="search">`, filters the breakdown list by
    case-insensitive substring match on `skill_group`) and `selectedGroup: string | null` (which
    group's toggle is active; `null` = no filter).
  - `App.tsx` lifts `selectedGroup` up (via a callback prop, e.g. `onSelectGroup`) and computes
    `filteredRows = selectedGroup ? rows.filter(r => (r.skill_group ?? 'Uncategorized') === selectedGroup) : rows`
    once, then passes `filteredRows` into the **existing, unmodified** `rows` prop of
    `SkillMatrix`/`SkillLeverageTable` — neither of those two components' own source changes.
  - Output: no new field on any exported type; this task is presentation-only over an
    already-typed data structure.
- **Design Pattern**: none — simple case. One controlled filter input, one toggle-selection set of
  size 1 (`selectedGroup`), lifted one level via a callback prop — the same additive local-state
  shape `SkillMatrix`'s `tapRevealed` already established in this codebase (spec 010). No new
  abstraction earned.
- **Bounded-AI boundary**: 100% deterministic, and adds zero new computation to spec 026's already-
  deterministic aggregation. The filter-text match is a pure `String.includes()`; the group-toggle
  row filter is a pure equality filter on an already-computed `skill_group` value. No LLM call
  anywhere in this component or its wiring.
- **Verification Oracle**: `frontend/src/components/matrix/SkillGroupBreakdown.test.tsx` (vitest +
  `@testing-library/react` + `jest-axe`, mirroring `SkillMatrix.legendAndReveal.test.tsx`'s
  RED-phase-safe dynamic-import pattern since the module doesn't exist yet — a real red) **and**
  `frontend/e2e/skill-group-breakdown.spec.ts @ mobile-touch-dark` + `@ desktop-dark` (new e2e spec
  — the cross-component behavior of selecting a group actually changing what `SkillMatrix`/
  `SkillLeverageTable` render is a real end-to-end interaction, the same class of thing
  `leverage-table.spec.ts` already verifies in a real browser rather than a DOM stub, and touch
  target size / scrollability of a 37-item list needs the mobile-touch profile to be meaningful).
  Both must fail before implementation and pass after.
- **UI Scope**: **structural** — a new interactive filtering/grouping control and new DOM, not
  styling on an unchanged layout, per spec 026's own flag in its UI Scope field.
- **Intellectual Control**: Reuses this codebase's one existing idiom for "arbitrary-N ranked
  scored rows" (`SkillLeverageTable`) instead of inventing a third visual paradigm alongside the
  scatter and the table. Because `computeSkillGroupBreakdown` already returns the panel in final
  sort order, the component never re-derives ranking logic — it only renders and filters, so a
  correctness bug here cannot silently corrupt a score, gap, or ranking (that surface is already
  locked down by spec 026's own tests). The row-filter that connects this panel to the existing
  chart/table is a plain array `.filter()` in `App.tsx`, not a prop threaded into either child
  component — `SkillMatrix.tsx` and `SkillLeverageTable.tsx` need zero changes, so their own
  hard-won a11y/touch-hover fixes (spec 018) are not at risk of regression from this task.
- **Constraints**: No new npm/pip dependency (`jest-axe`, `@testing-library/*`, `@playwright/test`
  are already in use). Must invoke the `dataviz` skill before building, per CLAUDE.md's
  Accessibility section — even though this panel is a ranked list/table (the same non-chart
  paradigm as `SkillLeverageTable`, which is itself the scatter's accessible alternative) rather
  than a new position/size-encoded visualization, it presents aggregated scored data and drives a
  filter over the existing chart, so the WCAG data-viz checklist (no color-only encoding,
  keyboard-navigable, accessible-table-equivalent, `prefers-reduced-motion`, AA contrast) still
  applies in full. The list must be scrollable (bounded max-height, `overflow-y: auto` in
  `matrix.css`) — not an unbounded page-length dump of 37 rows.
- **Edge Cases** (must be asserted):
  - `rows` is empty / `hasRows` is false at the `App.tsx` call site — the panel must not render at
    all (same gating `App.tsx` already applies to `SkillMatrix`/`SkillLeverageTable`), never render
    an empty shell.
  - Filter text matches zero groups — render a visible "No skill groups match" message, not a
    silently empty list indistinguishable from a loading/broken state.
  - The literal `"Uncategorized"` group must appear in the (unfiltered) list like any other group —
    never hidden or specially excluded.
  - `haveSkillKeys` is `undefined` (no resume yet) — `have_skills`/`gap_skills` are `null` per spec
    026; the panel must render this as "not analyzed yet" (or omit the have/gap line entirely),
    never coerce to `0`, matching the donut scorecard's existing `unscoredCount` handling in
    `App.tsx`.
  - Selecting a group whose member rows include `arbitrage_score: null` (demand-only) rows —
    `filteredRows` still contains them; confirm `SkillMatrix`'s existing scored-only scatter filter
    and `SkillLeverageTable`'s existing demand-only-last/flagged behavior are unaffected by the
    narrower row set (no new special-casing needed in either component; the test proves passthrough
    correctness).
  - Clicking a selected group's toggle again clears `selectedGroup` and restores the full `rows`
    set to the chart/table — reversible, not a one-way filter.
  - Keyboard-only operation: filter `<input>` and every group toggle are native, tab-reachable,
    operable via Enter/Space; no element traps focus.
  - Any transition/highlight on the selected group's list item respects `prefers-reduced-motion`
    (reuse `SkillMatrix`'s existing `prefersReducedMotion()` helper or its CSS-media-query
    equivalent — no new detection logic invented).
  - The mounted panel (list + filter engaged + a group selected) stays axe-clean.
- **Files**: `frontend/src/components/matrix/SkillGroupBreakdown.tsx`,
  `frontend/src/components/matrix/SkillGroupBreakdown.test.tsx`, `frontend/src/App.tsx`,
  `frontend/src/components/matrix/matrix.css`, `frontend/e2e/skill-group-breakdown.spec.ts`
- **Tipping Point**: if a future dataset changes `skill_group` cardinality materially beyond 37, or
  a `category → skill_group` two-level nesting becomes necessary (spec 026's Tipping Point already
  flagged this as worth revisiting once the real set was known — it now is, and a flat filterable
  list was judged sufficient at 37; nesting is not warranted until multi-select or per-category
  sub-totals are actually requested), or if selection needs to support more than one group at once,
  revisit this component's single-`selectedGroup` model.

## [FORCES]

1. Reusing this codebase's one existing ranked-list idiom (`SkillLeverageTable`'s pattern) for a
   37-value set > inventing a new chip layout or a second chart that duplicates the scatter's
   encoding without adding a new plottable dimension
2. A filter that narrows the existing chart/table via a plain array `.filter()` in `App.tsx` >
   threading a filter prop into `SkillMatrix`/`SkillLeverageTable` and risking their already-fixed
   touch/hover a11y behavior
3. Deterministic, already-tested aggregation and sort order (spec 026) reused verbatim > any
   re-derivation of ranking/grouping logic inside this presentation component
4. Simplicity > Pattern purity
