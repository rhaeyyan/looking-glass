[SPEC] 039a — Cap compare mode at 2 roles, remove the third-slot capability entirely

- **Objective**: Compare mode supports at most 2 active role panels, period. Remove `showThirdSlot`
  state, the `panel2` `useRolePanel` call site, the "+ Compare a third role" button, and every
  `0 | 1 | 2`-typed slot parameter — shrink to a real `[string, string]` shape, not a hidden-but-
  still-mounted third slot.

- **Inputs/Outputs**:
  - `roleSlots: [string, string]` (was `[string, string, string]`); initial `useState` value
    `[persistedOnMount?.selectedRole ?? '', '']`. Only slot 0 is ever persisted (unchanged).
  - Delete `const [showThirdSlot, setShowThirdSlot] = useState(false)` entirely.
  - Delete `const panel2 = useRolePanel(roleSlots[2])`. `panels` becomes
    `readonly [UseRolePanelResult, UseRolePanelResult] = [panel0, panel1]`.
  - `handleSlotRoleChange(slot: 0 | 1, role: string)` — narrows from `0 | 1 | 2`; its
    `next: [string, string]` local mirrors the new tuple width.
  - `handleCompareModeToggle`'s `!checked` (off) branch: `setRoleSlots((prev) => [prev[0], ''])`;
    keep `panels[1].loadRole('')`; delete `panels[2].loadRole('')` and `setShowThirdSlot(false)`
    (the latter no longer exists to reset).
  - `handleConfirmSkillsCompare(slot: 1, checkedSkillKeys: Set<string>)` — narrows from `1 | 2` to
    the literal `1` (kept narrow, not widened to `number` — preserves the compiler-enforced
    exhaustiveness this file already leans on).
  - `handleCancelConfirmationCompare(slot: 0 | 1)` — narrows from `0 | 1 | 2`.
  - `handleClearSavedData`'s `setRoleSlots((prev) => ['', prev[1], prev[2]])` →
    `setRoleSlots((prev) => ['', prev[1]])`.
  - `activeSlotIndices: number[] = compareMode ? [0, 1] : [0]` — the `showThirdSlot` ternary is
    deleted, not just short-circuited.
  - The two `slot as 0 | 1 | 2` casts at the JSX call sites (`handleSlotRoleChange`,
    `handleConfirmSkillsCompare`/`handleCancelConfirmationCompare`) narrow to `slot as 0 | 1`.
  - Delete the entire `{compareMode && !showThirdSlot && (<button ... className="lg-add-third-role"
    onClick={() => setShowThirdSlot(true)}>+ Compare a third role</button>)}` block
    (`frontend/src/App.tsx` ~419-427).
  - `matrix.css`: delete `.lg-add-third-role { margin: 4px 0 12px; }` (~1120) and correct the
    "Spec 036" comment block (~1089-1098), which currently documents a "+ third role" control that
    no longer exists — this is a stale implementation-describing comment, not in-flight ledger
    state, so it gets corrected in place, not appended-to.
  - Update the two stale comments in `App.tsx` that describe "3 fixed slots"/"slot 2 once '+
    Compare a third role' has been clicked" (~70-95, ~291-299) to describe the 2-slot reality.

- **Design Pattern**: none — simple case. This removes capability; no new abstraction is earned.

