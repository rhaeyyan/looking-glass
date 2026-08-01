[SPEC] 040c — Compare-mode wiring: slot 1 carryover + cross-panel same-batch sharing

- **Objective**: Extend 040b's mechanism to compare mode's slot 1 (the compare-grid's own,
  separate checklist JSX block), and resolve the interview's flagged "trickiest interaction"
  precisely: a fully-covered panel must never block, or even momentarily appear in, the sequential
  0→1 confirmation walk (spec 038c's `confirmationSlot`), AND a same-batch submission where slot
  0's confirmation newly completes coverage of a skill slot 1's checklist also needs must let slot
  1 benefit from that BEFORE slot 1's checklist is ever shown to the user (Done-means #5's
  cross-panel sharing, exercised within a single "Find my gaps" click, not just across separate
  submissions).

- **Inputs/Outputs**:
  ```ts
  // App.tsx — handleConfirmSkillsCompare gains the same memory-recording handleConfirmSkills got:
  function handleConfirmSkillsCompare(slot: 1, checkedSkillKeys: Set<string>) {
    const rows = panels[slot].pendingConfirmation?.rows ?? panels[slot].rows
    panels[slot].confirmSkills(checkedSkillKeys)
    setConfirmedSkillMemory((memory) => recordConfirmedDecisions(memory, rows, checkedSkillKeys))
  }

  // New effect — slot 1's twin of 040b's slot-0 layout effect, with ONE deliberate addition:
  // it ALSO depends on panels[0].pendingConfirmation, and short-circuits unless slot 0 has already
  // cleared its own pendingConfirmation (i.e. it is genuinely slot 1's turn). This is what lets a
  // same-batch submission's slot-0 confirmation retroactively benefit slot 1 BEFORE slot 1's
  // checklist is shown, without ever re-evaluating (and yanking) an ALREADY-shown slot-1 checklist
  // later (see Intellectual Control).
  useLayoutEffect(() => {
    const pending = panels[1].pendingConfirmation
    if (!pending) {
      setChecklistInitialKeys((prev) => (prev[1] === undefined ? prev : [prev[0], undefined]))
      return
    }
    if (panels[0].pendingConfirmation !== undefined) return // not slot 1's turn yet
    if (isRoleFullyCovered(confirmedSkillMemory, pending.rows)) {
      handleConfirmSkillsCompare(1, deriveCheckedKeysFromMemory(confirmedSkillMemory, pending.rows))
    } else {
      setChecklistInitialKeys((prev) => [
        prev[0],
        mergeInitialCheckedKeys(confirmedSkillMemory, pending.rows, pending.autoDetectedKeys),
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels[1].pendingConfirmation, panels[0].pendingConfirmation])
  ```
  Compare-grid's shared checklist JSX block (the `slot === confirmationSlot` branch, used for
  BOTH slot 0 and slot 1): replace
  `autoDetectedKeys={panels[slot].pendingConfirmation.autoDetectedKeys}` with
  `initialCheckedKeys={checklistInitialKeys[slot] ?? panels[slot].pendingConfirmation.autoDetectedKeys}`
  — one prop-name change covers both slots since this block already renders generically over
  `slot`. **`confirmationSlot`'s own derivation (spec 038c) needs ZERO changes** — see
  Intellectual Control for why.

- **Design Pattern**: none — simple case. `confirmationSlot`'s existing derived-value design
  (038c) is exactly what makes this composable without new abstraction.

- **Bounded-AI boundary**: Zero LLM, zero new score/gap/join computation — identical boundary to
  040b, extended to slot 1's own (already-deterministic) `confirmSkills` call.

