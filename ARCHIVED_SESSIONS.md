# ARCHIVED_SESSIONS.md — Session History Archive

> Protocol (AGENTS.md): this file holds archived sessions moved out of
> [SESSION_STATE.md](SESSION_STATE.md) once it exceeds 150 lines or 5 historical sessions.
> Access this archive only when necessary to trace past implementation history or decisions.

## Archived Sessions

### 2026-07-22 — Ingest, arbitrage score, and role-picker matrix (specs 001–003)

- Reviewed the full repo against the multi-agent orchestration pipeline; ported missing
  `.claude/skills/`, `.claude/hooks/`, and two dangling handoff schemas from the seed repo.
  Committed `26e8d74`.
- **`specs/001-ingest-pipeline.md`** (7 tasks, complete): parse → normalize → join/corroborate/
  role-profile → Supabase schema (`skills_core`, `skill_role_profile`) + idempotent loader → docs
  reconciliation (139→141, 147→148, real drift found against the raw CSVs). `supabase-py` added
  as the one authorized dependency. Committed through `4d2e323`.
- **`specs/002-arbitrage-score.md`** (5 tasks, complete): `compute_arbitrage_score` → real
  `skill_arbitrage_scores` table + `arbitrage_scores` view + idempotent loader → README
  reconciliation. Live Supabase smoke test passed (RLS, exact row counts 141/450/141 against a
  real DB). Committed through `155c2ed`.
- **`specs/003-role-picker-matrix.md`** (7 tasks + one amendment, complete, live-verified) — MVP
  step 3, the first-ever frontend work: direct-to-Supabase client-side reads via the anon key (no
  backend API tier), new `role_skill_arbitrage` view, React/Vite/TS scaffold, a role picker →
  `fetchRoleSkillProfile` → accessible quadrant scatter (`SkillMatrix`) + arbitrage ladder
  (`ArbitrageLadder`) + accessible `<table>` fallback (`SkillDataTable`), all WCAG 2.2 AA (non-
  color shape encoding, keyboard-operable points, zero axe violations, reduced-motion respected),
  no charting dependency. 28/28 tests green. Notable mid-build fixes: RLS had only ever been
  enabled manually (never migrated) until Task 2 caught it; a global Testing Library `cleanup` was
  missing from the test harness (fixed, `ed7718c`) after Cypress found accumulating DOM renders
  corrupting accessible names. Final commit `f89fb5b`.
- **Live browser verification of spec 003, completed**: dev server started (`npx vite --port
  5173`) to visually verify Task 7's matrix against live Supabase data; verified via user-supplied
  screenshots (Claude in Chrome not connected in this environment). Confirmed working: role
  picker, quadrant scatter with distinct point shapes (non-color encoding holds), full skill
  table, arbitrage ladder ranked descending with unscored skills pushed last and flagged. Bug
  found and fixed (`f653ce4`): `.ladder-item`'s CSS grid had 3 explicit column tracks for 4
  children — score wrapped instead of sitting inline; fixed with a 4th `5rem` track + right-align.
  Raw unrounded score floats also overflowed — added `frontend/src/lib/format.ts` (`formatNum`,
  `Math.round(v*100)/100`, deliberately not `toFixed(2)` to match a frozen test expecting `"7.3"`
  not `"7.30"`). Re-verified via a second round of screenshots. User populated `frontend/.env`
  with real credentials; `frontend/.env.example` deleted from disk intentionally (`298efa3`).
  `screenshots/` added to `.gitignore` (manual scratch artifacts, not repo content).

### 2026-07-22–23 — Template narrator, deterministic-extraction pivot, and full live verification
(specs 004–006, README MVP scope complete)

