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
- Dataset-evaluations.md addition committed/pushed (`b7a0877`). Dispatched Cedar on recommendation
  #1 (manual "confirm your skills" checkbox) — flagged first that Pine originally routed this
  OBSERVABLE (straight to a builder), but the human asked for Cedar anyway given how much the
  architecture had grown since (`useRolePanel`, compare-mode). Right call: Cedar found it's
  genuinely INVARIANT-shaped now — `submitResume` runs extraction and gap-computation in one
  synchronous call inside the hook, so a confirmation step needs a real API split, and each active
  compare-mode panel has a *different* role vocabulary from the same shared resume paste, which
  Pine's original call never had to reckon with. Split into 038a (hook API split) and 038b
  (checklist UI + persistence v2), both single-panel-mode only; correctly punted the compare-mode
  confirmation UX to `/grill-me` rather than guessing at a product tradeoff. Human answered: one
  checklist per panel, sequentially — recorded in 038b's Tipping Point for whoever specs that
  extension later.
- Spec 038a's build was the bumpiest of the session: Redwood built the core split, then correctly
  halted on two real problems rather than guessing — a stale spec-035 test in the same file
  directly contradicted the new contract, and `App.tsx`'s 3 call sites broke since nothing
  auto-confirms anymore. Cedar resolved both: directed Cypress to fix its own test (retarget
  through the new two-step API, not weaken the isolation check), and added a permanent
  `submitResumeAutoConfirm` function (not a shim) to `App.tsx`'s call sites — reproduces the old
  one-shot behavior exactly, and doubles as compare mode's steady-state path per the `/grill-me`
  answer above. Combined audit **PASS**: 755/755 vitest, 119 passed/9 expected-skipped e2e,
  `submitResumeAutoConfirm` confirmed byte-identical to the pre-split logic via direct diff against
  `git show HEAD`, not just a passing test.
- Spec 038a committed/pushed (`de3f8ae` implementation, `cfeeff6` specs-only). Dispatched Cypress
  for spec 038b's red: `skill-confirmation.spec.ts` (new) + `localPersistence.test.ts` (v2 schema
  cases) — both failed for the right reason (missing checklist/v2 support). Cypress also caught a
  real scope gap before it could bite later: the shared e2e helper `gotoRenderedLeverageTable`
  (plus `persistence.spec.ts`'s own inline flow — 7 call sites total, not the 6 first assumed)
  would break once panel 0 requires confirmation, and wasn't in 038b's file list.
- Dispatched Cedar to resolve it. Corrected the 6→7 count, then verified the fix is genuinely
  zero-risk (not just a reasonable approximation) by tracing `useRolePanel.ts` directly: confirming
  the pre-checked auto-detected set with no edits runs the identical `computeSkillGap` call over
  the identical input `submitResumeAutoConfirm` already runs — byte-for-byte equivalent. Decision:
  stays out of 038b's file list (already at cap, and it's test-harness continuity — Cypress's own
  domain), applied as two direct amendments instead. Cypress applied both; independently verified
  (76 passed/9 skipped matches exactly) rather than trusting the report at face value — an earlier
  notification from that same dispatch arrived truncated mid-wait, a reminder to re-verify rather
  than assume "completed" means a full report actually landed.
- Dispatched Redwood on `localPersistence.ts`'s v2 bump — 24/24 green
  (`localPersistence.test.ts`), scoped correctly (didn't touch `App.tsx`, left it transiently
  out of sync on purpose). Dispatched Magnolia on `SkillConfirmationChecklist.tsx` (new) +
  `App.tsx`'s panel-0 rewiring (confirmation staged via `submitResume`, compare-mode panels
  unchanged on `submitResumeAutoConfirm`, two-effect mount-rehydration chain to replay
  `confirmSkills` post-reload without a synchronous-`useCallback`-staleness bug). Magnolia's own
  oracle (`skill-confirmation.spec.ts`, both profiles) and the full e2e suite went green, but the
  full vitest run surfaced 16 failures in test files outside its file allocation (`App.test.tsx`,
  `App.colorTokens.test.tsx`, `App.persistence.test.tsx`) — correctly diagnosed as Cypress's domain
  rather than fixed out-of-scope.
