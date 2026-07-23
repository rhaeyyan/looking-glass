# 005 — Template Narrator (README MVP step 5)

**Status**: Approved 2026-07-23. Deterministic template narrator (no LLM call) approved,
replacing the originally-planned LLM narration for this step. One schema exposure authorized
(Task 2, append-only view columns). Tasks 1–6 authorized.

**Context**: README MVP step 5 — "a short 'learn X before Y, here's why' rationale for the top
gap." Originally scoped as an LLM narration call (reusing spec 004's OpenRouter edge-function
pattern). The human evaluated and approved a pivot instead: by this stage every fact the
rationale needs — demand, `scarcity_score`, salary premium, days-open, exact rank ordering — is
already computed deterministically by specs 001–004, so a template function can state the
*precise* mathematical reason one gap outranks another with zero latency, zero cost, and zero
hallucination risk. This is arguably *more* on-brand for Bounded-AI than generative prose, and it
removes the runtime dependency on a flaky free-tier model (see spec 004's confirmed
`google/gemma-4-31b-it:free` rate-limit blocker, tracked separately). The template path doubles as
the deterministic fallback a future LLM-narration reintroduction could wrap around, on
rate-limit/timeout/Zod failure — that wrapper is not built now, only the shape decision is made.

**Sibling proposal rejected**: replacing resume *extraction* (step 4) with pure string/
Aho-Corasick matching for "100% zero-AI" was evaluated and explicitly **not** adopted — extraction
consumes unstructured natural language where fuzzy matching regresses (single-letter skills like
`r` matching "R&D", negation like "no Kubernetes experience" reading as false *have*, contextual
phrasing), and an extraction error corrupts the ranking itself. `frontend/src/lib/resumeSkills.ts`
and `supabase/functions/extract-resume-skills/` are untouched by this spec.

**Goal**: Given the ranked gap list already computed by spec 004's `computeSkillGap()`, produce a
short deterministic narration for the #1-ranked gap explaining *why* it's the highest-leverage
skill to learn next, citing the real computed numbers so the rationale is auditable against the
data.

## Plan summary (Cedar)

**Design Pattern**: none — simple case (one deterministic string-composer, one small display
component; no polymorphism earned). Note: "template narrator" is a plain string-template
function, not the GoF *Template Method* pattern — there is no shared algorithm skeleton with
variant subclass steps here, so invoking that pattern name would be overengineering, not a fit.

**Forced decisions (all approved):**

1. **Schema exposure authorized (Cedar, Workflow Rule 8)**: migration
   `0004_role_arbitrage_narration_fields.sql` appends `salary_premium_pct` and
   `median_days_open` (both already columns on `skills_core`, already flowing into the
   `arbitrage_scores` view since spec 002) to the end of `role_skill_arbitrage`'s SELECT list, via
   `CREATE OR REPLACE VIEW` (append-only column order preserved — Postgres requires this for
   `REPLACE` to succeed without drop/recreate). No new table, no new RLS policy (same three
   tables, same anon SELECT policies from migration 0003), no new computation. `RoleSkillRow` and
   `fetchRoleSkillProfile`'s select string gain the same two fields, typed `number | null`
   (mirrors the existing nullable-but-always-selected convention already used for
   `demand_score`/`scarcity_index`/`arbitrage_score`).
2. **Tolerance rule**: two numeric fields are "tied" for narrative purposes iff
   `formatNum(a) === formatNum(b)` (string equality on the existing 2-decimal display rounding) —
   never raw `===` on unrounded floats. Reuses the existing, already-tested `formatNum`
   convention rather than inventing a new epsilon constant, and keeps the narrative's claims
   consistent with what the accessible table/ladder actually display.
3. **Tie precedence (fixed order, first differentiator wins)**: when explaining why the top gap
   outranks the runner-up gap, compare in this order and cite the first field where they are NOT
   tied under rule 2: `arbitrage_score → demand_score → scarcity_index → salary_premium_pct →
   median_days_open`. If every one of those is null-or-tied on both rows, fall back to an honest,
   non-fabricating sentence that states the tie plainly rather than inventing a differentiator. A
   `null` field on either side is never treated as a win for either row — it just falls through to
   the next field in the chain.
