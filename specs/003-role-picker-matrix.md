# 003 — Role Picker + Demand×Scarcity Matrix (README MVP step 3)

**Status**: Approved 2026-07-22. Direct-to-Supabase client-side data access (public RLS reads,
Secret-key-only writes) approved. First-ever frontend dependency set approved as listed. Tasks
1–7 authorized.

**Context**: First frontend code in the repo — no `package.json`, no `.tsx` files existed before
this SPEC. Backend/data layer is fully built and live-verified
(`specs/001-ingest-pipeline.md`, `specs/002-arbitrage-score.md`) — Supabase has real data in
`skills_core` (141 rows), `skill_role_profile` (450 rows), `skill_arbitrage_scores`/
`arbitrage_scores` view (141 rows).

Scope: role picker + a role's full skill profile on the demand×scarcity matrix. Every profile
skill renders as an undifferentiated gap (no have/gap split — that requires resume input, which
is MVP step 4, out of scope here).

## Plan summary (Cedar)

**Two forced decisions (both approved):**

1. **RLS gap** — new migration `0003_frontend_read_layer.sql` adding `FOR SELECT TO anon USING
   (true)` policies on `skills_core`, `skill_role_profile`, and `skill_arbitrage_scores` (all
   three underlying tables, not just the view), plus `security_invoker = true` on the existing
   `arbitrage_scores` view (Postgres 15+ footgun: views run as their owner, bypassing RLS, unless
   this is set explicitly) — no INSERT/UPDATE/DELETE grant to `anon` anywhere; write path stays
   Secret-key-only. Also authorizes one new read-only view, `role_skill_arbitrage`
   (`skill_role_profile LEFT JOIN arbitrage_scores ON skill_key`, `security_invoker = true`) —
   the matrix needs demand/scarcity/score joined *by role*; keeping that as one auditable SQL
   projection avoids a second, drifting client-side reimplementation of the same join (which
   step 4's resume-gap layer will also need).
2. **Data-fetching location** — client-side `@supabase/supabase-js` with the Publishable/anon
   key, no separate backend API tier. Matches the documented stack (Vercel frontend + Supabase
   DB, no app-server layer); Postgres RLS is the actual security boundary. Revisit only if V2
   adds accounts/resume persistence (AGENTS.md's security-isolation-gate trigger).

**SPIKE, not SPEC, for the frontend architecture itself** — Vite scaffold shape, state/
data-fetching pattern, and directory layout are genuine unknowns with zero existing convention.
Real landmine resolved: the repo already has a root-level `src/` (Python) and `tests/` (pytest),
so the frontend lives in its own self-contained `frontend/` npm project, fully isolated. Redwood
builds the walking skeleton (scaffold → role picker → real joined data fetch → plain accessible
table) first; Cypress writes characterization tests after (per the SPIKE path). Once frozen, the
actual matrix + ladder is well-bounded enough for standard TDD — Cypress writes
accessibility/behavioral tests first, Magnolia builds, invoking her mandatory `dataviz` skill
herself (Cedar is not pre-empting the charting/visual choice).

Every number rendered (`demand_score`, `scarcity_index`, `arbitrage_score`, `pct_of_role`) is
read verbatim from already-computed views — the frontend sorts/positions for display only, never
computes.

**7 tasks** (larger than the prior two SPECs' 6/5 — from-scratch frontend bootstrap + a schema
change, not an addition to existing code). No task needs Banyan's tree-wide exemption (scaffolding
split into two ≤5-file steps specifically to stay under the cap).

**New dependencies (approved)**: `react ^19`, `react-dom ^19`, `@supabase/supabase-js ^2`
(runtime); `vite ^6`, `@vitejs/plugin-react-swc ^3`, `typescript ^5`, `vitest ^3`,
`@testing-library/react ^16`, `@testing-library/jest-dom ^6`, `@testing-library/user-event ^14`,
`jsdom ^25`, `jest-axe ^9`, `eslint ^9`, `typescript-eslint ^8`, `eslint-plugin-jsx-a11y ^6`,
`eslint-plugin-react-hooks ^5`, `eslint-plugin-react-refresh`, `prettier ^3` (dev). No backend/API
framework. No charting library yet — left to Magnolia's Task 7 discretion, gated behind her own
dependency-authorization request if needed.

---

## Task 1 — Cypress: failing structural tests for the frontend read-layer migration

```markdown
[SPEC]
- **Objective**: Write failing tests (regex/structural text assertions on the not-yet-written
  migration file) validating the exact RLS + view contract the frontend needs to read data,
  before Redwood writes the migration — same style as Task 3/`specs/002-arbitrage-score.md`.
- **Inputs/Outputs**: `supabase/migrations/0003_frontend_read_layer.sql` read as text → structural
  assertions (no live DB).
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; no LLM; N/A otherwise.
- **Intellectual Control**: RLS is the actual security boundary for a public, PII-free, anon-key
  frontend — its exact shape must be locked by a test, not left to implementer judgment, given
  how easy it is to accidentally leave a table wide-open or forget that Postgres views run as
  their owner (bypassing RLS) unless `security_invoker = true` is set explicitly.
- **Constraints**: pytest only, text/regex assertions on the SQL file, no live Supabase
  credentials in test context.
- **Edge Cases** (must be asserted):
  - `CREATE POLICY ... FOR SELECT TO anon USING (true)` present for all three of `skills_core`,
    `skill_role_profile`, `skill_arbitrage_scores` — regex per table, not just one blanket check.
  - No `INSERT`/`UPDATE`/`DELETE` policy anywhere in the file is granted `TO anon` (negative
    assertion — write path must stay Secret-key-only).
  - `ALTER VIEW arbitrage_scores SET (security_invoker = true);` present.
  - `CREATE VIEW role_skill_arbitrage` present, declared `WITH (security_invoker = true)`, body
    contains `LEFT JOIN` and selects at minimum: `role_family`, `skill_name_raw`, `skill_key`,
    `pct_of_role`, `postings_with_skill`, `demand_score`, `scarcity_index`, `arbitrage_score`,
    `scarcity_data_completeness`, `d3_corroborated`, `d3_pct_of_all_postings`.
  - The join is `skill_role_profile LEFT JOIN arbitrage_scores` (not `INNER JOIN`) — regression
    guard for the "unscored role skill still surfaces" invariant.
- **Files**: `tests/test_frontend_read_layer_migration.py`
- **Tipping Point**: if V2 adds user accounts, this deny-by-default-except-anon-SELECT model needs
  a full revisit (per-user row scoping), not just an added policy.
```
```markdown
[FORCES]
1. RLS shape locked by an enforced test > trusting manual SQL review of a security boundary
2. Simplicity > Pattern purity
```

## Task 2 — Redwood: implement the migration

```markdown
[SPEC]
- **Objective**: Make Task 1's tests pass — write `0003_frontend_read_layer.sql` exactly as
  specified, apply it to the live Supabase project, and empirically verify (using the
  Publishable/anon key, not the Secret key) that a fresh anon client can read rows from
  `skills_core`, `skill_role_profile`, `arbitrage_scores`, and `role_skill_arbitrage`.
- **Inputs/Outputs**: per Task 1's assertions exactly; live verification is a manual/CLI step.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; no LLM.
- **Intellectual Control**: reuses the already-computed `arbitrage_scores` view inside
  `role_skill_arbitrage` rather than re-deriving from base tables.
- **Constraints**: DDL only in `supabase/migrations/`, applied via the CLI, not the Python client.
  No new NPM/PIP dependency.
- **Edge Cases**: verify the anon client genuinely gets rows back (not an empty result silently
  passing).
- **Files**: `supabase/migrations/0003_frontend_read_layer.sql`
- **Tipping Point**: see Task 1.
```
```markdown
[FORCES]
1. Tests-as-contract (do not modify Cypress's tests) > implementation convenience
2. Simplicity > Pattern purity
```

## Task 3 — Redwood [SPIKE]: frontend project scaffold (config only)

```markdown
[SPIKE]
- **Objective**: Bootstrap a self-contained Vite + React + TypeScript project under `frontend/`,
  fully isolated from the repo-root Python package (`src/`) and pytest's `testpaths=["tests"]`.
- **Inputs/Outputs**: N/A (config/tooling only) → `npm run dev` boots a blank Vite+React+TS shell
  from `frontend/`; `npm test` (vitest) is wired but has nothing to run yet.
- **Design Pattern**: none — simple case; this is tooling config, no product logic.
- **Bounded-AI boundary**: N/A — no scoring/gap/LLM logic in this task.
- **Intellectual Control**: a fully separate npm project root (own `package.json`, own
  `tsconfig.json`) means the JS toolchain and the Python toolchain never collide or need
  cross-configuration.
- **Constraints**: dependencies per the approved list above. No backend/API framework
  (Express/Next.js) — direct-to-Supabase per Decision 2. No charting library yet — left to
  Magnolia's Task 7 discretion.
- **Edge Cases**: `.gitignore` already covers `node_modules/`, `dist/`, `coverage/`, `.env*`
  unanchored — verify no edit to `.gitignore` is actually needed rather than adding a redundant
  one.
- **Files**: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts` (includes
  the `test` block: `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']` — file created in
  Task 4), `frontend/index.html`, `frontend/.env.example` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` — placeholder values only, never a real key committed)
- **Tipping Point**: if a second frontend app or a shared component library is ever needed, revisit
  the single-`frontend/` assumption; not needed for a one-page V1 SPA.
```
```markdown
[FORCES]
1. Toolchain isolation (frontend/ as its own npm root) > minimizing directory nesting
2. Simplicity > Pattern purity
```

## Task 4 — Redwood [SPIKE]: walking skeleton (role picker → real joined fetch → plain table)

```markdown
[SPEC]
- **Objective**: Prove data flows end-to-end: pick one of the six V1 roles → query
  `role_skill_arbitrage` filtered by `role_family` → render every returned skill as a plain,
  semantic, unstyled `<table>` row. No chart yet — that's Task 7.
- **Inputs/Outputs**: `fetchRoleSkillProfile(role: string): Promise<RoleSkillRow[]>` where
  `RoleSkillRow` mirrors `role_skill_arbitrage`'s columns exactly (including nullable
  `skill_key`/`demand_score`/`scarcity_index`/`arbitrage_score` for unmatched skills) → rendered as
  table rows.
- **Design Pattern**: none — simple case (one query, one render path, no polymorphism yet).
- **Bounded-AI boundary**: 100% deterministic query/render; zero LLM; zero client-side score/gap
  computation.
- **Intellectual Control**: the six role strings live in exactly one place (`lib/roles.ts`) reused
  by the `<select>`'s options and later by Magnolia's/step-4's code and Cypress's tests — a single
  source of truth against the exact-spacing footgun (`Data Scientist / ML`, not
  `Data Scientist/ML`).
- **Constraints**: Supabase client reads `import.meta.env.VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` only — never a hardcoded key. Publishable/anon key only, never the
  Secret key, anywhere in frontend code.
- **Edge Cases**: a returned row with `skill_key: null` (no D1/D2 match) must still render in the
  table — display its `pct_of_role` with a "demand only, scarcity unknown" note where score fields
  are null, never silently dropped. Empty/loading/error states for the fetch must not crash.
- **Files**: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/supabaseClient.ts`
  (client creation + `fetchRoleSkillProfile`), `frontend/src/lib/roles.ts` (the six exact
  `role_family` strings, verbatim), `frontend/src/test/setup.ts` (jest-dom/jest-axe matcher setup)
- **Tipping Point**: if a second data source (e.g. resume-extracted skills, step 4) needs merging
  client-side, revisit whether fetching stays a plain async function or needs a small state
  library; not needed for one query in V1.
```
```markdown
[FORCES]
1. Prove the real join/fetch/render path end-to-end (walking skeleton) > building the chart first
2. Simplicity > Pattern purity
```

## Task 5 — Cypress: characterization tests for the skeleton (SPIKE audit, after the fact)

```markdown
[SPEC]
- **Objective**: Lock in the walking skeleton's observed behavior as a regression-guarding test
  suite before Magnolia builds the real matrix on top of it — per the SPIKE path, tests are
  written after the skeleton, not before.
- **Inputs/Outputs**: mounted `<App />` (jsdom) + a mocked Supabase client (no live
  network/credentials in tests).
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; N/A LLM.
- **Intellectual Control**: this suite is the frozen contract Magnolia's Task 7 must not silently
  break — especially the accessible-table fallback, which must survive as a text alternative once
  the chart exists.
- **Constraints**: vitest + testing-library + jest-axe; test files only.
- **Edge Cases** (must be asserted):
  - `lib/roles.ts` exports exactly the six verbatim strings with internal slash-spacing.
  - The `<select>` has an accessible name (e.g. "Target role") and all six roles as options.
  - Selecting a role calls `fetchRoleSkillProfile` with the exact selected `role_family` string.
  - A mocked response containing a `skill_key: null` row still renders in the table, flagged,
    never filtered out.
  - `axe()` on the mounted skeleton reports zero violations.
- **Files**: `frontend/src/lib/roles.test.ts`, `frontend/src/lib/supabaseClient.test.ts`,
  `frontend/src/App.test.tsx`
- **Tipping Point**: N/A — characterization tests, revisit only if the skeleton's public contract
  changes.
```
```markdown
[FORCES]
1. Freezing observed skeleton behavior > writing tests against a hypothetical future API
2. Simplicity > Pattern purity
```

## Task 6 — Cypress: failing accessibility/behavioral tests for the matrix + ladder

```markdown
[SPEC]
- **Objective**: Write failing tests for the real demand×scarcity matrix + arbitrage ladder + its
  accessible table alternative, before Magnolia implements — standard TDD now that the data
  contract is settled and frozen by Task 5.
- **Inputs/Outputs**: a fixture array of `RoleSkillRow[]` (including at least one `skill_key: null`
  row) → mounted `<SkillMatrix rows={...} />`.
- **Design Pattern**: N/A (Cypress does not choose Magnolia's implementation pattern).
- **Bounded-AI boundary**: all displayed numbers must trace verbatim to the fixture's fields.
- **Constraints**: vitest + testing-library + jest-axe; test/fixture files only.
- **Edge Cases** (must be asserted — the hard WCAG 2.2 AA data-viz constraints):
  - **Non-color-only encoding**: every plotted point exposes a distinguishing shape/pattern/label
    attribute independent of color.
  - **Keyboard navigation**: every plotted point and every ladder-bar item is a real focusable,
    keyboard-operable element, reachable via `userEvent.tab()`, activatable via Enter/Space.
  - **Accessible table alternative**: a real `<table>` (with `<caption>`/`<th scope="col">`) with
    one row per fixture skill and its raw numeric fields.
  - **`prefers-reduced-motion`**: mock `window.matchMedia` reporting `reduce`; assert no
    animation/transition is applied.
  - **`axe()` zero violations** on the full mounted view.
  - **Unscored-skill handling**: the `skill_key: null` fixture row appears in the table and ladder
    flagged, excluded only from the scatter's plotted (x,y) points.
  - **Ranking display**: the ladder is ordered descending by `arbitrage_score`, null-score rows
    last.
- **Files**: `frontend/src/components/matrix/SkillMatrix.test.tsx`,
  `frontend/src/components/matrix/ArbitrageLadder.test.tsx`,
  `frontend/src/test/fixtures/roleSkillProfile.fixture.ts`
- **Tipping Point**: N/A for Cypress; see Task 7.
```
```markdown
[FORCES]
1. WCAG 2.2 AA data-viz hard constraints locked by test > trusting visual review alone
2. Simplicity > Pattern purity
```

## Task 7 — Magnolia: build the accessible demand×scarcity matrix + arbitrage ladder

```markdown
[SPEC]
- **Objective**: Make Task 6's tests pass — build the real quadrant scatter (x = demand, y =
  scarcity, bubble size = market share/`pct_of_role`) and the arbitrage ladder (ranked bar list),
  each backed by the same accessible data table, replacing the skeleton's plain table.
- **Inputs/Outputs**: `RoleSkillRow[]` (from Task 4's `fetchRoleSkillProfile`, unchanged) → the
  matrix + ladder + table views.
- **Design Pattern**: none — simple case. Three sibling components over one shared
  `RoleSkillRow[]` shape, no extra GoF machinery needed yet.
- **Bounded-AI boundary**: every number shown is read verbatim from already-computed data.
  Sorting/coordinate-mapping for display are presentation transforms, not new metrics.
- **UI Scope**: structural — first-ever implementation, not styling on an existing layout.
- **Intellectual Control**: invoke the `dataviz` skill (and `a11y-sec-2026`) before any
  chart/styling work. A hand-rolled SVG/DOM approach is the presumptive default given the strict
  a11y bar — off-the-shelf chart libraries commonly fight non-color encoding, keyboard nav, and
  reduced-motion control — but confirm or override after the skill's guidance.
- **Constraints**: no new npm dependency without halting and requesting an updated `[SPEC]` from
  Cedar — this includes any charting library. Respect `prefers-reduced-motion`; meet AA contrast;
  never color-only encoding.
- **Edge Cases**: per Task 6 exactly.
- **Files**: `frontend/src/components/matrix/SkillMatrix.tsx`,
  `frontend/src/components/matrix/ArbitrageLadder.tsx`,
  `frontend/src/components/matrix/SkillDataTable.tsx`, `frontend/src/App.tsx` (wire the three in),
  plus one styling file of your choice
- **Tipping Point**: if step 4 (resume gap layer) introduces a second visual state (have vs. gap)
  requiring per-skill branching color/shape rules, or a fourth alternate view is requested, revisit
  whether a real Strategy/interface contract is now earned instead of ad hoc sibling components.
```
```markdown
[FORCES]
1. WCAG 2.2 AA data-viz constraints (Cypress's frozen tests) > visual polish
2. Simplicity > Pattern purity
```

---

**Relevant paths**: `README.md`, `AGENTS.md`, `data/schema-notes.md`, `specs/001-ingest-pipeline.md`,
`specs/002-arbitrage-score.md`, `supabase/migrations/0001_init_skills_schema.sql`,
`supabase/migrations/0002_arbitrage_scores.sql`, `.claude/agents/magnolia.md`,
`.claude/agents/cypress.md`, `.claude/agents/redwood.md`, `pyproject.toml`, `.gitignore`,
`SESSION_STATE.md`.
