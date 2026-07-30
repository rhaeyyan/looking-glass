# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-30 (round 24: spec 034, local persistence)

- Session opened with a senior-career-changer review of the app (no code changes); human approved
  5 improvement candidates and had Pine route all five (2 INVARIANT→Cedar SPEC, 1 UNKNOWN→Cedar
  SPIKE, 1 OBSERVABLE→straight to builders, and #5 local persistence, also INVARIANT — the
  security-isolation gate in CLAUDE.md explicitly names "resume persistence" as a V2 trigger for
  re-assessment).
- Cedar wrote spec 034 (persist `resumeText`/`selectedRole` in one versioned `localStorage` key,
  recompute gaps from the live Supabase view on rehydrate rather than caching derived results,
  explicit "Clear saved data" control). Human asked to also fold in `selectedSeniority` (spec 029)
  before approving; Cedar revised in place (whole-object validation, same `v1` key — not bumped,
  since nothing had shipped yet). Persisted to `specs/034-local-persistence.md`.
- Cypress red: 3 new test files (`localPersistence.test.ts`, `App.persistence.test.tsx`,
  `e2e/persistence.spec.ts @ desktop-light`), confirmed failing for the right reason.
- Redwood green: new `localPersistence.ts` + `App.tsx` wiring. Flagged and disclosed a 6th touched
  file (`App.test.tsx`, `+localStorage.clear()` in `beforeEach`) beyond the SPEC's 5-file cap —
  human accepted the overage as a genuine, disclosed test-isolation fix rather than scope creep.
  Also caught and fixed a real StrictMode double-invoke race (two-effect design → lazy `useState`
  initializers) that only the Playwright oracle exposed, not vitest.
- Cypress audit **PASS** — re-ran every oracle independently rather than trusting Redwood's
  numbers; specifically reproduced the StrictMode claim empirically (3 consecutive reloads, no
  drift) and verified the `App.test.tsx` line fixes real contamination (temporarily removed it,
  got 6 genuine failures, restored it). Zero critical violations; 2 non-blocking recommendations
  (a SPEC wording tightening, an optional dedicated fetch-once assertion) — not actioned this round.
- Full suite green: 746/746 vitest, 67 passed/9 expected-skipped e2e (all 4 profiles), tsc/eslint
  clean. Ready to commit.
- Dispatched Cedar on recommendation #4 (multi-role comparison). Reading the post-spec-034 code,
  Cedar found the isolation risk Pine flagged was real (`App.tsx`'s helpers write into flat
  top-level state, no per-role key — 3 parallel calls today would race on network order) and split
  it into two sequential SPECs: **035** (`useRolePanel` hook + `RoleResultsPanel`, isolation proven
  by construction via distinct closures, zero visible change) and **036** (the actual compare-mode
  UI on top of it, no cross-role aggregate score). Human approved both, chose to land the
  never-started **spec 033** first (033/035 both touch `App.tsx`), and approved cutting persistence
  for compare-mode's extra slots out of round 1. Persisted to `specs/035-*.md`/`036-*.md`.
- Picked the spec 033 thread back up: re-ran spec 032's audit from scratch (the round-23 attempt
  had hit a session limit, no verdict) — **PASS**, verified chrome-only against the actual
  historical diff, not just the SPEC's claim. Cypress red → Magnolia green for spec 033 (Standing +
  Evidence two-card assembly, FilterStatusBar wired in).
- Magnolia's build surfaced a real cross-spec collision: FilterStatusBar's live region and the
  no-gaps narration live region both bare `role="status"`, indistinguishable once mounted together
  — a genuine WCAG gap, not a stale-test artifact. Correctly halted rather than guessing a fix
  outside its file scope. Dispatched Cedar for a follow-up SPEC (renumbered 034→**037**, since 034
  was already taken by the persistence feature); approved, built (two `aria-label`s), and audited
  together with 033 in one combined pass — **PASS**, 746/746 vitest, 87 passed/9 expected-skipped
  e2e, zero scope drift confirmed via `git diff`.
- Both committed/pushed separately as recommended (`b5a0e2e` code, `7f11459` specs-only). Re-checked
  spec 035 against the now-landed post-033/037 `App.tsx` before dispatching further — Cedar's
  original draft described a flat layout that no longer existed; revised in place to target the
  actual Standing/Evidence two-card shape and to preserve spec 037's two `aria-label`s verbatim.
  Flagged a forward-pointer for spec 036: those same labels will collide again once 2-3 panels
  mount at once, unless 036 qualifies them per-panel — noted now so it isn't rediscovered as a
  fresh a11y bug during that audit.