4. **"Top gap" / "runner-up gap" defined precisely**: `computeSkillGap`'s already-sorted `rows`
   (descending `arbitrage_score`, null-last) filtered to the first row whose key
   (`skill_key ?? normalizeSkillName(skill_name_raw)`) is **not** in `haveSkillKeys` = the top
   gap. The next such row after it = the runner-up gap (may not exist).
5. **Template-first-with-fallback framing (design note, not built now)**: `narrateTopGap()`'s
   signature and pure/synchronous/zero-I/O shape is deliberately generic enough that a future
   LLM-narration reintroduction could wrap it as a `try LLM → catch/timeout/Zod-fail → return
   narrateTopGap(...)` fallback branch, without rewriting this function. No LLM call, wrapper, or
   fallback-selection logic is built in this SPEC — only the shape decision is made now, per
   Workflow Rule 5 (walking skeleton, no speculative build).

**Task shape**: 6 tasks, mirroring spec 004's cadence. Tasks 1–2 (Redwood) resolve a small schema
exposure gap; Tasks 3–4 (Redwood) build the pure narration function (standard TDD, not
exploratory — the shape is fully known); Tasks 5–6 (Magnolia) wire it into the UI. None over 5
files.

---

## Task 1 — Cypress: failing tests for the salary-premium/days-open schema exposure

```markdown
[SPEC]
- **Objective**: Lock in, as failing tests, that `role_skill_arbitrage` selects `salary_premium_pct`
  and `median_days_open`, and that `RoleSkillRow`/`fetchRoleSkillProfile` carry them — before
  Redwood touches the migration or the client. Standard TDD (not exploratory): the shape is fully
  known from `arbitrage_scores`/`skills_core`, already built in specs 001–002.
- **Inputs/Outputs**: `supabase/migrations/0004_role_arbitrage_narration_fields.sql` read as text
  (structural/regex assertions, same style as `tests/test_frontend_read_layer_migration.py`'s
  existing `test_role_skill_arbitrage_view_selects_column`); a mocked `fetchRoleSkillProfile` call
  asserting the exact (extended) column-list string passed to `.select(...)`.
- **Design Pattern**: N/A (Cypress does not choose Redwood's implementation).
- **Bounded-AI boundary**: N/A — fully deterministic DDL/type-shape assertions, no LLM involved.
- **Constraints**: pytest (migration text) + vitest (client mock), no live Supabase credentials.
  Do not weaken or remove any existing assertion in `test_frontend_read_layer_migration.py` or
  `supabaseClient.test.ts` — only extend.
- **Edge Cases** (must be asserted):
  - The migration's `CREATE OR REPLACE VIEW role_skill_arbitrage` still declares
    `WITH (security_invoker = true)` (regression guard — replacing a view must not silently drop
    this).
  - Both new columns appear in the view's SELECT list, sourced from `arbitrage_scores` (not
    `skill_role_profile`) — they are `skills_core`-origin fields, joined in via `arbitrage_scores`,
    exactly like `demand_score`/`scarcity_index` already are.
  - `fetchRoleSkillProfile`'s frozen column-list string (currently asserted verbatim in
    `supabaseClient.test.ts`) is extended to end with `, salary_premium_pct, median_days_open`.
  - Sample-row literals in `supabaseClient.test.ts` and `roleSkillProfile.fixture.ts` gain both new
    fields (nullable, `number | null`) on every existing row, including the demand-only (`gRPC`,
    `skill_key: null`) row, where both new fields are also `null` — this is a deliberate
    type-level RED (the fixture won't compile against the pre-Task-2 `RoleSkillRow`) that Task 2
    turns GREEN.
- **Files**: `tests/test_frontend_read_layer_migration.py`, `frontend/src/lib/supabaseClient.test.ts`,
  `frontend/src/test/fixtures/roleSkillProfile.fixture.ts`
- **Tipping Point**: N/A for Cypress; see Task 2.
```
```markdown
[FORCES]
1. Freezing the exact extended column contract by test, before the migration lands > trusting review alone
2. Simplicity > Pattern purity
```

## Task 2 — Redwood: append `salary_premium_pct`/`median_days_open` to the frontend read layer

