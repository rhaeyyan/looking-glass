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
- **Next**: nothing blocking. Spec 032's audit (from round 23, 2026-07-28) was never re-run after
  hitting a session limit, and spec 033 (App.tsx two-card assembly) was never started — both still
  open from the prior round if that thread is picked back up.

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