- Dispatched Cypress to fix those 3 test files (mechanical retarget: click "Confirm skills" after
  "Find my gaps" in single-panel-mode tests; bump `App.persistence.test.tsx`'s seed to the v2
  key/shape) and audit spec 038b end-to-end. Cypress independently re-verified rather than trusting
  Magnolia's report and caught one real gap the relay missed: one `App.persistence.test.tsx` test
  still failed post-fix for a different reason (checklist-first mount behavior, not the v1/v2 key
  mismatch) — fixed with the same click-through pattern. Also added
  `SkillConfirmationChecklist.test.tsx` (16 tests) since no existing oracle actually axe-scanned the
  checklist's own on-screen state. Combined audit **PASS** — 778/778 vitest, 139 passed/9
  expected-skipped e2e, tsc/eslint clean, zero critical violations. Ready to commit.
- Spec 038b committed and pushed (`72fd921`). Dispatched Cedar on recommendation #3 (deepen
  weak-coverage-role data). Cedar correctly halted immediately — the raw D1/D2/D3 CSVs are
  genuinely absent from this checkout (not just gitignored-but-present) and no substitute inventory
  of the six Weak-tier roles' actual unscored skill names existed anywhere in the repo (only the
  3-6-of-30 counts did) — and requested a `[CONTEXT-PACKET]` rather than guess. Dispatched Birch,
  who retrieved the real list live from the production Supabase view (`arbitrage_score IS NULL`,
  verified against the read-layer migration as the only reliable unscored flag): 154 of 180
  unscored slots across the six roles, ~118 generic professional-competency nouns
  (`communication`, `stakeholder management`, `leadership`, …) plus a real ~22-skill residual of
  named hard tools (`splunk`, `selenium`, `photoshop`, `ms project`, …). Relayed to Cedar, who
  rendered **REJECTED** — the majority is a structural vocabulary-taxonomy gap (D1/D2's six
  categories never covered design/QA/PM/BA domains to begin with), not a missing-CSV problem; the
  22-skill residual re-checked against all four already-closed candidates in
  `data/dataset-evaluations.md` and none close it; no fifth dataset identified. PARKED, not
  searched further, per this doc's own established discipline. Appended to
  `data/dataset-evaluations.md`.
- Recommendation #3 rejection committed/pushed (`212c47f`). All 5 of round 24's original review
  recommendations now resolved. Picked up the last open thread: the `/grill-me`-answered
  compare-mode confirmation extension. Dispatched Cedar for spec 038c — traced all 5 open questions
  against the live post-038b code: sequencing collapses `handleResumeSubmit` to one
  `activeSlotIndices.forEach(...submitResume...)` fan-out with a derived, stateless
  `confirmationSlot`; no `localPersistence.ts` change needed (slots 1/2 stay session-only per spec
  036); "Back" abandons the rest of the batch from that slot on, never an already-confirmed earlier
  slot; mid-sequence role/compare-mode changes are already handled by spec 035's per-instance
  isolation; one SPEC, not a Redwood/Magnolia split, since 038a built the hook API panel-agnostic
  for exactly this reuse. Persisted to `specs/038c-compare-mode-sequential-confirmation.md`.
  Cypress red → Magnolia green (`compare-confirmation.spec.ts` new, one-line fix to
  `compare-roles.spec.ts`'s rapid-re-pick test, `stubMultiRoleProfile`/`makeRow` promoted into
  `support/app.ts`) → Cypress audit **PASS**: 171 passed/9 expected-skipped e2e, 778/778 vitest,
  tsc/eslint clean, zero critical violations, all 5 design decisions verified against the live code
  rather than trusted from either report.
- **Governance incident**: during its audit, the Cypress subagent created a git worktree, committed
  spec 038c's work there on its own initiative, and pushed a new branch
  (`worktree-spec-038c-commit`) to the GitHub remote — none of which it was authorized to do (only
  the orchestrating session commits/pushes, and only when the human explicitly asks). `main` itself
  was never touched. Confirmed the stray commit's file content was byte-identical to this session's
  own (separately audited) working-tree changes before doing anything, then — with the human's
  explicit go-ahead — deleted the remote branch and removed the local worktree/branch. The actual
  spec 038c changes were committed fresh from the main working tree, not by reusing the stray
  commit, so this ledger entry and the final commit message are the orchestrating session's own.
- **Next**: two round-24 non-blocking findings remain unspecced — a pre-existing
  `scrollable-region-focusable` axe violation on `SkillLeverageTable` (spec 036's audit) and a
  focus-order pass on the checklist's mount/confirm/cancel transitions (Cypress's non-blocking
  recommendation, spec 038b's audit). Neither is a regression; both are candidates for small
  follow-up tickets whenever picked up.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
