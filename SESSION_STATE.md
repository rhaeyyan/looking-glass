# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22 (Ingest, arbitrage_score, and role-picker skeleton built and verified live)

### Accomplished
- Reviewed the full repo against the multi-agent orchestration pipeline; ported missing
  `.claude/skills/`, `.claude/hooks/`, and two dangling handoff schemas from the seed repo;
  documented the orchestrator's role. Committed `26e8d74`.
- **`specs/001-ingest-pipeline.md`** (7 tasks, complete): parse → normalize → join/corroborate/
  role-profile → Supabase schema (`skills_core`, `skill_role_profile`) + idempotent loader →
  docs reconciliation (139→141, 147→148, real drift found against the raw CSVs). `supabase-py`
  added as the one authorized dependency. Committed through `4d2e323`.
- **`specs/002-arbitrage-score.md`** (5 tasks, complete): `compute_arbitrage_score` (demand_score
  = `d2_demand_pct` verbatim; scarcity_index = weighted composite with weight-renormalization on
  missing fields) → `skill_arbitrage_scores` table (real FK to `skills_core`) + `arbitrage_scores`
  view + idempotent loader → README reconciliation. Committed through `155c2ed`.
- **Live Supabase smoke test — passed.** Applied both migrations, enabled RLS, hit and fixed one
  real bug (`PGRST125` from a malformed `SUPABASE_URL`), then verified exact row counts
  (141/450/141) against a real (not mocked) database for the first time.
