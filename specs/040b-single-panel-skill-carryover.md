[SPEC] 040b — Single-panel wiring: carryover pre-check + auto-skip

- **Objective**: In single-panel mode (`compareMode === false`, slot 0), when
  `panels[0].submitResume` produces a new `pendingConfirmation`, check that role's full vocabulary
  against the 040a shared memory: if fully covered, skip the checklist entirely and go straight to
  computed results using the carried-over decisions (no checklist ever paints, not even for one
  frame); if partially covered, render the checklist as today but with every overlapping skill
  pre-checked/pre-unchecked per its carried-over decision instead of fresh auto-detection, falling
  back to auto-detection only for skills with no memory entry. Every real confirm (manual click OR
  auto-skip) records that role's full vocabulary of decisions back into the shared memory
  (last-confirmed-wins). The memory itself lives in `App.tsx`, `useState`-owned, never touching
  `localStorage`.

- **Inputs/Outputs**:
  ```ts
  // App.tsx — new imports from 040a's module:
  import {
    type ConfirmedSkillMemory,
    recordConfirmedDecisions,
    isRoleFullyCovered,
    deriveCheckedKeysFromMemory,
    mergeInitialCheckedKeys,
  } from './lib/confirmedSkillMemory'

  // New state (session-only — NEVER read/written by savePersistedState/loadPersistedState):
  const [confirmedSkillMemory, setConfirmedSkillMemory] = useState<ConfirmedSkillMemory>(() => new Map())

  // New state: the checklist's pre-check Set for each slot, cached so its OBJECT IDENTITY is
  // stable across unrelated App re-renders while a given pendingConfirmation is outstanding (see
  // Intellectual Control — this is load-bearing, not a style choice). A 2-element tuple, index-
  // matched to roleSlots/panels, so 040c's slot-1 addition is purely additive.
  const [checklistInitialKeys, setChecklistInitialKeys] =
    useState<[Set<string> | undefined, Set<string> | undefined]>([undefined, undefined])

  // handleConfirmSkills gains memory-recording. Captures `pendingConfirmation.rows` (the role's
  // FULL vocabulary the checklist represented) BEFORE calling confirmSkills, mirroring 038a's own
  // rationale for reading pendingConfirmation.rows rather than the live rows state.
  function handleConfirmSkills(checkedSkillKeys: Set<string>) {
    const rows = panels[0].pendingConfirmation?.rows ?? panels[0].rows
    panels[0].confirmSkills(checkedSkillKeys)
    setConfirmedSkillMemory((memory) => recordConfirmedDecisions(memory, rows, checkedSkillKeys))
    setConfirmedSkillKeys([...checkedSkillKeys])
    setConfirmedFingerprint({ resumeText, role: roleSlots[0] })
  }

  // New effect — MUST be useLayoutEffect, not useEffect (see Intellectual Control: a fully-covered
  // role must never paint its checklist even for one frame). Fires exactly once per NEW
  // pendingConfirmation instance for slot 0 — deliberately depends ONLY on
  // panels[0].pendingConfirmation's identity, NOT on confirmedSkillMemory, so a later, unrelated
  // memory update never re-fires this and yanks an already-open, possibly mid-edit checklist.
  useLayoutEffect(() => {
    const pending = panels[0].pendingConfirmation
    if (!pending) {
      setChecklistInitialKeys((prev) => (prev[0] === undefined ? prev : [undefined, prev[1]]))
      return
    }
    if (isRoleFullyCovered(confirmedSkillMemory, pending.rows)) {
      handleConfirmSkills(deriveCheckedKeysFromMemory(confirmedSkillMemory, pending.rows))
    } else {
      setChecklistInitialKeys((prev) => [
        mergeInitialCheckedKeys(confirmedSkillMemory, pending.rows, pending.autoDetectedKeys),
        prev[1],
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels[0].pendingConfirmation])
  ```
  Single-panel checklist JSX (the `!compareMode` branch): replace
  `autoDetectedKeys={panels[0].pendingConfirmation.autoDetectedKeys}` with
  `initialCheckedKeys={checklistInitialKeys[0] ?? panels[0].pendingConfirmation.autoDetectedKeys}`
  (the `??` fallback only ever covers the pre-layout-effect instant, never user-visible).

  `SkillConfirmationChecklist.tsx`: rename the prop `autoDetectedKeys: Set<string>` →
  `initialCheckedKeys: Set<string>`. **No other logic changes** — the component's own internal
  `checkedKeys` buffer, its `useEffect(() => setCheckedKeys(new Set(initialCheckedKeys)),
  [initialCheckedKeys])` re-sync, its mount-focus effect, and every other line stay byte-identical;
  only the prop name and its doc comment change (the comment's claim that pre-check state is
  "real deterministic extraction ... never re-derived or guessed here" is no longer accurate on its
  own — update it to note the value may now be sourced from carried-over confirmed decisions
  (spec 040b) as well as fresh extraction, a distinction this component deliberately does not know
  or care about).

  `SkillConfirmationChecklist.test.tsx`: mechanical find/replace of every `autoDetectedKeys={...}`
  prop usage → `initialCheckedKeys={...}`. Zero test assertions change — this is a pure rename
  across ~20 existing call sites; every existing PASS must stay a PASS.