- Cypress red → Redwood green for spec 035 (`useRolePanel` + `RoleResultsPanel` extraction, isolation
  proven by construction via per-instance closures + a request-generation guard). Cypress resolved
  one API ambiguity itself (`role` seeds the hook's *initial* value only; changes go through the
  hook's own `loadRole()`, never a re-render with a new `role` prop) and flagged it explicitly for
  Redwood rather than silently encoding it — Redwood read the test and agreed, no conflict.
  749/749 vitest, 87 passed/9 expected-skipped e2e, tsc/eslint clean.
- Redwood surfaced one pre-existing (not newly introduced) race: reloading with a persisted
  role+resume, then manually switching role in the narrow window before the mount-hydration fetch
  resolves, can burn the one-shot post-hydration auto-submit against the wrong role — the restored
  session silently doesn't auto-analyze as intended (user just re-clicks "Find my gaps"). Decided
  **not to chase it now**: unreproduced, so per this project's own routing rules it's UNKNOWN, not
  fix-ready — a future SPIKE should produce a reproduction (a test that deliberately races the two
  events) before anyone specs a fix. Left out of spec 035's audit scope; not a regression.
- Spec 035 audit **PASS** (hand-traced the isolation guard rather than trusting the test; confirmed
  the pre-existing hydration race really is pre-existing by tracing it into the old code too).
  Committed/pushed (`ecb46e0`).
- Cedar's spec-036 revision pass (as flagged) found a real bug in its own original draft, not just
  the anticipated a11y gap: `useRolePanel(roleSlot[i])`'s argument only seeds state once
  (`useState(initialValue)`) — as originally drafted, slots 1/2 would never have actually refetched
  on role change. Fixed by routing every slot's role change through that slot's own `loadRole()`,
  mirroring `handleRoleChange`'s pattern. Also expanded the accessible-name fix beyond the two
  originally-flagged labels — found 2 more colliding `role="status"`/`"alert"` elements in `App.tsx`
  itself, plus added a `<section aria-label>` landmark wrapper to address a broader
  heading-duplication issue spec 037's narrow fix didn't cover. Human approved as-is.
- Cypress red → Magnolia green for spec 036 (Compare-mode toggle, up to 3 role-slot panels, one
  shared resume). Magnolia found and fixed one real, unrelated bug en route: a stray `*/` inside a
  `matrix.css` comment was silently truncating CSSOM parsing for everything after it in the file —
  invisible to vitest/jsdom (never parses CSS), only caught by checking real Chromium rendering.
  3/24 e2e failures traced to a strict-mode locator ambiguity in Cypress's own test (a skill name
  legitimately renders in 5 elements per panel); sent back to Cypress, who scoped the locator to
  `SkillLeverageTable`'s unique `role="rowheader"` — fixed without touching implementation.
- Combined audit **PASS**: 749/749 vitest, 119 passed/9 expected-skipped e2e (re-confirmed fresh in
  this checkout after a stop-hook prompt), zero regression across specs 033-037's e2e suites, zero
  Bounded-AI/security concern. One non-blocking finding, explicitly out of scope: an ad hoc
  `axe-core` spot-check found a pre-existing `scrollable-region-focusable` violation on
  `SkillLeverageTable`'s scroll wrapper (present in both compare and single-panel mode, not a
  regression, outside this task's file scope) — worth a future ticket.
- Spec 036 committed/pushed (`5c76d6b`). Dispatched Cedar on recommendation #2 (effort/
  time-to-competency tag). Cedar checked every accepted and previously-rejected dataset for a
  learning-duration/difficulty signal and found none — D1/D2/D3 measure hiring-market demand and
  scarcity only, and D1's `median_days_open` (the closest near-miss) measures hiring friction, not
  learning difficulty, and can't be used as a proxy without conflating the two. Refused to
  fallback to a hand-curated table (e.g. "Kubernetes = 3 months"), reasoning that a human-authored
  guess violates the same "every number traceable to real data" identity as an LLM-guessed one
  would. **Verdict: REJECTED, no SPEC, no code** — same resolution pattern as the dropped Coursera
  and arshkon evaluations. Appended to `data/dataset-evaluations.md`.
- **Next**: commit the dataset-evaluations.md addition (docs-only). Recommendation candidates #1
  (manual "confirm your skills" checkbox, OBSERVABLE) and #3 (deepen weak-coverage-role data,
  UNKNOWN/SPIKE) from the original career-changer review are still unstarted. The
  `scrollable-region-focusable` finding on `SkillLeverageTable` (found during spec 036's audit) is
  a candidate for a small follow-up ticket whenever picked up.

---

## History

- **2026-07-28 (round 23: results-column restructure, specs 030-032)** — `feature/v2-scope-expansion`
  merged to `main` via PR #1 before this session. User pointed at
  `assets/design_handoff_v2_results_column/` (option 1b: collapse results column's four cards into
  two — Standing + Evidence). Cedar split into 4 sequential SPECs (030→033), overriding the
  mockup's color-only chip selection on a11y grounds (spec 031 mandates a non-color glyph). Spec
  030 (`FilterStatusBar`): red→build→audit all PASS (`cf97870`, `3cdbc9e`). Spec 031 (chip row +
  `selectedGroup` single-source-of-truth): red proved a real landmine (`SkillGroupBreakdown` held
  its own local `useState` independent of `App.tsx`'s), audit PASS (`487e3c4`, `9d29db5`). Spec 032
  (strip `SkillMatrix`/`SkillLeverageTable` own card chrome): build clean (143/143, 722/722),
  committed (`16ec6a8`, `48e8f2b`) but **audit never finished** — Cypress hit a session API limit
  mid-run. Spec 033 (App.tsx two-card assembly) not started. Strict dependency order (nothing in
  030-033 parallelizable) still applies if resumed.

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
