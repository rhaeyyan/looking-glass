[SPEC] 038c — Compare-mode sequential skill-confirmation

- **Objective**: Extend compare mode (`compareMode === true`) to route every active panel (0, 1,
  and 2 if the third slot is shown — **including panel 0**, which today skips confirmation
  entirely via `submitResumeAutoConfirm` while `compareMode` is true) through spec 038b's
  checklist, one panel at a time, in ascending slot order, before that panel's gap is computed —
  per the human's locked decision recorded in spec 038b's Tipping Point (quoted verbatim there;
  not re-litigated here).

  **Resolution of the five open questions** (all traced against the live code, not assumed):

  1. **Sequencing mechanism — resolved as (a).** `handleResumeSubmit` collapses to one line:
     `activeSlotIndices.forEach((slot) => panels[slot].submitResume(resumeText))` — staging fires
     for every active panel immediately on submit (this also subsumes the single-panel branch,
     since `activeSlotIndices === [0]` there, producing the exact same single call `submitResume`
     already makes — the `if (compareMode) {...} else {...}` branch disappears entirely, not
     because it was refactored for its own sake, but because `submitResume` is now correct for
     every mode/slot). The *rendered* checklist is a **derived** value, not new state:
     `confirmationSlot = activeSlotIndices.find((slot) => panels[slot].pendingConfirmation !==
     undefined) ?? null` — the earliest active slot, ascending, that still needs confirming. This
     satisfies "before any panel computes its gap" exactly: `submitResume` stages only (per 038a's
     split), never calls `computeSkillGap`; only `confirmSkills` — gated on the user reaching that
     panel's turn — does. Option (b) (defer even *staging* until the previous panel confirms) was
     rejected: it buys nothing "before any panel computes its gap" doesn't already get from (a),
     and it would require new state to track "has slot N's extraction been deferred," which (a)
     needs none of.
  2. **Persistence — resolved as: no `localPersistence.ts` change.** `roleSlots[1]`/`roleSlots[2]`
     and `compareMode` are session-only and never restored (spec 036); the only persisted
     confirmation surface is slot 0's `confirmedSkillKeys`/`confirmedFingerprint`, keyed on slot
     0's role + resumeText — the *same* underlying value whether compare mode is on or off. Once
     panel 0 also goes through the checklist in compare mode, its confirmation is captured through
     the exact same, unmodified `handleConfirmSkills` App.tsx already has (see Inputs/Outputs) —
     there is no second, compare-mode-shaped confirmation surface to collide with the single one.
     At mount, `compareMode` always starts `false` (never persisted true), so hydration already
     only ever replays into panel 0 in single-panel shape — unchanged by this SPEC. Slots 1/2's
     confirmations live and die in memory for the session, exactly as their `rows`/`haveSkillKeys`
     already do. The Tipping Point's stated concern (`confirmedSkillKeys` "likely needs to become
     per-slot") is real for a *future* SPEC that persists slots 1/2 — not for this one.
  3. **Back/cancel semantics — resolved as: "Back" on slot N abandons N and every later active
     slot's still-staged draft; earlier, already-confirmed slots in the same sequence are
     untouched.** Single-panel's existing "Back" already means "abandon this submission, let me
     re-edit and resubmit," not "step back to a previous state" (there is no such affordance
     anywhere in this app). The direct generalization — since one "Find my gaps" click now stages
     *all* active panels as one batch — is "abandon the rest of this batch from here on," never
     "un-confirm" an earlier panel (which would require a new "uncompute" primitive `useRolePanel`
     does not have and this SPEC does not add) and never "skip forward" (which a bare
     `cancelConfirmation()` on just slot N would otherwise cause, since the next active slot's
     already-staged draft would become the new earliest-pending one). Re-submitting
     ("Find my gaps" again) is the existing, sufficient route back to redo an earlier panel too —
     it already restages every active slot from scratch.
  4. **Toggling compare mode / changing a role mid-sequence — resolved as: already handled, no new
     cleanup.** `handleCompareModeToggle`'s existing off-branch (`panels[1].loadRole('')`,
     `panels[2].loadRole('')`) already clears those panels' `pendingConfirmation` via
     `useRolePanel`'s existing generation-guard effect (035/038a) — the view falls back to the
     single-panel branch showing panel 0's own, independently-tracked state, whatever it was.
     Likewise, changing any active slot's role mid-sequence clears *that* slot's own draft via the
     same guard; `confirmationSlot`, being derived, re-resolves to whichever active slot still
     needs confirming next with zero special-case code. Per-instance isolation (proven by
     construction, spec 035) is exactly what makes this true without new plumbing.
  5. **File/task split — resolved as: one SPEC, not two.** Unlike 038a/038b, no hook-API change is
     needed here — `submitResume`/`pendingConfirmation`/`confirmSkills`/`cancelConfirmation` are
     already generic per-panel-instance (038a built them that way for exactly this reuse). This is
     pure `App.tsx` orchestration/rendering plus its e2e oracle; total surface is 4 files (below
     the cap), so it does not need Redwood involved at all — dispatched to Magnolia end-to-end per
     the UI pipeline (Cypress red first, then Magnolia).

