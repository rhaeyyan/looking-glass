# [SPEC] 031 — SkillGroupBreakdown: chip row + single-source-of-truth `selectedGroup`

- **Objective**: Replace `SkillGroupBreakdown`'s vertical `<ul>` list + `<input type="search">` filter + `✓ Selected` text badge with a wrapping chip row (README Band 1), and eliminate the `selectedGroup` state duplication between this component (currently a local `useState`, line 50 of the current file) and `App.tsx` (currently just a fire-and-forget `onSelectGroup` callback) by making the component **fully controlled**: selection state lives in `App.tsx` alone.
- **Inputs/Outputs**:
  ```ts
  function SkillGroupBreakdown(props: {
    rows: RoleSkillRow[]
    haveSkillKeys?: Set<string>
    selectedGroup: string | null      // NEW — now required, the single source of truth
    onSelectGroup: (group: string | null) => void  // NEW — now required (was optional)
  }): JSX.Element | null
  ```
  Renders (unchanged): the existing h2 + hint paragraph verbatim (`Which skill group is driving your score` / the "Select a group to narrow…" sentence — do not touch this copy). Renders (new): a chip row — first chip `All skills`, then one chip per `computeSkillGroupBreakdown(rows, haveSkillKeys)` entry **in its existing sorted order** (untouched — `frontend/src/lib/skillGroupBreakdown.ts` is out of scope for this task). Each chip is a real `<button>` with `aria-pressed={group.skill_group === props.selectedGroup}` (or `props.selectedGroup === null` for the `All skills` chip), showing the group name + `avg leverage N.NN` (via the existing `formatNum`) or `Not scored` when `avg_arbitrage_score === null`.
  Click behavior: clicking a group chip calls `onSelectGroup(group === props.selectedGroup ? null : group)` (toggle). Clicking `All skills` always calls `onSelectGroup(null)` (a reset action, not a toggle — it has no "own" selected value to toggle away from).
- **Design Pattern**: none — simple case. `Simplicity > Pattern purity`.
- **Bounded-AI boundary**: Fully deterministic; this task changes rendering and state plumbing only. `computeSkillGroupBreakdown` (the aggregation/ranking) is explicitly **not modified** — its already-sorted output is rendered verbatim, same as today. No LLM call anywhere in this component, before or after.
- **Verification Oracle**:
  - `frontend/src/components/matrix/SkillGroupBreakdown.test.tsx` (rewritten — the existing 337-line suite asserts against the `<ul>`/search/badge DOM being deleted here; Cypress replaces it with chip-row assertions: ranked render order preserved, `All skills` always first, `Not scored` sort-last text, non-color selected indicator present, `aria-pressed` driven purely by the `selectedGroup` prop — see Edge Cases below for the exact controlled-component test pattern — plus reduced-motion and axe checks carried over from the existing suite's conventions).
  - `frontend/e2e/skill-group-breakdown.spec.ts @ desktop-light` (chip interaction narrows `SkillMatrix`/`SkillLeverageTable` row counts — the existing "selecting a skill-group entry narrows the rows…" test already covers this shape and should keep passing once locators target chips instead of list items) and `@ mobile-touch-dark` (new assertion: each chip's rendered bounding-box height is ≥ 44px under this profile's `pointer: coarse`, per README's mobile section). **Delete** the existing `'a scrollable list wrapper bounds the panel height…'` test in this file — it verifies a scroll container (`data-testid="skill-group-breakdown-list"`) that this task deliberately removes; this is an intentional, SPEC-documented removal, not a silent drop.
- **UI Scope**: structural (list → chip row is a DOM/layout change, not a style-only change).
- **Intellectual Control**: Collapsing selection state into one place removes the exact class of silent desync bug CLAUDE.md calls out by name (chip shows selected but the filter doesn't apply, or vice versa) — with `App.tsx` as sole owner, there is structurally only one place selection can be wrong, and it's directly observable in the same render pass as the filtered rows it drives.
- **Constraints**: No new dependency. Reuse existing CSS tokens only (`--series-1`, `--surface-1`, `--border`, `--text-secondary`, per README Band 1's exact chip spec: `padding: 7px 14px`, `border-radius: 99px`, selected bg `color-mix(in srgb, var(--series-1) 16%, var(--surface-1))`). Bump chip `padding` to `10px 14px` under `@media (pointer: coarse)` so touch targets clear 44px (README, mobile section) — this is a real, testable CSS addition to `matrix.css`, not a comment. **Accessibility deviation, authorized**: unlike the literal mockup, the selected chip must carry a non-color visual cue in addition to `bg`/`border`/`text` tint and `aria-pressed` — e.g., a small `aria-hidden="true"` `✓` prefix shown only when selected — because color/border/text-tint alone is a WCAG 1.4.1 regression versus this exact component's current, already-shipped fix (see `SkillGroupBreakdown.tsx`'s own header comment on this precedent). Do not silently follow the README on this one point. Drop the `<input type="search">` filter and its `Filter skill groups` label entirely, per the README's default recommendation (15 known roles, ≤~10 groups expected to not need it). **If**, while writing fixtures for the rewritten unit test, any real role's skill_group count is discovered to exceed ~10–12, halt and flag back to Cedar for a follow-up SPEC rather than silently reintroducing the search box — this is a data question outside this task's authority to resolve unilaterally.
- **Edge Cases**:
  - **Single-source-of-truth verification** (the landmine named in the brief): the component test must prove selection is driven *purely* by the `selectedGroup` prop, never internal state, via the controlled-component pattern — render with `selectedGroup={null}`, click a chip, assert `onSelectGroup` was called with the right value **and** the chip's own rendered `aria-pressed` has **not** changed (no internal state moved it); then re-render the same component with `selectedGroup={"<thatGroup>"}` and assert `aria-pressed="true"` now appears **without any click at all**. Only a component with zero internal selection state passes both halves.
  - Groups with `avg_arbitrage_score === null` render `Not scored` and sort last (delegated to the untouched library function — verify the chip text reflects it correctly, not that the sort itself is re-verified here).
  - Empty `rows` (`rows.length === 0`): keep the existing early `return null`.
  - `App.tsx`'s call site needs exactly one line added: `selectedGroup={selectedGroup}` (state already exists at `App.tsx` line 57) alongside the existing `onSelectGroup={setSelectedGroup}` — no other `App.tsx` restructuring happens in this task (that's SPEC 033).
- **Files**:
  1. `frontend/src/components/matrix/SkillGroupBreakdown.tsx`
  2. `frontend/src/components/matrix/SkillGroupBreakdown.test.tsx`
  3. `frontend/src/components/matrix/matrix.css`
  4. `frontend/src/App.tsx`
  5. `frontend/e2e/skill-group-breakdown.spec.ts`
- **Tipping Point**: If a role's group count ever genuinely needs the search box back, reintroduce it as a plain filter over the already-rendered chip array — no change to `computeSkillGroupBreakdown` would be needed.

```markdown
[FORCES]
1. One source of truth for selectedGroup > matching the mockup's literal component boundary
2. Non-color-only selection cue (WCAG 1.4.1, existing precedent) > literal mockup fidelity on this one point
3. Simplicity > Pattern purity
```
