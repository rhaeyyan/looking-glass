# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22 (Ingest, arbitrage_score, and role-picker skeleton built and verified live)

### Accomplished
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

### Session addendum — live browser verification of spec 003, completed
- Dev server started (`npx vite --port 5173`, backgrounded) to visually verify Task 7's matrix
  against live Supabase data. Claude in Chrome extension not connected in this environment, so
  verification was done via user-supplied screenshots (Backend and Full Stack roles) instead of
  driven browser automation.
- **Confirmed working**: role picker, quadrant scatter with distinct point shapes (circle/
  triangle/square/diamond — non-color encoding holds), full skill table, and the arbitrage ladder
  correctly ranked descending with unscored skills (`ai`, `css`, `spring boot`, etc.) pushed last
  and flagged "Demand only, scarcity unknown."
- **Bug found and fixed** (`f653ce4`): `.ladder-item`'s CSS grid had 3 explicit column tracks for
  4 children (rank/name/track/score) — score wrapped to its own line instead of sitting inline at
  the bar's end. Fixed by adding a 4th `5rem` track + right-align. Separately, raw unrounded score
  floats (e.g. `291.323333333333`) overflowed that column and forced horizontal scroll — added
  `frontend/src/lib/format.ts` (`formatNum`, round-to-2dp presentation transform, Bounded-AI safe)
  used by `SkillDataTable`, `ArbitrageLadder`, and `SkillMatrix`'s point labels. Deliberately NOT
  `toFixed(2)` — that would render `"7.30"` and break the frozen Task 5 characterization test
  expecting `"7.3"`; used `Math.round(v*100)/100` instead to match. Re-verified via a second round
  of user screenshots: numbers now short and inline, no clipping. Full suite still 28/28 green.
- User populated `frontend/.env` with real credentials. In the process, `frontend/.env.example`
  (the committed placeholder template, no real secrets) was deleted from disk — user confirmed
  intentionally; deletion committed (`298efa3`).
- Ad-hoc verification screenshots landed in `screenshots/` — deliberately kept out of the repo as
  manual scratch artifacts; added `screenshots/` to `.gitignore` so this stops surfacing as
  uncommitted-changes noise every session-end check.