- **Inputs/Outputs**:
  - `App.tsx` — new derived value: `const confirmationSlot: number | null = activeSlotIndices.find((slot) => panels[slot].pendingConfirmation !== undefined) ?? null`.
  - `handleResumeSubmit`'s body becomes `activeSlotIndices.forEach((slot) => panels[slot].submitResume(resumeText))` for **both** branches (the `compareMode` conditional is deleted, not merely reorganized — verify this is a true behavior-preserving collapse for the single-panel path by running `skill-confirmation.spec.ts` unmodified, see Verification Oracle).
  - New function `handleConfirmSkillsCompare(slot: 1 | 2, checkedSkillKeys: Set<string>): void` — calls `panels[slot].confirmSkills(checkedSkillKeys)` only; no persistence (mirrors why slots 1/2 are never persisted today). Slot 0's compare-mode checklist reuses the **existing, unmodified** `handleConfirmSkills` (already does exactly the right thing for slot 0 regardless of `compareMode`).
  - New function `handleCancelConfirmationCompare(slot: 0 | 1 | 2): void` — calls `panels[slot].cancelConfirmation()`, then `panels[laterSlot].cancelConfirmation()` for every `laterSlot` in `activeSlotIndices` greater than `slot` (Q3).
  - Compare-grid's per-slot render gains one branch: for the active slot equal to `confirmationSlot`, render `<SkillConfirmationChecklist role={roleSlots[slot]} rows={panels[slot].pendingConfirmation.rows} autoDetectedKeys={panels[slot].pendingConfirmation.autoDetectedKeys} onConfirm={slot === 0 ? handleConfirmSkills : (keys) => handleConfirmSkillsCompare(slot as 1 | 2, keys)} onCancel={() => handleCancelConfirmationCompare(slot)} />` in place of `RoleResultsPanel`, inside the *same* `<section aria-label="${role} comparison column">` wrapper (landmark unchanged — spec 036's oracle depends on it existing regardless of content). Every other active slot renders exactly as it does today (idle/loading/success-with-`RoleResultsPanel`, analyzed or not) — a slot waiting its turn shows its ordinary un-analyzed browsing view; no new "waiting" UI is introduced (Constraints).
  - `SkillConfirmationChecklist.tsx`, `RoleResultsPanel.tsx`, `useRolePanel.ts` — **zero changes**. This is the deliverable of Q5's analysis: everything needed already exists.