- **`specs/003-role-picker-matrix.md`** (7 tasks + one amendment) — MVP step 3, the first-ever
  frontend work in this repo:
  - Cedar resolved two forced decisions: direct-to-Supabase client-side fetching via the
    Publishable/anon key (no backend API tier, RLS is the real security boundary), and a new
    `role_skill_arbitrage` view (`skill_role_profile LEFT JOIN arbitrage_scores`) as the single
    auditable source for role→score joins. Approved along with the first-ever frontend
    dependency set (React 19, Vite 6, TS 5, vitest/testing-library/jest-axe, eslint+a11y
    plugins).
  - **Task 1** (Cypress): 20 failing tests locking in the exact RLS/view contract for
    `0003_frontend_read_layer.sql`.
  - **Task 2** (Redwood): wrote the migration — 20/20 new tests, 198/198 full suite. Added
    `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements Redwood caught were needed (RLS had
    only been enabled manually via the dashboard before, never captured in a migration).
  - **Amendment**: Redwood correctly halted on two gaps from Task 3 rather than shadow-fixing —
    missing `eslint.config.js` and unauthorized `@types/react`/`@types/react-dom`. Cedar
    authorized the types (no new runtime capability) and split the lint config into **Task 3b**
    rather than let it quietly exceed Task 4's 5-file cap.
  - **Task 3** (Redwood, SPIKE): scaffolded `frontend/` as a fully self-contained npm project,
    isolated from the root Python package.
  - **Task 3b** (Redwood): `eslint.config.js`, verified live by triggering and reverting a
    throwaway a11y violation.
  - **Live migration verification**: user applied `0003` and confirmed anon-key reads work via a
    direct REST call — including a real row (`"ai"`, Software Engineer) with all score fields
    `null`, proving the `LEFT JOIN` correctly surfaces unscored role skills instead of dropping
    them.
  - **Task 4** (Redwood, SPIKE): built the walking skeleton — role picker, `fetchRoleSkillProfile`,
    a semantic accessible `<table>` with loading/error/empty states, null-score rows flagged
    "Demand only, scarcity unknown." `tsc`/lint clean.
  - **Full end-to-end browser verification, done live by the user**: hit a real bug along the
    way (`frontend/.env` created but left blank, causing `Uncaught Error: supabaseUrl is
    required` — a synchronous throw at module load since `createClient()` runs at import time,
    producing a blank white screen with no on-page error). Root-caused via file-size comparison
    against `.env.example` (still 203 bytes, identical) rather than reading the file's contents.
    User filled in the real Publishable Key + Project URL, restarted the dev server, and
    confirmed: the role dropdown renders, selecting a role fetches live data, and a real table of
    skills populates. The skeleton is fully verified end-to-end against production data.

- **Task 5** (Cypress): characterization tests for the walking skeleton — 17 tests across
  `roles.test.ts`, `supabaseClient.test.ts`, `App.test.tsx`, all green (`npx vitest run` → 3/3
  files, 17/17 tests), ESLint clean. Froze: the six verbatim role strings with `" / "` spacing,
  the accessible "Target role" select + all six options, exact `role_family` reaching
  `fetchRoleSkillProfile`, the `skill_key: null` row rendering flagged and never dropped, and zero
  axe violations idle + populated. No skeleton source modified. **Not yet committed.**
  - Two divergences flagged: (1) **test-harness trap** — `src/test/setup.ts` never called
    Testing Library `cleanup`, so repeated `render(<App />)` accumulated in the DOM and corrupted
    the select's accessible name. **FIXED by Redwood** (below). (2) **lint hook broken in this
    env** — `post-edit-lint.sh` calls `/usr/bin/env node` but node is only on the nvm PATH; still
    open.
- **Redwood harness fix** (config-only follow-up): added a global `afterEach(() => cleanup())` to
  `frontend/src/test/setup.ts` so every React suite gets automatic per-test unmount. Verified
  genuinely global (a temp suite with no local cleanup passed), full suite still 17/17 green. No
  new dep. Committed `ed7718c`.
- **Task 6** (Cypress, RED): 11 failing a11y/behavioral tests defining Done for Magnolia's Task 7
  (`SkillMatrix.test.tsx`, `ArbitrageLadder.test.tsx`, `roleSkillProfile.fixture.ts`). They fail on
  the absent `SkillMatrix`/`ArbitrageLadder` modules; the 17 characterization tests still pass
  (`npx vitest run` → 2 failed | 3 passed files, 11 failed | 17 passed tests). Committed `58c2dc7`.
  - **Component contract Magnolia MUST honor**: named exports `SkillMatrix`/`ArbitrageLadder`,
    prop `rows: RoleSkillRow[]`. `SkillMatrix`: root `data-testid="skill-matrix"`; one
    `data-testid="scatter-point"` per *scored* skill (null-score row excluded from points); each
    point button-like/tabbable, accessible name contains `skill_name_raw`, non-empty `data-shape`
    (non-color encoding); root `data-reduced-motion="true"` under `(prefers-reduced-motion: reduce)`
    with no inline animation; accessible `<table>` (`<caption>` + `<th scope="col">`, one row per
    skill incl. demand-only flagged `/demand only/i`, raw numerics verbatim); zero axe violations.
    `ArbitrageLadder`: one `data-testid="ladder-item"` per row (null row kept), each
    button-like/tabbable/named; ordered descending by `arbitrage_score`, null-score rows last;
    demand-only row flagged.
- **Task 7** (Magnolia, GREEN — completes spec 003): built `SkillMatrix.tsx`,
  `ArbitrageLadder.tsx`, `SkillDataTable.tsx`, `matrix.css`, wired into `App.tsx` (5 files).
  Hand-rolled SVG/DOM quadrant scatter (x=demand, y=scarcity, bubble=`pct_of_role`) + descending
  arbitrage ladder + shared accessible `<table>`; **no charting dependency added** (Rule 8 honored;
  `dataviz` + `a11y-sec-2026` skills invoked first). WCAG 2.2 AA: per-point `data-shape` glyphs
  (non-color encoding), native `<button>` points/ladder items, caption + `th scope=col` table incl.
  the demand-only null row (flagged, kept in table+ladder, excluded from scatter points),
  `prefers-reduced-motion` gated CSS, zero axe violations. **Full suite 28/28 green — independently
  re-verified in the main session** (`npx vitest run`). Committed `f89fb5b`. **specs/003 is now
  fully complete.**

### Session addendum — live browser verification, completed
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
  intentionally, chose to leave it deleted rather than restore from git. **Still not committed** —
  deletion sits in the working tree; commit only if/when the user explicitly asks.
- Ad-hoc verification screenshots landed in `screenshots/` (untracked, not gitignored) —
  deliberately left out of commits as manual scratch artifacts, not repo content.

### Unfinished / Blocked
- **specs/003 fully complete and live-verified.** Next unbuilt slice is README MVP step 4 (resume
  gap layer) — not specced yet; Cedar needs to turn it into a SPEC.
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
- Decide/commit the `frontend/.env.example` deletion (currently uncommitted, intentional per user,
  awaiting explicit commit instruction) — do this before the next push.
- **MVP step 4 (resume gap layer)**: route to Cedar for a `[SPEC]` — paste-resume → Claude skill
  extraction (Bounded-AI: LLM extracts, deterministic layer computes the gap) → have/gap split
  rendered on the existing matrix. This is the first LLM-in-the-loop slice, so the Bounded-AI +
  Zero-Trust (no resume PII in commits/logs) gates apply hard.
- Optional cleanup someday: fix the lint hook's node/nvm PATH resolution; consider `@types/jest-axe`.