```markdown
[SPEC]
- **Objective**: Make Task 1's tests pass. Append the two already-computed columns to
  `role_skill_arbitrage` (migration) and thread them through `RoleSkillRow` and
  `fetchRoleSkillProfile`'s select string — pure exposure, zero new computation.
- **Inputs/Outputs**: `CREATE OR REPLACE VIEW role_skill_arbitrage ... WITH (security_invoker =
  true) AS SELECT <existing 10 columns>, arbitrage_scores.salary_premium_pct,
  arbitrage_scores.median_days_open FROM ... LEFT JOIN ...` (columns appended at the END of the
  list only — required for `REPLACE` to succeed without drop/recreate). `RoleSkillRow` gains
  `salary_premium_pct: number | null` and `median_days_open: number | null`;
  `fetchRoleSkillProfile`'s `.select(...)` string gains the same two names, appended in the same
  order.
- **Design Pattern**: none — simple case; a column-list append, no new abstraction.
- **Bounded-AI boundary**: 100% deterministic passthrough. These two fields were already computed
  by spec 002's `compute_arbitrage_score`/ingest pipeline; this task adds zero new math, zero new
  join logic — it only surfaces existing `skills_core` columns to the client the same way
  `demand_score`/`scarcity_index` already are.
- **Constraints**: **Schema migration — authorized above under Workflow Rule 8** (Cedar). No new
  table, no new RLS policy, no new npm/pip dependency. Do not reorder or rename any existing
  column in the view or the `.select(...)` string — append-only. Do not touch
  `skill_role_profile`, `arbitrage_scores`, or any RLS policy from migration 0003.
- **Edge Cases**: a role skill with no D1/D2 arbitrage match (`skill_key: null`) must still surface
  both new fields as `null` via the existing LEFT JOIN — never dropped, never defaulted to `0`.
- **Files**: `supabase/migrations/0004_role_arbitrage_narration_fields.sql`,
  `frontend/src/lib/supabaseClient.ts`
- **Tipping Point**: if a third `skills_core` field is ever needed by a future feature, consider
  whether `role_skill_arbitrage` should just `SELECT skills_core.*`-equivalent instead of a
  hand-maintained column list — not needed for two fields.
```
```markdown
[FORCES]
1. Tests-as-contract (do not modify Task 1's tests) > implementation convenience
2. Simplicity > Pattern purity
```

## Task 3 — Cypress: failing tests for the pure `narrateTopGap()` template function

```markdown
[SPEC]
- **Objective**: Write failing tests for a pure, synchronous, zero-I/O function that composes a
  one-sentence rationale for the top-ranked gap, before Redwood implements. Covers the tolerance
  rule, the five-step tie precedence, top/runner-up-gap definition, and every null-field
  degradation case.
- **Inputs/Outputs**: `narrateTopGap(rows: RoleSkillRow[], haveSkillKeys: Set<string>): { topGap:
  RoleSkillRow; runnerUpGap: RoleSkillRow | null; narrative: string } | null`. `rows` is assumed
  already sorted by `computeSkillGap`'s convention (descending `arbitrage_score`, null-last) — this
  function does not re-sort; it scans for the first non-`have` row (top gap) and the next
  non-`have` row after it (runner-up gap, may be absent).
- **Design Pattern**: N/A (Cypress does not choose Redwood's implementation).
- **Bounded-AI boundary**: assert every number appearing in `narrative` is the `formatNum(...)`
  output of a real field read verbatim from `topGap`/`runnerUpGap` — never a re-derived or
  interpolated value, and never a number for a field that is `null` on the cited row (assert the
  clause is omitted instead, not printed as `"null"` or `"—"`).
- **Constraints**: vitest; test/fixture files only; the function under test must be provably
  synchronous (no `Promise`, no `await`, no network mock needed at all — assert this by NOT mocking
  any network layer and confirming the tests still pass with zero mocks defined).
- **Edge Cases** (must be asserted):
  - Two gap rows tied (via `formatNum` equality) on `arbitrage_score` but differing on
    `demand_score` → narrative cites `demand_score` as the deciding reason, per precedence step 2.
  - Two gap rows tied on `arbitrage_score` AND `demand_score` but differing on `salary_premium_pct`
    (the exact "high-premium AND tied-on-demand" nit from the original proposal) → narrative cites
    `salary_premium_pct`, skipping the tied `scarcity_index` per precedence order — proving the
    chain is followed in fixed sequence, not the first available difference in field-declaration
    order.
  - Two gap rows tied on every comparable field (including both nullable ones being `null` on
    both sides) → narrative uses the honest-tie fallback sentence, never fabricates a
    differentiator.
  - Top gap has `arbitrage_score: null` (demand-only row) → narrative degrades to a
    demand-only-framed sentence ("ranked by demand alone — scarcity data unavailable"), never
    invents a fake score/scarcity/premium number.
  - Top gap has non-null `arbitrage_score` but null `salary_premium_pct`/`median_days_open` → those
    clauses are omitted from the sentence entirely, not rendered as `null`/`NaN`/`—`.
  - No runner-up gap exists (top gap is the only remaining gap) → narrative is a solo-justification
    sentence about the top gap's own numbers, with no comparison language and no invented
    runner-up.
  - Every role skill is already a "have" (no gap rows at all) → `narrateTopGap` returns `null`
    (not a throw, not an empty-string narrative).
  - `rows: []` → returns `null`.
  - A "have" row that happens to have the single highest `arbitrage_score` is correctly skipped in
    favor of the highest-scoring **non**-have row as the top gap (regression guard against
    accidentally narrating a skill the user already has).
- **Files**: `frontend/src/lib/narrate.test.ts`,
  `frontend/src/test/fixtures/narrateTopGap.fixture.ts`
- **Tipping Point**: N/A for Cypress; see Task 4.
```
```markdown
[FORCES]
1. A fixed, tested tie-precedence chain > ad hoc/undefined tiebreak behavior
2. Simplicity > Pattern purity
```