- **Verification Oracle**: `frontend/e2e/compare-cross-role-carryover.spec.ts` (new, Cypress, red
  first) `@ desktop-light`, `@ mobile-touch-dark`, reusing `stubMultiRoleProfile`/`makeRow`/
  `confirmSkillChecklist` (`frontend/e2e/support/app.ts`) and local `comparisonColumn`/`checkboxFor`
  helpers mirroring `compare-confirmation.spec.ts`'s own (not promoted — same file-local pattern
  038c already established for those two). At minimum:
  1. **The trickiest interaction, made a real assertion**: enable compare mode, set slot 0 to a
     role whose vocabulary is ALREADY 100% memory-covered (seed the memory via an earlier
     single-shared-fixture confirm in this same test, or via a prior compare-mode confirm) and slot
     1 to a brand-new, never-before-seen role with at least one undecided skill. Submit once: assert
     slot 0 shows NO checklist and its results appear directly, WHILE slot 1's checklist appears
     immediately too — never blocked waiting for "slot 0's turn," which no longer exists once slot 0
     self-completes. This is the concrete resolution of the SPEC's flagged open question.
  2. **Same-batch cross-panel sharing**: enable compare mode with slot 0 = role A, slot 1 = role B
     (partial overlap, both fresh — nothing in memory yet). Submit once: slot 0's checklist shows
     first (per 038c, unmodified); confirm it WITH an edit that decides an overlapping skill B also
     needs. Assert slot 1's checklist (which advances to automatically, per 038c) shows that
     overlapping skill pre-checked/pre-unchecked per slot 0's JUST-confirmed decision from THIS
     SAME batch submission — not a stale, pre-batch memory snapshot.
  3. **Both slots fully covered on one submit**: with memory already well-populated from steps
     above, pick two further roles whose combined vocabulary is already fully covered; set both
     slots, submit once: assert NEITHER slot ever shows a checklist
     (`skill-confirmation-checklist` stays at count 0 throughout) and both results panels appear
     directly.
  4. **No cross-panel leakage of unrelated state**: while step 1 or 3 runs, assert the OTHER,
     untouched slot's own `rows`/results are exactly what its own role/confirmation would produce
     in isolation — proving the shared piece is only the confirmed-key map, nothing else (per-panel
     `rows`/`haveSkillKeys`/fetch-generation isolation is untouched).
  5. Existing regression guard: `frontend/e2e/compare-confirmation.spec.ts` re-run unmodified and
     green (038c's sequencing/back/toggle/reload behaviors all still hold with an EMPTY memory,
     which is what that file's own fixtures exercise — no memory carryover crosses into that file's
     scenarios since each test starts a fresh page load). `frontend/e2e/cross-role-skill-carryover.spec.ts`
     (040b) re-run unmodified and green.

- **UI Scope**: structural — same reasoning as 040b, extended to the compare-grid's own checklist
  block.

- **Intellectual Control**:
  - **Why `confirmationSlot` needs no code changes**: it is `activeSlotIndices.find((slot) =>
    panels[slot].pendingConfirmation !== undefined) ?? null` — a slot with no `pendingConfirmation`
    is already, by construction, treated as "not needing confirmation." Both this task's and 040b's
    layout effects guarantee a fully-covered slot's `pendingConfirmation` is cleared *before* any
    paint ever observes it as defined (the `useLayoutEffect` pre-paint guarantee, chained: React
    synchronously re-flushes layout effects for state updates scheduled inside a layout effect,
    within the same pre-paint window, so a slot-0 auto-skip that unblocks slot 1's own check
    resolves in the same frame too — see below). The sequential walk therefore transparently skips
    fully-covered slots with zero new state or branching in `confirmationSlot` itself.
  - **Why slot 1's effect additionally depends on `panels[0].pendingConfirmation`**: this is the
    precise mechanism for same-batch cross-panel sharing (oracle item 2). On one shared submit, both
    slots' `pendingConfirmation`s become defined in the same commit; slot 1's effect fires but sees
    slot 0 still pending and no-ops ("not slot 1's turn yet"). Once slot 0 confirms (user click or
    its own auto-skip), BOTH `panels[0].pendingConfirmation` (→ undefined) and `confirmedSkillMemory`
    (→ updated) commit together in the same render (both were set inside the same
    `handleConfirmSkills` call); slot 1's effect re-fires (its dependency changed), now finds slot 0
    cleared, and evaluates coverage/merge using the JUST-updated memory. No stale read is possible
    because the effect body always closes over the render's current values — only the *re-fire
    trigger* is narrowed to "slot 0 changed" or "slot 1 changed," never "memory changed while
    neither slot's `pendingConfirmation` did," which is exactly the case that would otherwise yank
    an already-open, mid-edit slot-1 checklist (the same hazard 040b avoided for slot 0, generalized
    here to "don't re-evaluate a slot whose turn has already begun").
  - This pattern (gate each slot's check on every strictly-earlier active slot's `pendingConfirmation`
    having cleared) generalizes to N slots as
    `activeSlotIndices.slice(0, position).every(s => panels[s].pendingConfirmation === undefined)`
    — noted for the Tipping Point below, not implemented now (only 2 slots exist, spec 039a).

