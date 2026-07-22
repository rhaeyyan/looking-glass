# 002 — Arbitrage Score (README MVP step 2)

**Status**: Approved 2026-07-22. Both flagged judgment calls (demand = d2_demand_pct only;
scarcity weights 0.6/0.2/0.2 with a 60-day cap) accepted as-is. Tasks 1–5 authorized.

**Context**: Pure deterministic scoring layer on top of the already-loaded `skills_core` table
(built in `specs/001-ingest-pipeline.md`). No new ingestion, no LLM anywhere in this SPEC.

## Plan summary (Cedar)

- **Where it lives**: mirrors the ingest pipeline's own pattern — compute in a pure, unit-tested
  Python module (`src/scoring/arbitrage.py`), persist via an idempotent upsert into a new
  `skill_arbitrage_scores` table, and expose a read-only Postgres `arbitrage_scores` VIEW (join of
  `skills_core` + `skill_arbitrage_scores`) as the single query surface later consumers (UI,
  resume-gap layer) read from. The view does zero computation — pure projection — so it stays
  testable via text/structural SQL assertions, no live-DB test infrastructure needed.
- **Demand** = `d2_demand_pct` only, verbatim. D2 is the dataset actually scoped as the demand
  index with a documented denominator; `d1_demand_pct` is retained as a passthrough audit field
  only, never blended in — averaging would fabricate a number not traceable to one real source
  row, the same anti-pattern `join_core.py` rejected for the grain-collapse.
- **Scarcity** = weighted composite of `scarcity_score` (0.6, always present) + `salary_premium_pct`
  (0.2, clipped to 100) + `median_days_open` (0.2, capped at 60 days), with graceful degradation
  by **weight renormalization** (never zero-substitution) when a nullable field is missing, plus a
  `scarcity_data_completeness` label (`full` / `missing_salary_premium` / `missing_days_open` /
  `missing_both`) so no consumer mistakes a partial-data score for a complete one. Weights/cap are
  named module-level constants (no magic numbers) — human-approved as reasonable starting defaults,
  easy to retune later without touching the formula's structure.
- **D3 badge**: `d3_corroborated`/`d3_pct_of_all_postings` pass through as separate fields, never
  blended into `arbitrage_score`. Presentation copy ("confirmed across 360k+ postings") deferred
  to Magnolia's later UI task.
- **Output contract**: `arbitrage_score = demand_score * scarcity_index` (an ordinal ranking
  figure), with `demand_score` and `scarcity_index` surviving as their own fields — required for
  the quadrant scatter's separate x/y axes.
- `skill_arbitrage_scores` gets a real FK to `skills_core(skill_key)` (unlike `skill_role_profile`'s
  soft reference) since every core row gets exactly one score row — total coverage, no dangling
  references possible.