## Task 4 — Redwood: implement `narrateTopGap()`

```markdown
[SPEC]
- **Objective**: Make Task 3's tests pass. One pure function, zero I/O, zero LLM call — the
  entirety of README step 5's narration logic, and (per the approved framing) the literal
  fallback branch a future LLM-narration reintroduction would call into on rate-limit/timeout/
  schema-validation failure.
- **Inputs/Outputs**: exactly Task 3's signature and fixtures.
- **Design Pattern**: none — simple case; a scan + an ordered field-comparison chain + string
  interpolation. No Strategy/Template-Method abstraction earned for a five-step, unchanging,
  hand-readable precedence list.
- **Bounded-AI boundary**: this function is the ENTIRE narration layer — no network call, no LLM
  SDK/client import, no `await`, anywhere in this file. Every number interpolated into the returned
  `narrative` string must go through `formatNum` (reuse from `frontend/src/lib/format.ts` — do not
  reimplement rounding).
- **Constraints**: no new npm dependency. Reuse `normalizeSkillName`/the existing
  `skill_key ?? normalizeSkillName(skill_name_raw)` key convention from `gap.ts` for the
  have/gap scan — do not reintroduce a second key-derivation. Ties are decided by
  `formatNum(a) === formatNum(b)` string comparison exactly as specified in Task 3, never a
  hand-rolled epsilon.
- **Edge Cases**: per Task 3, exactly.
- **Files**: `frontend/src/lib/narrate.ts`
- **Tipping Point**: if narration ever needs to explain more than one runner-up (e.g. a top-3
  rationale) or a per-row rationale on every ladder item (the README's longer-term "each with a
  one-line rationale" framing), generalize this function's shape then — not needed for the
  single-top-gap V1 scope. If an LLM narrator is ever reintroduced, wrap (don't rewrite) this
  function as the deterministic `catch` branch.
```
```markdown
[FORCES]
1. Tests-as-contract (do not modify Task 3's tests) > implementation convenience
2. Simplicity > Pattern purity
```

## Task 5 — Cypress: failing tests for narration UI wiring