- **Design Pattern**: none — simple case. The routing decision ("skip" vs. "merge-and-show") is a
  two-branch `if`, not a strategy family.

- **Bounded-AI boundary**: Zero LLM, zero new score/gap/join computation. `confirmSkills`'s call
  into `computeSkillGap` is unchanged — this task only changes which key set is handed to
  `confirmSkills` (memory-derived vs. checklist-edited) and whether the checklist paints at all;
  the scoring itself, in `gap.ts`, is untouched and unimported-differently.

- **Verification Oracle**: `frontend/e2e/cross-role-skill-carryover.spec.ts` (new, Cypress, red
  first) `@ desktop-light`, `@ mobile-touch-dark`. Use `stubMultiRoleProfile`/`makeRow` (promoted,
  `frontend/e2e/support/app.ts`) for compact fixture roles (e.g. `python`/`sql`/`docker` for role A,
  `python`/`aws`/`docker` for role B, `python`/`docker` for role C — a strict subset of A) with a
  resume text whose real `extractResumeSkills` output is computed at test-collection time (never
  hand-waved, matching `skill-confirmation.spec.ts`'s convention). At minimum:
  1. Submit role A's resume, edit the checklist (uncheck an auto-detected skill so it becomes an
     explicit "don't have," leave one never-mentioned skill unchecked too), confirm. Switch to role
     B (partial overlap — `aws` has no memory entry yet): assert the checklist STILL appears (not
     skipped), with the overlapping skills (`python`, `docker`) pre-checked/pre-unchecked per role
     A's carried-over decisions — **specifically**, if role B's resume text would auto-detect
     `docker` as present, assert it renders UNCHECKED anyway (role A's explicit "don't have" must
     win over fresh auto-detection — Done-means #3) — while `aws` (no memory entry) renders per
     fresh auto-detection.
  2. Confirm role B, then switch to role C (`python`, `docker` — both already decided by role A
     alone): assert NO checklist ever renders (`page.getByTestId('skill-confirmation-checklist')`
     stays at count 0 throughout, checked without a synthetic wait — the `useLayoutEffect` timing
     guarantee is what makes a zero-wait assertion meaningful here) and the results/leverage table
     appear directly, reflecting the carried `python=have`/`docker=don't-have` split.
  3. Multi-hop (Done-means #4): after confirming A (`python`) and B (`docker`-or-similar, a skill
     unique to B), switch DIRECTLY to a role whose vocabulary includes both the A-only-confirmed and
     B-only-confirmed skill (skipping neither is "the immediately previous role") and assert both
     carry over.
  4. Resume-edit survival (Done-means #6): after confirming role A, edit the resume textarea (do
     not change role), resubmit — assert role A's OWN vocabulary (now 100% memory-covered) still
     auto-skips regardless of the edit (this is the intended "permanent lock-in" consequence, see
     Edge Cases below); then, for a role with an undecided skill still in its vocabulary, show the
     resume edit DOES still affect that specific undecided skill's fresh auto-detection while the
     already-decided ones stay carried-over.
  5. Existing regression guard: `frontend/e2e/skill-confirmation.spec.ts` re-run unmodified and
     green (proves mount-time rehydration and the un-populated-memory first-visit path are
     byte-identical to pre-040b behavior). `frontend/src/lib/useRolePanel.test.ts` re-run unmodified
     and green (proves per-instance isolation is untouched).

- **UI Scope**: structural — the checklist's DOM presence itself now conditionally disappears for a
  fully-covered role switch; this is not a styling tweak to an unchanged layout.

- **Intellectual Control**:
  - **Why `useLayoutEffect`, precisely**: `useEffect` runs after the browser paints; a fully-covered
    role would therefore render the checklist for one real frame before the effect clears it —
    visually a flash, and impossible for Cypress to assert "never rendered" without a race-prone
    wait. `useLayoutEffect` runs synchronously after DOM mutations, before paint; React flushes any
    state updates scheduled *inside* a layout effect synchronously within that same pre-paint
    window, so the skip is genuinely invisible, not just fast.
  - **Why `confirmedSkillMemory` is excluded from the effect's own dependency array**: including it
    would re-run this check every time *any* confirmation anywhere updates the memory — including
    while THIS slot's own checklist is already open and being edited by the user, which would
    silently overwrite their in-progress edits or yank the checklist away mid-edit. Depending only
    on `pendingConfirmation`'s identity makes the check run exactly once per genuinely new draft,
    reading whichever memory value exists at that moment (still the latest, since the effect body is
    redefined every render — only the *re-fire trigger* is narrowed, not the value read).
  - **Why `checklistInitialKeys` must be cached, not computed inline in JSX**: `SkillConfirmationChecklist`'s
    own re-sync effect is keyed on this prop's object identity — if App.tsx computed
    `mergeInitialCheckedKeys(...)` fresh on every render (a new `Set` reference every time), the
    checklist would re-sync-and-wipe the user's in-progress checkbox edits on *any* unrelated App
    re-render (typing in the seniority picker, a sibling panel's fetch settling, etc.) — the exact
    stability bug class the component's own doc comment already warns about for
    `pendingConfirmation.autoDetectedKeys`. Computing it once, inside the layout effect, and storing
    it, preserves the pre-existing "only a genuinely new draft re-syncs" contract unmodified.
  - **Mount-time rehydration (`didRunMountConfirm`, pre-existing) is deliberately untouched and
    still calls `panels[0].confirmSkills` directly**, bypassing `handleConfirmSkills`'s new
    memory-recording. This is correct, not an oversight: seeding the cross-role session memory from
    a `localStorage`-restored confirmation would transitively violate "session-only, gone on reload"
    (Done-means #7). `confirmedSkillMemory` starts empty on every mount, unconditionally, regardless
    of what `localStorage` restores. Because it starts empty, this new layout effect and the
    pre-existing mount-hydration effect can never actually race on the very first `pendingConfirmation`:
    with an empty memory, `isRoleFullyCovered` is false for any non-empty role, so the new effect
    always falls into the "merge and show" branch (a no-op merge against an empty map, i.e. identical
    to today's raw `autoDetectedKeys`) and never auto-confirms ahead of the mount-hydration effect.

- **Constraints**: No new dependency. `frontend/src/lib/useRolePanel.ts`, `gap.ts`, `narrate.ts`,
  `resumeSkills.ts`, `localPersistence.ts` — untouched (out of scope, per the interview). "Clear
  saved data" (`handleClearSavedData`) is deliberately left untouched and does NOT reset
  `confirmedSkillMemory` — consistent with 038c's existing precedent that this button is scoped to
  slot-0/persisted state only and does not cascade into other session-only state (`roleSlots[1]`,
  `compareMode`). Compare-mode's slot-0 checklist (the separate JSX block inside the compare-grid,
  edited in 040c) is NOT touched by this task — it keeps passing the raw `autoDetectedKeys`-shaped
  value under whatever this task's renamed prop requires it to be called (i.e. 040c must update that
  call site too; until then it is a compile error to leave it on the old prop name, so 040c must
  land promptly after this task, per the Sequencing note). This task's new slot-0 `useLayoutEffect`
  DOES also incidentally fire in compare mode (it is unconditional on `compareMode`) — this is a
  documented, harmless, forward-compatible side effect, not a bug: compare-mode's slot-0 auto-skip
  already works correctly after this task alone, only the compare-grid's merged-pre-check-set prop
  wiring is deferred to 040c.

- **Edge Cases**:
  - **Zero-skill role**: `isRoleFullyCovered` is vacuously true for `rows = []`; the layout effect
    auto-confirms with an empty checked set, exactly matching the pre-existing (pre-040b) behavior
    for a zero-skill role's invisible `pendingConfirmation` — `.lg-results` still renders nothing for
    `rows.length === 0` today, unchanged.
  - **Permanent lock-in per visited role, deliberate**: once a role's full vocabulary has been
    confirmed once this session, that exact role will auto-skip the checklist for the REST of the
    session on every future visit — including after resume-text edits — because Done-means #6
    (memory survives resume edits) and #2 (full coverage gates the skip) combine to require exactly
    this. There is no in-session "forget a decision" affordance in scope; a full page reload is the
    only reset (Done-means #7). This is surfaced here explicitly so it is not later mistaken for a
    regression.
  - **Last-confirmed-wins** (closing the interview's own stated ambiguity): if the same skill key
    receives a different decision at a later confirm (e.g. via editing a checklist for a role
    visited a second time), the later confirm's value unconditionally overwrites the earlier one in
    `confirmedSkillMemory` — there is no merge/reconciliation between conflicting decisions for one
    key, only overwrite.
  - Re-submitting ("Find my gaps" again) for the SAME role/resume also runs this same check — it is
    not gated on "did the role actually change," and correctly subsumes both the role-switch case
    and the same-role-resubmission case with zero special-casing.

- **Files**: `frontend/src/App.tsx` (edit, Redwood), `frontend/src/components/matrix/SkillConfirmationChecklist.tsx`
  (edit, Magnolia — prop rename + doc comment only), `frontend/src/components/matrix/SkillConfirmationChecklist.test.tsx`
  (edit, Cypress — mechanical prop-name update), `frontend/e2e/cross-role-skill-carryover.spec.ts`
  (new, Cypress, red first).

- **Tipping Point**: If a future SPEC needs per-key "forget this decision" UI (undoing the
  permanent-lock-in Edge Case above), `confirmedSkillMemory` needs a removal function and a UI
  affordance — not in this SPEC's scope. If `App.tsx`'s per-slot state (`checklistInitialKeys`,
  the per-slot layout effects) grows past 2 slots (spec 039a's cap lifted), the hardcoded
  2-element-tuple/2-static-effect-call-site shape must generalize to an array indexed by
  `activeSlotIndices` — not attempted here, since only 2 slots exist today (Rules-of-Hooks already
  constrains this file to static, unconditional hook call sites per slot, exactly like `panel0`/`panel1`).

```markdown
[FORCES]
1. Zero visible flash / zero wiped in-progress edits (useLayoutEffect + cached, stable-identity pre-check Set) > the simpler-looking but incorrect "just compute it inline every render"
2. Preserve spec 035/038a's per-instance isolation (only the confirmed-key map is shared; rows/status/fetch-generation stay 100% per-panel) > any convenience of touching useRolePanel.ts
3. A confirmed decision (checked OR unchecked) is real, sticky user input for the rest of the session > convenience of only remembering positives
4. Simplicity > Pattern purity
```

**Sequencing note**: 040b lands after 040a (imports its module) and before 040c (both edit
`App.tsx`'s same state/functions — sequenced to avoid a merge conflict and because 040c's slot-1
effect pattern directly extends 040b's slot-0 one). No file overlap with 040a.