- **Design Pattern**: none — simple case. `confirmationSlot` is a stateless derivation over already-isolated per-instance state (spec 035's own guarantee), not a new abstraction; no GoF pattern is earned by adding a name to it.

- **Bounded-AI boundary**: Zero new computation, zero LLM — pure sequencing/orchestration of the already-deterministic `submitResume`/`confirmSkills` per panel (spec 006/038a, unchanged).

- **Verification Oracle**: `frontend/e2e/compare-confirmation.spec.ts` (new) `@ desktop-light`, `@ mobile-touch-dark` — enable compare mode with 2 (and separately 3, via "+ Compare a third role") active slots, submit one shared resume, and assert: (1) only slot 0's checklist (`data-testid="skill-confirmation-checklist"`) is visible immediately after submit — slot 1's (and slot 2's) column shows its ordinary un-analyzed browsing view, no checklist, no donut; (2) confirming slot 0 with an edit (uncheck one auto-detected skill, matching 038b's edit-assertion style against the real `extractResumeSkills` output, not a hardcoded guess) advances automatically to slot 1's checklist, and slot 0's column now shows analyzed results reflecting the *edited* set; (3) in the 3-panel case, the walk is strictly 0 → 1 → 2, never two checklists visible at once (assert `page.getByTestId('skill-confirmation-checklist')` has count 1 throughout, never 0 while any panel remains unconfirmed, never 2+); (4) "Back" on slot 1's checklist leaves slot 0's already-confirmed result untouched and returns slot 1 (and slot 2, if staged) to their un-analyzed view with no checklist anywhere; (5) toggling "Compare roles" off mid-sequence (while slot 1's checklist is up) collapses cleanly to the single-panel view of slot 0's own state, no orphaned checklist, no crash; (6) confirm slot 0 with an edited set in compare mode, reload the page — the single-panel view (compare mode always resets to `false` on load, spec 036) shows the confirmed/edited result directly with **no** fresh checklist, proving Q2's "no persistence change needed" conclusion as a real assertion, not prose. Also **fix** `frontend/e2e/compare-roles.spec.ts`'s existing "a rapid re-pick of slot 1 settles on the new role only" test (`Data isolation across slots` describe block): it currently asserts slot 0's skill rowheader is visible immediately after "Find my gaps," which this SPEC breaks (slot 0 now shows a checklist there instead) — add one `confirmSkillChecklist(page)` call (new shared helper, see below) for slot 0 before that assertion; no other test in that file is affected (none of the others submit a resume). `frontend/e2e/support/app.ts` gains one new export, `confirmSkillChecklist(page: Page): Promise<void>`, clicking the singular "Confirm skills" button (safe because exactly one checklist is ever rendered app-wide at a time, single-panel or compare-mode-sequential, by construction), used by both the new file and the `compare-roles.spec.ts` fix; and promotes the currently-private `stubMultiRoleProfile`/`makeRow`/`RoleFixture` (today defined only inside `compare-roles.spec.ts`) into exports the new file also needs, so the new spec does not re-paste a near-duplicate multi-role stub. Cypress's compliance report must also re-run `skill-confirmation.spec.ts` unmodified and green, and `compare-roles.spec.ts` (post-fix) unmodified elsewhere and green, as the regression guard for "preserve 038b/036 exactly."

- **UI Scope**: structural — the checklist's DOM now appears inside the compare-grid's per-slot columns, a place it never rendered before; not a styling change to an existing layout.

- **Intellectual Control**: This scales to N panels without new cross-panel state because `useRolePanel`'s confirmation primitives were built panel-agnostic in spec 038a for exactly this reuse; `confirmationSlot` is a pure derivation, never stored, so it can never drift out of sync with the per-instance state it reads. No new coupling is introduced between panel instances — cancel/confirm still only ever calls a *single* panel's own `confirmSkills`/`cancelConfirmation`, looped over `activeSlotIndices` where needed (Q3), never reaching into a sibling's internals.

- **Constraints**: No new dependency (verified against `frontend/package.json` — none needed). Single-panel mode's existing JSX branch (the `!compareMode` ternary, `handleConfirmSkills`, its `onCancel={panels[0].cancelConfirmation}` wiring) must not be edited at all beyond the `handleResumeSubmit` collapse described above, which must be proven behavior-preserving for slot 0 by `skill-confirmation.spec.ts` staying green unmodified. No new "waiting for its turn" UI component — a not-yet-reached panel shows its ordinary un-analyzed view; if that reads as visually thin, a follow-up cosmetic SPEC is the right place to improve it, not this one. No CSS file changes — `.compare-column`'s existing `minmax(15rem, 1fr)` grid track already sizes the checklist card correctly (verified against `frontend/src/components/matrix/matrix.css:1120-1143`).

- **Edge Cases**: A panel whose `fetchRoleSkillProfile` call hasn't resolved yet at "Find my gaps" click time stages `pendingConfirmation` against empty `rows` — a **pre-existing** limitation shared with panel 0's current 038b behavior and every pre-038a compare-mode panel (`handleResumeSubmit` has never gated on `status === 'success'`); this SPEC does not newly introduce or fix it, and documents it rather than silently carrying it. "Clear saved data" remains scoped to slot 0 only (pre-existing, spec 034/036 behavior) and does not cascade into slots 1/2's in-progress confirmation state — unchanged by this SPEC. Two active slots can never hold the same role (existing per-slot `disabled` option guard), so `${role} comparison column` landmarks never collide even mid-sequence.

- **Files**: `frontend/src/App.tsx` (edit, Magnolia), `frontend/e2e/compare-confirmation.spec.ts` (new, Cypress, red first), `frontend/e2e/support/app.ts` (edit, Cypress — new `confirmSkillChecklist` export + promoted `stubMultiRoleProfile`/`makeRow`), `frontend/e2e/compare-roles.spec.ts` (edit, Cypress — one-line fix to the rapid-re-pick test + switch to the promoted stub helpers).

- **Tipping Point**: If a future SPEC ever wants non-sequential confirmation (user-chosen order, or parallel checklists) — a real possibility given how deliberately the human scoped *this* decision to sequential-only — `confirmationSlot`'s derived, ascending-order rule must become real state (or a named ordering strategy); that is the point this stops being "simple case." If a future SPEC persists `roleSlots[1]`/`roleSlots[2]`/`compareMode` (reversing spec 036's session-only constraint), `PersistedState`'s singular `confirmedSkillKeys`/`confirmedFingerprint` must become per-slot then — not now (Q2).

```markdown
[FORCES]
1. Preserve spec 038a's per-instance-isolation-by-construction guarantee (reuse the existing generic per-panel API unchanged) > introducing any new cross-panel or shared confirmation state
2. Sequential, one checklist at a time, as the human explicitly decided > any convenience of showing all N at once or merging them into one vocabulary
3. Reuse and collapse existing code (one `submitResume` fan-out, reuse `handleConfirmSkills` for slot 0 verbatim) > duplicating logic per mode
4. Simplicity > Pattern purity
```