- **`specs/004-resume-gap-layer.md`** (6 tasks, approved by human): Cedar's SPEC for README MVP
  step 4 — first LLM-in-the-loop slice. Three forced decisions approved: (1) a new Supabase Edge
  Function (`extract-resume-skills`) proxies Claude server-side via a project *secret*
  (`ANTHROPIC_API_KEY`, never a `VITE_*` var) — rejected calling Claude directly from the browser
  as a Zero-Trust violation; (2) V1 skill-matching is exact-normalized-match only, no fuzzy/alias
  (per README's explicit V1 scope); (3) have/gap threaded as an additive `haveSkillKeys:
  Set<string>` prop on the existing three matrix components, no new pattern earned yet. New
  runtime dep approved: `zod`. Persisted; Tasks 1–6 authorized.
  - **Task 1** (Redwood, SPIKE, `b761f54`): built the repo's first Supabase Edge Function
    (`supabase/functions/extract-resume-skills/`) calling Claude server-side via forced tool-use.
    Caught and fixed a hallucinated model ID (`claude-opus-4-6` doesn't exist) on review.
  - **Provider switch, mid-Task-1**: user chose OpenRouter (`google/gemma-4-31b-it:free`, verified
    real via web search — released after this assistant's Jan-2026 cutoff) over Claude, for both
    extraction and future narration. Updated `AGENTS.md`/`README.md` first (`2687b5f`), had Cedar
    write a surgical amendment rather than let Redwood freelance it (`6a9a0c0`), Redwood
    implemented (`d0b8670`) — endpoint/secret-name/auth-header/tool-call-shape all changed, CORS/
    validation/statelessness untouched; diff-verified, not just self-report-trusted.
  - **Task 2** (Cypress, `25d561a` + spec reconciliation): characterization tests written against
    the real OpenRouter implementation, not the spec's stale Claude-era prose — 26/26 passing
    (independently re-verified), full suite 208 passed/16 skipped. Spec file's Task 2 section
    rewritten to match reality.
  - Edge function still undeployed, no live secret set (deploy steps in its README for the human).
- **Task 3** (Cypress, RED): failing tests for `extractResumeSkills()` and `computeSkillGap()`
  (`frontend/src/lib/{resumeSkills,gap}.test.ts` + `test/fixtures/resumeSkills.fixture.ts`) — both
  suites fail on module-not-found (correct RED reason), 28 pre-existing tests still pass
  (independently re-verified in the main session). Committed `5dad61a`. **Contract Redwood must
  honor in Task 4**: `extractResumeSkills(resumeText): Promise<string[]>` in
  `frontend/src/lib/resumeSkills.ts`, calling `supabase.functions.invoke('extract-resume-skills',
  ...)`, Zod schema `z.object({ skills: z.array(z.string()).max(200) })`, throwing a named
  exported `ExtractionSchemaError` (not a bare `Error`) on schema failure.
  `computeSkillGap(rows, resumeSkills): { haveSkillKeys: Set<string>; rows: RoleSkillRow[] }` in
  `frontend/src/lib/gap.ts`, pure/no I/O, `haveSkillKeys` keyed by
  `row.skill_key ?? normalizeSkillName(row.skill_name_raw)`. `normalizeSkillName()` in
  `frontend/src/lib/normalize.ts` must mirror `src/ingest/normalize.py` exactly (lowercase,
  collapse whitespace/`/`/`-`/`_`, keep `#`/`+`/`.`, no alias expansion). Output row order must
  reuse `ArbitrageLadder`'s exact null-scores-last descending-`arbitrage_score` sort — not a second
  drifting implementation.
- **Task 4** (Redwood, GREEN): built `frontend/src/lib/{resumeSkills,gap,normalize}.ts` +
  added `zod` (^3, the one authorized dependency) to `frontend/package.json`. Contract verified
  against the actual code, not just the report: `normalizeSkillName`'s regex
  (`/[\s/_-]+/g`) matches `src/ingest/normalize.py`'s `_SEPARATOR_RUN_RE` exactly, and `skill_key`
  is confirmed (`role_profile.py`) to already be `normalize_skill(skill_name_raw)`, so comparing it
  directly against a normalized resume skill (no double-normalization) is correct.
  `computeSkillGap` reuses `ArbitrageLadder`'s literal `byArbitrageDesc` function, zero score
  computation. 49/49 tests pass (28 pre-existing + 21 new), independently re-verified. Committed
  `cc819b5`.
- **Task 5** (Cypress, RED, `e611f4e`): extended `App.test.tsx`/`SkillMatrix.test.tsx`/
  `ArbitrageLadder.test.tsx` with failing tests for the resume-paste flow + have/gap rendering — 49
  pre-existing tests still pass unmodified, 18 new tests fail for the right reason (independently
  re-verified: 53/71 passing). **Contract Redwood/Magnolia must honor in Task 6**: additive
  optional `haveSkillKeys?: Set<string>` on `SkillMatrix`/`ArbitrageLadder`/`SkillDataTable`
  (byte-identical rendering when omitted); when provided, each item gets `data-have="true"|"false"`
  + a visible `data-testid="have-flag"` reading `"Have"`/`"Gap"` + an accessible-name suffix
  (`", you already have this skill"` / `", gap — you do not have this skill yet"`), layered on top
  of the existing shape encoding — never color-only; `SkillDataTable` gets a text `<th>` matching
  `/have.*gap/i`. `App.tsx`: textarea accessible name `"Resume text"`, submit button `"Find my
  gaps"`, inline `role="alert"` validation (no role selected / empty resume — blocks the call),
  `role="status"` `"Extracting skills from your resume…"` while pending, `role="alert"` on failure
  (app + role profile stay visible).

### Unfinished / Blocked
- **specs/003 fully complete and live-verified.**
- Task 7's matrix currently encodes color as reinforcement only (no have/gap field on
  `RoleSkillRow` yet). Step 4's resume matching is where the have-vs-gap color+shape binary gets
  wired in.
- `@types/jest-axe` still not authorized/added — the frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` (does not affect vitest/runtime). Revisit with
  Cedar if a types dep is wanted.
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- Two pre-existing lint items flagged but out of scope where found: long-line (`E501`) warnings
  in `tests/test_ingest_parse.py`, unsorted imports in `tests/test_skill_core_join.py`.

### Next Steps
- Continue `specs/004-resume-gap-layer.md`: **Task 6** (Magnolia, GREEN, final task) — wire the
  resume textarea/submit into `App.tsx` and thread `haveSkillKeys` through
  `SkillMatrix`/`ArbitrageLadder`/`SkillDataTable` per Task 5's frozen contract (above). Must
  invoke `dataviz` + `a11y-sec-2026` skills first, same as spec 003's Task 7. Completes spec 004.
- The edge function is still undeployed — no live secret set. Deploy + manual verification steps
  are in `supabase/functions/extract-resume-skills/README.md` for the human to run whenever ready
  (not blocking Task 6, which mocks the extraction call in tests).
- Optional cleanup someday: fix the lint hook's node/nvm PATH resolution; consider `@types/jest-axe`.