- **Constraints**: No new dependency. Single-panel mode's own branch (edited only in 040b) is not
  touched further here. `confirmationSlot`, `handleCancelConfirmationCompare`, and 038c's "Back"
  semantics are untouched — cancelling a slot's `pendingConfirmation` clears it via `useRolePanel`'s
  existing generation-guard exactly as before, and this task's layout effects self-clean
  `checklistInitialKeys` on that same clear (no new cancel-path wiring needed). `frontend/src/lib/useRolePanel.ts`,
  `gap.ts`, `narrate.ts`, `resumeSkills.ts`, `localPersistence.ts` — untouched.

- **Edge Cases**: Same last-confirmed-wins/permanent-lock-in/zero-skill-role notes as 040b apply
  identically to slot 1. "Clear saved data" remains slot-0/persisted-state-only (038c precedent,
  reaffirmed) and does not cascade into slot 1's in-progress confirmation OR the shared memory.
  Toggling "Compare roles" off mid-sequence (038c oracle item 5) already clears slot 1's
  `pendingConfirmation` via the existing `loadRole('')` generation guard, which this task's layout
  effect responds to identically (resets `checklistInitialKeys[1]`) — no new cleanup path is added.

- **Files**: `frontend/src/App.tsx` (edit, Redwood), `frontend/e2e/compare-cross-role-carryover.spec.ts`
  (new, Cypress, red first).

- **Tipping Point**: If spec 039a's 2-slot cap is ever lifted, the hardcoded "depends on
  `panels[0].pendingConfirmation`" gate on slot 1's effect must generalize to depending on every
  strictly-earlier active slot (see Intellectual Control) — a real refactor point, not attempted
  here. If a future SPEC allows non-sequential/parallel compare-mode confirmation (038c's own
  Tipping Point already flags this as a live possibility), this task's "wait for earlier slots to
  clear" gate becomes meaningless and must be redesigned alongside `confirmationSlot` itself.

```markdown
[FORCES]
1. Same-batch cross-panel sharing must work correctly (gate each slot's check on strictly-earlier active slots having resolved) > the simpler-looking "just depend on this slot's own pendingConfirmation," which 040b uses correctly for slot 0 but would under-serve slot 1
2. A fully-covered panel drops out of the sequential walk with zero changes to confirmationSlot itself > adding new state to explicitly model "skip this slot"
3. Preserve spec 038a/038c's per-instance isolation and 038c's existing Back/toggle/reload semantics untouched > any convenience of restructuring them alongside this
4. Simplicity > Pattern purity
```

**Sequencing note**: 040c lands after 040b — both edit `App.tsx`'s same state (`confirmedSkillMemory`,
`checklistInitialKeys`) and functions (`handleConfirmSkills`'s sibling `handleConfirmSkillsCompare`),
and 040c's compare-grid JSX edit depends on 040b having already renamed the checklist's prop to
`initialCheckedKeys` (leaving that call site on the old prop name after 040b lands alone is a
TypeScript compile error against the renamed `SkillConfirmationChecklistProps`, by design — this is
the forcing function that keeps 040c from drifting arbitrarily far behind 040b). Do not dispatch
040b and 040c to parallel worktrees.