- **Bounded-AI boundary**: Zero LLM, zero score/gap/join computation touched — pure state-shape and
  DOM removal. `RoleResultsPanel.tsx`, `SkillConfirmationChecklist.tsx`, `useRolePanel.ts`,
  `FilterStatusBar.tsx` are untouched: all four already operate per-panel-instance, generic over
  however many active slots exist (spec 038c's Q5 finding applies again here).

- **Verification Oracle**:
  `frontend/e2e/compare-roles.spec.ts` @ desktop-light, @ desktop-dark, @ mobile-touch-light,
  @ mobile-touch-dark, and `frontend/e2e/compare-confirmation.spec.ts` @ desktop-light,
  @ mobile-touch-dark (this file's existing declared profiles). Specifically:
  1. `compare-roles.spec.ts`'s test currently named `'"+ Compare a third role" adds a 3rd
     panel-level container'` becomes a negative assertion, e.g. `'compare mode caps at exactly 2
     panels — no "+ Compare a third role" control exists'`: with compare mode on, assert
     `page.getByRole('button', { name: '+ Compare a third role' })` has count 0, and
     `.compare-grid > *` stays at exactly 2 (never reachable to become 3). Update the file's header
     doc-comment (~14, ~29), which currently quotes "+ Compare a third role" as an existing control,
     to instead state the 2-panel cap.
  2. `compare-confirmation.spec.ts`: delete `setupThreeSlotCompare`/`addThirdRole` and the "3-panel
     walk is strictly 0 -> 1 -> 2" test (its unique claim — never 2+ checklists visible across a
     3-long chain — is already fully subsumed by the existing 2-slot "exactly slot 0's checklist
     right after submit" + "confirming slot 0 ... advances to slot 1's checklist" assertions, so no
     coverage is lost deleting it). The existing "'Back' on slot 1's checklist leaves slot 0's
     confirmed result untouched" test is **kept, adapted to 2 slots** (drop every slot-2 reference)
     — it uniquely proves "abandoning the currently-visible checklist doesn't touch an earlier,
     already-confirmed slot." **Add one new test**: "Back" clicked on slot 0's checklist **before
     confirming anything** must abandon slot 1's already-staged draft too — asserted by confirming
     no checklist appears anywhere afterward (in particular, slot 1's checklist must never surface),
     and both slots fall back to their un-analyzed `.standing-root` view. This is the 2-slot
     equivalent of the deleted "Back on slot 1 abandons slot 2" case, and is the *only* place
     `handleCancelConfirmationCompare`'s `laterSlot > slot` filter can still be observed with a
     2-slot cap (Back on slot 1, the last slot, never has a later slot to abandon). Delete now-unused
     `ROLE_3`/`CHARLIE_SKILL` constants once `setupThreeSlotCompare` is gone.
  3. Cypress's compliance report re-runs `skill-confirmation.spec.ts` unmodified/green as the
     regression guard for single-panel mode (untouched by this SPEC).

- **UI Scope**: structural — a DOM capability (the third slot, its button, its picker) is removed
  entirely, not restyled.

- **Intellectual Control**: Shrinking to a real 2-tuple (rather than keeping 3 fixed
  `useRolePanel` call sites and simply never exposing the third) is the safer shape: a permanently
  mounted-but-unreachable `panel2` still runs `useRolePanel`'s full effect chain (generation guards,
  fetch listeners) for a slot no UI path can ever call `loadRole` on again once the button is gone —
  exactly the kind of latent, silently-carried complexity this project's own ceremony-pricing
  philosophy (CLAUDE.md's Pipeline section) warns against. The "smaller diff" alternative is a false
  economy besides: `showThirdSlot`, the button, and every `0 | 1 | 2` type signature must be edited
  either way, so the only thing kept by *not* shrinking the tuple is one dead hook call site — not
  simpler, just latent.

- **Constraints**: No new dependency. No change to `localPersistence.ts` — slot 1 was already
  session-only and un-persisted (spec 036); nothing here changes what's persisted. Keep the narrow
  literal-union parameter types (`0 | 1`, not `number`) — this codebase already leans on the
  compiler to catch a stray out-of-range slot index at every one of these call sites.

- **Edge Cases**: No reload/migration concern — the removed third slot was never persisted (session
  -only, spec 036), so there is no stale-slot-2 state that could survive a reload to worry about.

- **Files**: `frontend/src/App.tsx` (edit, Magnolia), `frontend/src/components/matrix/matrix.css`
  (edit, Magnolia), `frontend/e2e/compare-roles.spec.ts` (edit, Cypress — red first),
  `frontend/e2e/compare-confirmation.spec.ts` (edit, Cypress — red first).

- **Tipping Point**: If a future SPEC ever reverses this and reintroduces N>2 comparison slots,
  spec 036's already-proven generalization (fixed N `useRolePanel` call sites, `activeSlotIndices`
  as the sole source of truth) is the shape to restore — a known-good, previously-shipped pattern to
  re-apply, not a redesign. Until then, 2 hand-coded fixed slots (no loop-generated hooks) is the
  simplest Rules-of-Hooks-safe shape.

[FORCES]
1. No dead/lingering capability (a permanently-mounted, unreachable panel2) > a marginally smaller diff
2. Simplicity > Pattern purity
