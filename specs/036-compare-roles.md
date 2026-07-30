[SPEC] 036 — Compare mode: 2–3 independent role-slot panels, one shared resume paste

*(Depends on spec 035 landing first — both touch `App.tsx`; not parallelizable with it or with spec 033.)*

- **Objective**: Add a "Compare roles" toggle to Step 1. Off (default): identical to today — one role picker, one `useRolePanel`/`RoleResultsPanel` instance. On: reveal a second independent role picker (slot 1) immediately, plus a "+ Compare a third role" control that reveals a third (slot 2, max). Each active slot is its own `useRolePanel` instance (spec 035) rendering its own `RoleResultsPanel`, laid out side by side (wrapping to stacked on narrow viewports). **One shared resume textarea** feeds every active slot: submitting calls `submitResume(text)` on each active slot's own hook instance — one paste, up to 3 independently-scored comparisons, confirmed unambiguous reading of the human's ask.
- **Inputs/Outputs**:
  - Always exactly 3 `useRolePanel(roleSlot[i])` calls in `App.tsx` (Rules-of-Hooks-safe fixed count); inactive slots hold `role = ''` and render nothing.
  - New local state: `compareMode: boolean`, `roleSlots: [string, string, string]` (slot 0 is today's existing `selectedRole`; slots 1/2 are new, session-only).
  - Each slot's own `<select>` disables `<option>`s already chosen in a sibling active slot, preventing picking the same role twice.
  - Layout: new `.compare-grid` wrapper (CSS grid, `auto-fit`/`minmax`, collapsing to one column under the existing mobile breakpoint) holding 1–3 `RoleResultsPanel` instances.
- **Design Pattern**: none — simple case, reusing spec 035's already-isolated unit N times. `Simplicity > Pattern purity`.
- **Bounded-AI boundary**: Zero LLM. Each slot's numbers are computed exactly as spec 035 already guarantees, independently per slot — **no cross-role aggregate metric (e.g., "which role is the better pivot for you") is computed or displayed here.** That would be a new derived score and, per CLAUDE.md, would need its own deterministic SPEC if ever requested; this SPEC is presentation-only multiplicity of the existing per-role pipeline.
- **Verification Oracle**:
  - `frontend/e2e/compare-roles.spec.ts` (new) `@ desktop-light`, `@ desktop-dark`, `@ mobile-touch-light` — proportionate profile set (layout + cross-contamination logic is neither touch-interaction-specific nor contrast-specific, so 2 desktop + 1 mobile covers viewport-wrap and touch-availability without a full 4-profile sweep):
    1. **Layout**: toggling "Compare roles" on renders exactly 2 `RoleResultsPanel`-level containers side by side (desktop) / stacked (mobile); "+ Compare a third role" adds a 3rd.
    2. **Data isolation (the oracle Pine asked for, at the full-stack level)**: stub two roles with deliberately distinct, diffable fixture skill names (e.g. slot-A stub contains `"alpha-only-skill"`, slot-B stub contains `"bravo-only-skill"`, neither present in the other's stub). Pick role A in slot 0, role B in slot 1, submit one shared resume, then rapidly re-pick slot 1 to a third role C before slot-1's fetch for B can plausibly resolve (specifically exercising the out-of-order-resolution hazard). Assert slot 0's table/matrix never renders `"bravo-only-skill"` or C's marker skill, and slot 1 settles on C's data only — never a stale B render, never A's data.
- **UI Scope**: structural — a new toggle, new slot pickers, and a new multi-panel grid are real DOM/layout changes (Magnolia).
- **Intellectual Control**: The new surface adds no new isolation mechanism of its own — it is a thin wiring layer on top of spec 035's already-proven-safe hook. The only genuinely new risk this SPEC could introduce is the shared-submit fan-out (`submitResume` called on 1–3 instances from one click); each call is independent and hits only its own instance's setters, so no new shared-state path is opened.
- **Constraints**: No new dependency. Persistence (spec 034) is **not** extended in this SPEC — slots 1/2 and the compare toggle are session-only and reset on reload; slot 0's existing persistence is unaffected. This is a deliberate scope cut, approved by the human, not an oversight — extending `localPersistence.ts` to cover it would be a follow-up SPEC if requested.
- **Edge Cases**: Turning compare mode off discards slots 1/2 state entirely (no "remember for next time" within this SPEC). Picking the same role already active in a sibling slot is prevented at the picker (disabled option), not detected post-hoc. Removing slot 2 collapses back to 2 panels; removing down to 1 is not offered — leaving compare mode via the toggle is the path back to a single panel.
- **Files** (4, under cap):
  1. `frontend/src/App.tsx` (edit: toggle, `roleSlots` state, slot pickers, fan-out submit) — Magnolia
  2. `frontend/src/components/matrix/matrix.css` (edit: `.compare-grid` responsive rules) — Magnolia
  3. `frontend/e2e/compare-roles.spec.ts` (new) — Cypress (red first)
  4. `frontend/src/App.test.tsx` (edit, if the toggle/slot wiring needs a unit-level assertion beyond the e2e oracle) — Cypress
- **Tipping Point**: If a 4th comparison slot or a persisted "saved comparison" concept is ever requested, this is the point to reconsider `roleSlots` as a proper array-of-N rather than a fixed 3-tuple, and to bump `localPersistence`'s storage key.

```markdown
[FORCES]
1. Reuse spec 035's already-isolated per-slot unit N times > inventing a new N-role shared data model
2. Discoverable, incremental disclosure (toggle → 2 slots → optional 3rd) > forcing an upfront "how many roles" count from the user
3. Simplicity > Pattern purity
```