Tasks are sequential (mirroring `specs/001-ingest-pipeline.md`'s precedent) — no parallel
worktrees. One new Supabase migration authorized (`0002_arbitrage_scores.sql`); no new NPM/PIP
dependencies.

---

## Task 1 — Cypress: failing tests for the deterministic scoring formula

```markdown
[SPEC]
- **Objective**: Write failing tests (module doesn't exist yet) for `compute_arbitrage_score`,
  the pure function that turns one `SkillCoreRow` into one `ArbitrageScoreRow` — demand,
  scarcity, and the blended score — before Redwood implements it.
- **Inputs/Outputs**: `SkillCoreRow` instances (built inline, using real field combinations from
  `data/schema-notes.md`'s samples) → `ArbitrageScoreRow(skill_key, demand_score, scarcity_index,
  scarcity_data_completeness, arbitrage_score)`.
- **Design Pattern**: none — simple case (one fixed formula, no variance to encapsulate).
- **Bounded-AI boundary**: 100% deterministic; no LLM anywhere in this module or its tests.
- **Intellectual Control**: this is the actual regression guard locking in the formula's fixed
  constants (weights 0.6/0.2/0.2, 60-day cap, demand = `d2_demand_pct` only) as enforced
  behavior, not a doc claim — matches how Task 3/001-ingest-pipeline.md locked in 141/58.
- **Constraints**: pytest only; no CSV/DB/network access — pure in-memory `SkillCoreRow` fixtures.
- **Edge Cases** (must be asserted, with exact expected floats via `pytest.approx`):
  - All three scarcity inputs present → `scarcity_data_completeness == "full"`, weighted 0.6/0.2/0.2.
  - `salary_premium_pct is None` → `"missing_salary_premium"`, weights renormalize to 0.75
    (scarcity_score) / 0.25 (days-open), **not** zero-substituted.
  - `median_days_open is None` → `"missing_days_open"`, weights renormalize to 0.75/0.25.
  - Both `None` → `"missing_both"`, `scarcity_index == scarcity_score` exactly.
  - `median_days_open` above the 60-day cap (e.g. 90) → clipped, sub-component == 100.0, never > 100.
  - `salary_premium_pct` above 100 (e.g. 150.0) → clipped to a 100.0 sub-component.
  - `demand_score` always equals `d2_demand_pct` verbatim — explicit assertion that
    `d1_demand_pct` is **never** read/blended (regression guard against future "just average them").
  - `arbitrage_score == demand_score * scarcity_index` exactly.
  - `d3_corroborated`/`d3_pct_of_all_postings` never affect `scarcity_index`, `demand_score`, or
    `arbitrage_score` — two rows identical except for D3 fields must score identically.
  - Determinism: calling `compute_arbitrage_score` twice on an identical input row yields
    byte-identical output (guards the Determinism invariant from cypress.md, as in Task 3/001).
- **Files**: `tests/test_arbitrage_score.py`
- **Tipping Point**: if a second nullable scarcity input is ever added, or the weights/cap need to
  vary by skill category, revisit — a single fixed-weight formula is not built for per-category
  variance.
```
```markdown
[FORCES]
1. Auditability of fixed constants (weights, cap, demand-source choice) locked by test > leaving
   them as tunable/implicit implementer choices
2. Simplicity > Pattern purity
```

## Task 2 — Redwood: implement the scoring formula

```markdown
[SPEC]
- **Objective**: Make Task 1's tests pass. Implement `ArbitrageScoreRow` and
  `compute_arbitrage_score(row: SkillCoreRow) -> ArbitrageScoreRow`.
- **Inputs/Outputs**: per Task 1's assertions exactly.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; no LLM.
- **Intellectual Control**: named module-level constants only — `SCARCITY_SCORE_WEIGHT = 0.6`,
  `SALARY_PREMIUM_WEIGHT = 0.2`, `DAYS_OPEN_WEIGHT = 0.2`, `DAYS_OPEN_CAP = 60.0` — no magic
  numbers inline, no dataset-wide statistics (min/max/mean) computed across other rows: each
  row's score must depend only on its own fields plus these fixed constants, so any single row
  is independently reproducible and auditable without needing the rest of the dataset.
- **Constraints**: Python 3.12 stdlib only; no new dependencies.
- **Edge Cases**: satisfy Task 1's list without modifying its tests. Do not clip `scarcity_score`
  itself (trust the source's primary index as-is — only the two constants we invented
  normalization for, salary premium and days-open, get clipped).
- **Files**: `src/scoring/__init__.py`, `src/scoring/arbitrage.py`
- **Tipping Point**: see Task 1.
```
```markdown
[FORCES]
1. Tests-as-contract (do not modify Cypress's tests) > implementation convenience
2. Simplicity > Pattern purity
```

## Task 3 — Cypress: failing tests for the arbitrage-score schema + loader idempotency

```markdown
[SPEC]
- **Objective**: Write failing tests validating (a) the new migration SQL is well-formed and
  declares the expected table/view/constraints, (b) the arbitrage-score loader's upsert is
  idempotent — as pure-Python logic tests, exactly mirroring Task 5 of
  `specs/001-ingest-pipeline.md`'s pattern (no live Supabase).
- **Inputs/Outputs**: SQL file read as text (regex/structural assertions: `CREATE TABLE
  skill_arbitrage_scores` with `skill_key` as PRIMARY KEY and a `FOREIGN KEY ... REFERENCES
  skills_core(skill_key)` — a real FK is appropriate here, unlike `skill_role_profile`'s soft
  reference, because every `skills_core` row gets exactly one arbitrage-score row, total
  coverage, no dangling references possible; `NOT NULL` on `demand_score`, `scarcity_index`,
  `scarcity_data_completeness`, `arbitrage_score`; and `CREATE VIEW arbitrage_scores AS ...`
  selecting both the raw passthrough columns from `skills_core` — `d1_demand_pct`,
  `d2_demand_pct`, `scarcity_score`, `salary_premium_pct`, `median_days_open`, `d3_corroborated`,
  `d3_pct_of_all_postings` — and the computed columns from `skill_arbitrage_scores`); loader
  upsert tested against an in-memory stub/mock client (no live credentials).
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; no LLM.
- **Intellectual Control**: the view does zero computation of its own (a pure join/projection of
  already-computed columns) — so a text/structural assertion is sufficient to validate it; no
  live-Postgres execution is needed to trust its correctness, preserving the "no live credentials
  in agent/test context" decision from Task 5/001.
- **Constraints**: mock/stub the Supabase client; never require real `SUPABASE_URL`/service-role
  key.
- **Edge Cases**: re-running the loader with an updated `arbitrage_score` for an existing
  `skill_key` must update in place, not duplicate (test explicitly, as in Task 5/001).
- **Files**: `tests/test_arbitrage_schema.py`, `tests/test_arbitrage_loader_idempotency.py`
- **Tipping Point**: if V2 needs live-DB integration tests, requires the ephemeral-sandbox +
  JIT-credential layer per AGENTS.md's security-isolation gate — not this MVP.
```
```markdown
[FORCES]
1. Zero live credentials in agent/test context > integration-test coverage of live Supabase
2. Simplicity > Pattern purity
```

## Task 4 — Redwood: migration + loader + scoring pipeline wiring

```markdown
[SPEC]
- **Objective**: Make Task 3's tests pass — define the `skill_arbitrage_scores` table + the
  `arbitrage_scores` view, implement the upsert loader, and wire `compute_arbitrage_score` over a
  full `list[SkillCoreRow]` with its own CLI entrypoint.
- **Inputs/Outputs**: `list[SkillCoreRow]` (from re-running `src.ingest.pipeline.run_pipeline`,
  reusing the already-tested ingest chain rather than reading back from Supabase — keeps scoring
  reproducible straight from the same raw CSVs, no read-time DB dependency) →
  `list[ArbitrageScoreRow]` → upserted into `skill_arbitrage_scores`, keyed on `skill_key`.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; no LLM; this stage computes/persists scores only,
  no ingestion/join logic duplicated here.
- **Intellectual Control**: kept as an independent module/CLI (`src/scoring/`, not folded into
  `src/ingest/__main__.py`) — decouples "recompute scores" from "re-ingest raw data," and avoids
  touching Task 6/001's already-tested ingest entrypoint. `skill_arbitrage_scores` is a real FK
  child of `skills_core` (unlike `skill_role_profile`), since coverage is total and enforced
  referential integrity is safe and desirable here.
- **Constraints**: reuses the already-authorized `supabase-py` dependency; no new dependencies.
  DDL lives in `supabase/migrations/`, applied via the Supabase CLI, matching Task 6/001's
  separation of DDL from data-load tooling.
- **Edge Cases**: loader must be safely re-runnable (upsert on `skill_key` conflict), per Task 3.
  A `skills_core` row with no corresponding role-profile membership still gets scored (scoring
  operates on the full 141-skill core, independent of any role) — role-gap filtering is
  MVP step 4's concern, not this task's.
- **Files**: `supabase/migrations/0002_arbitrage_scores.sql`, `src/scoring/load_supabase.py`,
  `src/scoring/pipeline.py`, `src/scoring/__main__.py`
- **Tipping Point**: if scoring needs to run against already-loaded Supabase data without local
  CSV access (e.g. a scheduled recompute job with no `data/raw/`), revisit to add a
  read-from-Supabase input path — not needed for this MVP.
```
```markdown
[FORCES]
1. Reproducible, idempotent loads > convenience of a one-shot combined script
2. Simplicity > Pattern purity
```

## Task 5 — Redwood: docs reconciliation

```markdown
[SPEC]
- **Objective**: Replace README.md's placeholder `arbitrage_score = f(demand, scarcity)` in "How
  the score works" with the actual implemented formula and null-handling behavior, so docs don't
  drift from Task 1–4's enforced tests (same discipline as Task 7/001).
- **Inputs/Outputs**: README.md's "How the score works" section → states `demand_score =
  d2_demand_pct` (with a one-line rationale for not blending `d1_demand_pct`), the
  scarcity-composite weights/cap constants, and the `scarcity_data_completeness` label as the
  degrade-gracefully mechanism; the D3 badge as a separate field, never blended into the score.
- **Design Pattern**: none — docs-only.
- **Bounded-AI boundary**: N/A.
- **Constraints**: do not alter the "2026 prediction axis" note, data-sources table, or role
  coverage table — out of scope for this reconciliation.
- **Edge Cases**: none.
- **Files**: `README.md`
- **Tipping Point**: N/A.
```
```markdown
[FORCES]
1. Docs accuracy against the now-enforced formula > preserving the original placeholder wording
2. Simplicity > Pattern purity
```

---

**Relevant paths**: `README.md`, `src/ingest/join_core.py`, `src/ingest/parse.py`,
`src/ingest/pipeline.py`, `src/ingest/load_supabase.py`, `src/ingest/__main__.py`,
`supabase/migrations/0001_init_skills_schema.sql`, `data/schema-notes.md`,
`specs/001-ingest-pipeline.md`, `SESSION_STATE.md`.