```markdown
[SPEC]
- **Objective**: Write failing tests for rendering `narrateTopGap`'s output in the app, once a
  resume has been submitted and a have/gap partition exists — before Magnolia implements.
- **Inputs/Outputs**: mounted `<App />` with a mocked `extractResumeSkills` (existing pattern from
  spec 004 Task 5) → after submit, a new narration region renders `narrateTopGap(...)`'s
  `narrative` string verbatim; `<TopGapNarration topGap={...} runnerUpGap={...}
  narrative={...} />` receiving props directly for isolated component tests.
- **Design Pattern**: N/A (Cypress does not choose Magnolia's implementation).
- **Bounded-AI boundary**: assert the rendered text is byte-identical to `narrateTopGap`'s return
  value — the component must not recompute, truncate, or re-word it. Assert no network/LLM call is
  made as part of rendering this region (narration is synchronous, piggybacking on the same
  `handleResumeSubmit` state update that already produces `haveSkillKeys` — no new async trigger).
- **Constraints**: vitest + testing-library + jest-axe; test/fixture files only.
- **Edge Cases** (must be asserted — WCAG 2.2 AA):
  - Before any resume is submitted (`haveSkillKeys === undefined`), no narration region renders at
    all (mirrors the existing have/gap-gating convention).
  - After a submit where every role skill is already "have" (`narrateTopGap` → `null`), a distinct,
    positive `role="status"` message renders (e.g. "No gaps — you already have every skill this
    role needs.") — never a blank region, never the stale previous role's narration.
  - After a submit that produces a real top gap, the narration renders in a labelled `<section>`
    (accessible name referencing the top gap's skill name) containing the exact narrative text as
    real (not `aria-hidden`) DOM text.
  - Switching roles or re-submitting a new resume replaces (never appends/stacks) the narration
    region — no duplicate/stale narration left in the DOM.
  - `axe()` reports zero violations with the narration region present in both the "has a top gap"
    and "no gaps" states.
- **Files**: `frontend/src/App.test.tsx`,
  `frontend/src/components/matrix/TopGapNarration.test.tsx`
- **Tipping Point**: N/A for Cypress; see Task 6.
```
```markdown
[FORCES]
1. Byte-identical, auditable narration text (locked by test) > paraphrasing/styling convenience
2. Simplicity > Pattern purity
```

## Task 6 — Magnolia: wire `narrateTopGap` into the UI

```markdown
[SPEC]
- **Objective**: Make Task 5's tests pass — call `narrateTopGap(rows, haveSkillKeys)` in `App.tsx`
  at the same point `haveSkillKeys` is set, and render its result via a new `TopGapNarration`
  component.
- **Inputs/Outputs**: `rows: RoleSkillRow[]` + `haveSkillKeys: Set<string> | undefined` (existing
  App state) → `TopGapNarration`'s rendered `<section>` (top-gap case) or a `role="status"`
  no-gaps message, matching Task 5 exactly.
- **Design Pattern**: none — simple case; one new small, single-purpose display component, no new
  abstraction.
- **Bounded-AI boundary**: `TopGapNarration` renders `narrateTopGap`'s output only — it performs no
  computation, calls no LLM, and is invoked purely from already-in-memory state (no new
  `extractResumeSkills`/edge-function call).
- **UI Scope**: structural — a new DOM region appears after resume submission; not a styling
  change to existing layout.
- **Intellectual Control**: re-invoke the `dataviz`/`a11y-sec-2026` skills for the no-color,
  non-visual-only requirement is N/A here (this is text, not a chart), but confirm the new section
  has a real accessible name and is announced sensibly relative to the existing
  loading/error/status regions already in `App.tsx` (no competing `aria-live` collision with the
  existing `extractStatus` messages).
- **Constraints**: no new npm dependency without halting and requesting an updated `[SPEC]`. Reuse
  `formatNum`-formatted text as produced by `narrateTopGap` — do not reformat numbers in the
  component. Never log or persist the narrative text beyond render.
- **Edge Cases**: per Task 5, exactly.
- **Files**: `frontend/src/App.tsx`, `frontend/src/components/matrix/TopGapNarration.tsx`,
  `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: if narration ever needs per-row (every ladder item) rationale rather than just
  the top gap, or an LLM-with-template-fallback toggle, revisit this component's single-prop-set
  shape before it grows ad hoc conditionals.
```
```markdown
[FORCES]
1. WCAG 2.2 AA + Bounded-AI text fidelity (Cypress's frozen tests) > visual polish
2. Simplicity > Pattern purity
```

---

**Relevant paths**: `README.md`, `SESSION_STATE.md`, `specs/004-resume-gap-layer.md`,
`frontend/src/lib/gap.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/normalize.ts`,
`frontend/src/lib/supabaseClient.ts`, `frontend/src/App.tsx`,
`frontend/src/components/matrix/ArbitrageLadder.tsx`,
`supabase/migrations/0002_arbitrage_scores.sql`, `supabase/migrations/0003_frontend_read_layer.sql`,
`tests/test_frontend_read_layer_migration.py`, `frontend/src/lib/supabaseClient.test.ts`,
`frontend/src/test/fixtures/roleSkillProfile.fixture.ts`.
