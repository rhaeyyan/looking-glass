[SPEC] 037 — Distinguish the FilterStatusBar and no-gaps-narration `role="status"` regions by accessible name

- **Objective**: Give `FilterStatusBar`'s live region and the narration "no gaps" live region distinct, non-empty `aria-label`s so a screen-reader user can tell them apart when both are mounted simultaneously (post-spec-033 Evidence-card layout), and update the two frozen spec-005 `App.test.tsx` assertions that assumed narration was the only `role="status"` region ever mounted.
- **Inputs/Outputs**: No new props, state, or computation — purely two `aria-label` string literals added to existing JSX nodes, and updated `screen.queryByRole`/`findByRole`/`getAllByRole` name filters in three existing tests. Exact label text (locked verbatim, same discipline as `NO_GAPS_MESSAGE` — do not reword without a spec update):
  - `frontend/src/components/matrix/FilterStatusBar.tsx`: add `aria-label="Skill filter status"` to the root `<div role="status" ...>` (line ~33-38).
  - `frontend/src/App.tsx`: add `aria-label="Skill gap result"` to the `<p role="status" ...>{NO_GAPS_MESSAGE}</p>` (line ~438). Do not touch the two `role="status"` elements at lines 320 and 326 — they already carry distinct `aria-label`s (`"Loading skill profile"`, `"No skills found for this role"`) and were never part of this collision.
- **Design Pattern**: none — simple case. `Simplicity > Pattern purity`.
- **Bounded-AI boundary**: Zero computation touched. This is an accessible-name annotation on two already-rendered strings — no scoring, gap, join, or LLM output is read or written by this task.
- **Verification Oracle**: `frontend/src/App.test.tsx`, specifically the two named tests:
  1. `renders no narration region at all before any resume has been submitted` (currently `expect(screen.queryByRole('status', { name: '' })).not.toBeInTheDocument()`) — this line is testing the wrong thing once `FilterStatusBar` mounts unconditionally: it will find `FilterStatusBar`'s status (now named `"Skill filter status"`, so `{name: ''}` correctly stops matching it — but that's a coincidental pass, not a stated intent). Replace it with an assertion that names *what "no narration" means now*: `expect(screen.queryByRole('status', { name: 'Skill gap result' })).not.toBeInTheDocument()` (narration's own status is absent) **and** `expect(screen.getByRole('status', { name: 'Skill filter status' })).toBeInTheDocument()` (FilterStatusBar's status is present and correctly distinguishable — documents the new reality instead of silently tolerating it).
  2. `renders a distinct, positive role="status" message … when narrateTopGap returns null` (currently `findByRole('status', { name: '' })` + `getAllByRole('status')).toHaveLength(1)`) — replace the lookup with `screen.findByRole('status', { name: 'Skill gap result' })` (asserting `toHaveTextContent(NO_GAPS_MESSAGE)` as today), add `expect(screen.getByRole('status', { name: 'Skill filter status' })).toBeInTheDocument()`, and change the count assertion to `expect(screen.getAllByRole('status')).toHaveLength(2)` — explicitly asserting *two* status regions coexist and are each independently addressable by name, which is the actual fixed behavior, not a loosened one.
  - Cypress produces red first: tighten these three lines against **today's** code (bare `role="status"`, no `aria-label` on either target) and confirm the new assertions fail for the stated reason (empty/duplicate accessible names), before Magnolia adds the two `aria-label`s.
  - Also add one assertion to `frontend/src/components/matrix/FilterStatusBar.test.tsx`'s existing `<FilterStatusBar /> live-region contract` describe block: `expect(statusEl).toHaveAttribute('aria-label', 'Skill filter status')` — pins the label at the component's own test boundary, not just via `App.test.tsx`'s integration assertions (project rule: every fix leaves an assertion where the fix lives, not only where it was discovered).
- **UI Scope**: cosmetic — an `aria-label` attribute addition on two already-rendered elements; no DOM structure, layout, or visible text changes.
- **Intellectual Control**: The two regions collide only because they can now render at once (spec 033's unconditional Evidence-card mount); giving each end of the collision its own name is the minimal fix that doesn't require re-gating when `FilterStatusBar` mounts (that gating is spec 033's intentional, already-audited behavior — not a bug to re-litigate here) and doesn't touch the visible `NO_GAPS_MESSAGE` wording, which is locked verbatim by a separate, older contract.
- **Constraints**: No new dependency. No change to visible/announced text content of either region — only the `aria-label` attribute, which screen readers use for the accessible *name*, not a replacement of what's read as content.
- **Edge Cases**: Confirm via the oracle that when `FilterStatusBar` is the *only* status mounted (e.g., role selected, no resume submitted, or `showNoGaps` false) it is still uniquely findable by `{name: 'Skill filter status'}` — i.e., the fix does not depend on both regions being present simultaneously to work.
- **Files**:
  1. `frontend/src/components/matrix/FilterStatusBar.tsx`
  2. `frontend/src/App.tsx`
  3. `frontend/src/App.test.tsx`
  4. `frontend/src/components/matrix/FilterStatusBar.test.tsx`
- **Tipping Point**: If a third simultaneously-mountable `role="status"` region is ever added to the results column, stop adding ad hoc labels one-by-one and instead establish a single naming convention/lookup (e.g., a shared `STATUS_LABELS` map) so accessible names can't silently collide again as the Evidence/Standing cards keep growing.

```markdown
[FORCES]
1. Distinguishable accessible names for simultaneously-mounted live regions (WCAG 2.2 AA) > leaving assertions as originally authored under spec 005's single-status assumption
2. An assertion at the point of the fix (FilterStatusBar.test.tsx) in addition to the integration test (App.test.tsx) > relying on one test file alone to prevent regression
3. Simplicity > Pattern purity
```

**Note**: this SPEC is a direct follow-up to spec 033 (results-column two-card assembly), which surfaced this collision during Magnolia's build. Depends on spec 033 landing first.