- **`specs/004-resume-gap-layer.md`** (6 tasks, complete): README MVP step 4, LLM-based resume
  extraction via a Supabase Edge Function proxying OpenRouter (`google/gemma-4-31b-it:free`).
  Live verification was blocked for a while on a confirmed, persistent upstream free-tier rate
  limit — root-caused empirically (secret typo and an OpenRouter privacy-toggle gotcha were real
  but not *the* blocker; isolated scratch-script testing found the actual `429`). **Fully
  superseded later this session by spec 006** — the user reversed course and dropped LLM
  extraction entirely rather than mitigate the rate limit.
- **`specs/005-template-narrator.md`** (6 tasks, complete, `b1c7371`…`4e1f42d`): README MVP step
  5, deterministic template narration (`narrateTopGap()`) replacing the originally-planned LLM
  narrator — every fact the rationale needs was already computed by this stage. Appended
  `salary_premium_pct`/`median_days_open` to the `role_skill_arbitrage` view (migration 0004);
  built a pure function with a fixed five-step tie-precedence chain and a `formatNum`-based
  tolerance rule (never raw `===`); wired a new `TopGapNarration` component into `App.tsx`. All 6
  tasks passed on the first try, zero rejection-loop cycles.
- **User decision: abandon spec 004's LLM extraction, go fully deterministic**, completing the
  zero-LLM pivot spec 005 started. **`specs/006-deterministic-extraction.md`** (5 tasks, complete,
  `835c269`…`90fa085`): rewrote `resumeSkills.ts` as a pure, synchronous, vocabulary-scoped regex
  matcher (lookaround-based word-boundary matching, regex-escaped vocabulary, a fixed
  `NEGATION_CUES` list scanned in a clause-bounded window, longest-first overlap resolution
  fixing a real `C`/`C#` false-merge trap Cypress caught). Two regressions from the original
  rejection were mitigated with honestly-documented residual limits, not claimed solved: a
  single-letter entry like `r` still false-matches inside `"R&D"`; a negation cue outside the
  scan window still slips through. Deleted the now-dead edge function and removed `zod`. Docs
  (`README.md`/`AGENTS.md`) reconciled first to state the app makes **zero LLM calls anywhere**
  — first such state since spec 001. All 5 tasks passed on the first try, zero rejection-loop
  cycles, committed and pushed individually per the user's explicit instruction.
- **Housekeeping pass**: fixed two pre-existing lint items flagged-but-deferred across specs
  004–006 (unsorted imports, a scoped E501 exemption for CSV-fixture literals); found and deleted
  a real gap spec 006 left behind — `tests/test_extract_resume_skills_function.py` characterized
  the now-deleted edge function's source and was silently erroring on every run once that source
  was gone. Whole tree confirmed green: `ruff` all-pass, 218/218 pytest, 104/104 vitest, `eslint`
  clean.
- **Live verification, completed end-to-end for the first time.** No Claude-in-Chrome connection
  in this environment, so verification ran via user-supplied screenshots. Found and fixed a real
  live-environment gap along the way: migration 0004 (spec 005) had only ever been structurally
  test-verified, never actually applied to the live Supabase database — surfaced as a live
  `column role_skill_arbitrage.salary_premium_pct does not exist` error. Gave the user the exact
  SQL to run via the Dashboard SQL Editor; independently confirmed the fix via a direct REST query
  against the live view before asking the user to retry. Final screenshots confirmed the full
  primary flow working live: role picker → resume paste → deterministic extraction (correctly
  affirming "ai"/"llm" from the resume text while correctly leaving "llms" as a gap, demonstrating
  the exact-match-only design decision holding on a real resume) → have/gap rendered with
  non-color badges on the matrix/ladder/table → a real, auditable top-gap narration citing actual
  arbitrage-score numbers. **README's full 5-step MVP scope is code-complete and live-verified,
  with zero LLM calls anywhere.**
- Also added `screenshot/` (singular) to `.gitignore` alongside the existing `screenshots/` entry
  — the new folder had a real resume with real PII in it, exactly what the project's Zero-Trust
  posture says should never land in the repo.
