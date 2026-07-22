# 001 — Ingest Pipeline (README MVP step 1)

**Status**: Approved 2026-07-22. Tasks 1–6 authorized to proceed against the measured 141-skill
D1+D2 core (see discrepancy note below). Task 7 (docs reconciliation) authorized — human elected
to accept 141 and update docs once the pipeline locks the number in via a passing test, rather
than re-verify independently first.

**Context**: Birch extracted and measured the three raw Kaggle datasets (`data/schema-notes.md`
has full column lists/samples/null-count tables). Two documented invariants in AGENTS.md/README
were found to drift from the real data:

- **D1 ∩ D2 core: measured 141, not the documented 139.** Exact string match, no case/punctuation
  ambiguity. D2 has 7 skills D1 lacks: `duckdb`, `qlik`, `r`, `ray`, `streamlit`, `supabase`,
  `talend`.
- **D2's own distinct-skill count: measured 148, not the documented 147.**
- The three-way overlap (**58**) and the six V1 roles both check out clean against the docs.

## Plan summary (Cedar)

Pure deterministic data-engineering pipeline — no LLM anywhere in it (resume extraction/narration
are later MVP steps, out of scope here). No GoF pattern earned: 4 fixed CSV shapes, one fixed
grain-resolution algorithm, one fixed schema — `Design Pattern: none — simple case` throughout,
`Simplicity > Pattern purity`.

Key design decision: D1/D2's (snapshot_date × category) grain collapses to one row per skill by
picking the **dominant category** per skill (highest count field, tie-break alphabetically) rather
than a weighted average across percentage fields with non-comparable denominators — every stored
number stays traceable to one real source row.

**Dependency decisions (Cedar's authority)**: authorize `supabase-py` (official REST/auth client)
and `pytest`. Do **not** authorize `pandas` — stdlib `csv`/`dataclasses` fully cover this row count
(≤3,438) and keep the pipeline's audit surface smaller. Schema DDL lives in
`supabase/migrations/`, applied via the Supabase CLI, not the Python client.

Tasks are strictly sequential (parse → resolve join → schema/load → docs) — no parallel
worktrees, since each phase consumes the prior phase's output.

---

## Task 1 — Cypress: failing tests for CSV parsing & skill-name normalization

```markdown
[SPEC]
- **Objective**: Write failing tests (fail for the right reason — modules don't exist yet) for
  four CSV parsers (D1, D2, D3-overall, D3-by-role → typed rows) and a `normalize_skill(name: str) -> str`
  function, before Redwood implements them.
- **Inputs/Outputs**: Inline CSV fixtures (via `io.StringIO`, using Birch's actual sample rows from
  data/schema-notes.md — no need for separate checked-in fixture files at this granularity) →
  asserted list-of-dataclass/dict outputs with correct types and null handling.
- **Design Pattern**: none — simple case (4 fixed, non-polymorphic source shapes).
- **Bounded-AI boundary**: 100% deterministic; no LLM anywhere in this pipeline.
- **Intellectual Control**: normalization correctness is the highest-risk surface (false merges
  would silently corrupt the join) — cover it explicitly with adversarial cases from real data.
- **Constraints**: pytest only; no network/DB access; no dependency on `data/raw/` (gitignored,
  may not exist in CI) — this task's fixtures must be self-contained.
- **Edge Cases** (must be asserted):
  - `C#`, `C++`, `C` normalize to three *distinct* keys (must NOT collapse via `#`/`+` stripping).
  - `CI/CD` normalizes consistently on both D1's and D3's spelling (case-fold + separator-collapse
    applied identically on both sides).
  - D1's `median_days_open`/`salary_premium_pct` empty-string cells parse to `None`, not `0`/`NaN`
    — and a non-null `scarcity_score` must NOT be conflated with "has complete input data."
  - D3-by-role's `role_family` values are captured **verbatim**, including internal slash-spacing
    (`Data Scientist / ML`, `DevOps / Cloud / SRE`), not AGENTS.md's compact shorthand.
- **Files**: `tests/test_ingest_parse.py`, `tests/test_normalize.py`
- **Tipping Point**: if a 5th data source is added with a genuinely different parsing strategy
  that must be chosen at runtime, revisit for a Strategy pattern — not needed at 4 fixed sources.
```
```markdown
[FORCES]
1. Correctness on real adversarial cases (C#/C++, nulls) > premature generalization to fuzzy/alias matching
2. Simplicity > Pattern purity
```

## Task 2 — Redwood: implement CSV parsing & normalization

```markdown
[SPEC]
- **Objective**: Make Task 1's tests pass. Parse the 4 CSVs into typed rows; implement
  `normalize_skill()`.
- **Inputs/Outputs**: File paths under `data/raw/{d1,d2,d3}/*.csv` → typed row lists
  (`dataclass` or `TypedDict`) matching Task 1's fixtures/assertions exactly.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic parsing/string-normalization; no LLM.
- **Intellectual Control**: stdlib `csv` module only (no pandas) — row counts here (≤3,438) don't
  need vectorized ops, and staying dependency-light keeps this auditable.
- **Constraints**: Python 3.12 stdlib only for this task (`csv`, `dataclasses`, `re`); no new
  dependencies without Cedar sign-off (none needed here).
- **Edge Cases**: same list as Task 1 — implementation must satisfy those tests without modifying
  them.
- **Files**: `pyproject.toml`, `src/ingest/__init__.py`, `src/ingest/parse.py`, `src/ingest/normalize.py`
- **Tipping Point**: see Task 1.
```
```markdown
[FORCES]
1. Tests-as-contract (do not modify Cypress's tests) > implementation convenience
2. Simplicity > Pattern purity
```

## Task 3 — Cypress: failing tests for the D1+D2 join, grain resolution, D3 corroboration, and per-role profiles

```markdown
[SPEC]
- **Objective**: Write failing tests for (a) the D1+D2 grain-collapse (dominant-category rule) into
  a single 141-skill core, (b) the three-way (D1∩D2∩D3) 58-skill corroboration badge, (c) the
  D3-by-role profile table (450 rows / 15 roles / 30-per-role, six V1 roles present verbatim).
- **Inputs/Outputs**: Two test layers —
  1. **Unit tests** (fixture-based, CI-safe, no dependency on `data/raw/`): dominant-category
     tie-break is deterministic and reproducible across repeated calls given the same input rows.
  2. **Integration tests** (against real files in `data/raw/`, `pytest.skip()` with a clear message
     if the directory is absent — it's gitignored and won't exist on a fresh clone/CI): assert
     `len(core) == 141`, three-way overlap `== 58`, all six V1 `role_family` strings present with
     exact spacing, exactly 450 role-profile rows / 30 per role.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; assert the same inputs always produce the same
  core-row output (guards the Determinism invariant from cypress.md).
- **Intellectual Control**: the integration layer is the actual regression guard for the
  139→141 discrepancy — once this SPEC is approved, "141" becomes the enforced number, not a doc
  claim.
- **Constraints**: integration tests must not fail (must skip) when `data/raw/` is absent — do not
  make CI depend on gitignored data.
- **Edge Cases**: a skill present in D2 but not D1 (e.g. `duckdb`) must be *excluded* from the
  141-skill core, not silently included with null scarcity fields. A D3 role-skill with no
  match in the 141-core (e.g. a soft skill like "communication") must still appear in the
  role-profile output — just without a joinable `skill_key` — never dropped.
- **Files**: `tests/test_skill_core_join.py`, `tests/test_data_invariants.py`
- **Tipping Point**: if V2 needs category-level granularity in the UI (e.g., per-category scarcity
  display), the dominant-category collapse must be revisited — this is the documented threshold.
```
```markdown
[FORCES]
1. Auditability of the join rule (regression-locks 141, not 139) > convenience of trusting docs
2. Simplicity > Pattern purity
```

## Task 4 — Redwood: implement join resolution, corroboration badge, role profiles

```markdown
[SPEC]
- **Objective**: Make Task 3's tests pass — produce the 141-skill core rows (with D3 corroboration
  columns populated for the 58-skill overlap) and the 450-row role-profile table, in memory (no DB
  write yet — that's Task 6).
- **Inputs/Outputs**: parsed rows from Task 2 → `list[SkillCoreRow]` (141 rows) and
  `list[RoleProfileRow]` (450 rows). `SkillCoreRow` fields: `skill_key` (PK, normalized),
  `skill_name` (D1's display casing), `skill_group` (from D2, nullable), `d1_primary_category`,
  `d2_primary_category`, D1 fields (`d1_demand_count`, `d1_demand_pct`, `median_days_open`
  nullable, `salary_premium_pct` nullable, `repost_rate_pct`, `scarcity_score`), D2 fields
  (`d2_listing_count`, `d2_total_listings`, `d2_demand_pct`, `d2_required_count`),
  `d3_corroborated: bool`, `d3_postings_with_skill` nullable, `d3_pct_of_all_postings` nullable.
  `RoleProfileRow` fields: `role_family` (verbatim), `skill_name_raw`, `skill_key` (nullable
  soft-reference into `SkillCoreRow`, not enforced), `postings_with_skill`, `pct_of_role`,
  `role_postings`.
- **Design Pattern**: none — simple case (one grain-collapse algorithm, applied identically to D1
  and D2 via a shared parameterized helper — DRY, not a GoF pattern).
- **Bounded-AI boundary**: fully deterministic; this module computes zero scores (that's MVP step
  2, out of scope) — it only resolves grain and joins, no `arbitrage_score` here.
- **Intellectual Control**: dominant-category selection is a pure `groupby → argmax(count field) →
  tie-break alphabetically` — simple, traceable to one real source row per output row, easy to
  spot-check against `data/schema-notes.md`'s sample data.
- **Constraints**: stdlib only, no new dependencies.
- **Edge Cases**: per Task 3. Additionally — a role-profile skill whose `skill_key` doesn't resolve
  in the core must still get a `skill_key` value (computed via `normalize_skill`), just with no
  guaranteed match; downstream (MVP step 4) is responsible for flagging "demand only, scarcity
  unknown," not this task.
- **Files**: `src/ingest/join_core.py`, `src/ingest/corroborate.py`, `src/ingest/role_profile.py`,
  `src/ingest/pipeline.py`
- **Tipping Point**: same as Task 3.
```
```markdown
[FORCES]
1. Traceable, auditable aggregation > statistically sophisticated but opaque weighted averages
2. Simplicity > Pattern purity
```

## Task 5 — Cypress: failing tests for the Supabase schema + loader idempotency

```markdown
[SPEC]
- **Objective**: Write failing tests validating (a) the migration SQL is syntactically well-formed
  and declares the expected constraints, (b) the loader's upsert logic is idempotent (loading the
  same row set twice does not duplicate rows or change row count) — as **pure-Python logic tests**,
  not live-Supabase integration tests.
- **Inputs/Outputs**: SQL file read as text (regex/structural assertions: PK on `skills_core.skill_key`,
  composite PK on `skill_role_profile(role_family, skill_name_raw)`, `not null` on required
  columns, nullable on `median_days_open`/`salary_premium_pct`/`d3_*` columns); loader upsert
  function tested against an in-memory stub/mock of the Supabase client (no live credentials).
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic; no LLM.
- **Intellectual Control**: deliberately **no** automated test hits a live Supabase instance — per
  Security (Zero-Trust), no live production credentials may ever be in agent context. True
  end-to-end load verification is a human-run manual smoke step post-merge, not part of the
  automated suite.
- **Constraints**: mock/stub the Supabase client; never require real `SUPABASE_URL`/service-role
  key to make this test suite pass.
- **Edge Cases**: re-running the loader with an updated `scarcity_score` for an existing
  `skill_key` must update in place, not insert a duplicate row (test this explicitly).
- **Files**: `tests/test_schema_constraints.py`, `tests/test_loader_idempotency.py`
- **Tipping Point**: if V2 needs live-DB integration tests, that requires a dedicated
  ephemeral-sandbox + JIT-credential layer per AGENTS.md's security-isolation gate — not this MVP.
```
```markdown
[FORCES]
1. Zero live credentials in agent/test context > integration-test coverage of live Supabase
2. Simplicity > Pattern purity
```

## Task 6 — Redwood: Supabase migration + loader

```markdown
[SPEC]
- **Objective**: Make Task 5's tests pass — define the Postgres schema and a loader that upserts
  the Task 4 outputs into it.
- **Inputs/Outputs**: `list[SkillCoreRow]`, `list[RoleProfileRow]` → rows in two tables:
  `skills_core` (PK `skill_key`) and `skill_role_profile` (composite PK
  `(role_family, skill_name_raw)`, `skill_key` as an unenforced logical reference — many role
  skills are generic/soft terms with no core match, so no FK constraint).
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic load of pre-computed rows; no LLM; no scoring
  happens here (arbitrage_score is MVP step 2, a separate future SPEC).
- **Intellectual Control**: SQL DDL lives in `supabase/migrations/` applied via the Supabase CLI
  (not through the Python client — DDL and data-load are kept in separate tools/concerns); data
  load goes through `supabase-py` against the REST API using env-var credentials only.
- **Constraints**: **New dependency authorized by Cedar: `supabase-py`** (official client; thin
  REST/auth wrapper, justified over raw `psycopg2` to avoid a C-extension build dependency for a
  solo MVP). No Supabase URL/key literals anywhere in code — `.env.example` documents variable
  *names* only (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), no real values. Never commit a
  populated `.env`.
- **Edge Cases**: loader must be safely re-runnable (upsert on `skill_key` conflict) — this is what
  Task 5's idempotency test enforces.
- **Files**: `supabase/migrations/0001_init_skills_schema.sql`, `src/ingest/load_supabase.py`,
  `src/ingest/__main__.py`, `.env.example`, `pyproject.toml`
- **Tipping Point**: if row counts grow beyond a few thousand or upserts need batching/retry logic
  beyond simple upsert-per-row, revisit for a batched-writer abstraction.
```
```markdown
[FORCES]
1. Reproducible, idempotent loads > convenience of a one-shot script
2. Simplicity > Pattern purity
```

## Task 7 — Redwood: docs reconciliation

```markdown
[SPEC]
- **Objective**: Update README.md's data-sources table and AGENTS.md's data-invariants section to
  match the measured numbers: D1+D2 core 139→141, D2's own distinct-skill count 147→148.
- **Inputs/Outputs**: README.md's D1/D2 rows and AGENTS.md's "D1 + D2 = 139-skill core" line →
  corrected to 141/148, with a short note that the numbers were re-validated against the raw CSVs
  on 2026-07-22 (once Task 3's integration test locks 141 in as a passing, enforced assertion).
- **Design Pattern**: none — docs-only.
- **Bounded-AI boundary**: N/A — no code/data path affected.
- **Constraints**: do not touch the 58-skill three-way figure (confirmed correct) or the six V1
  role names/coverage table.
- **Edge Cases**: none.
- **Files**: `README.md`, `AGENTS.md`
- **Tipping Point**: N/A.
```
```markdown
[FORCES]
1. Docs accuracy against measured ground truth > preserving originally-scoped numbers
2. Simplicity > Pattern purity
```

---

**Relevant paths**: `data/schema-notes.md`, `README.md`, `AGENTS.md`, `SESSION_STATE.md`,
`.gitignore`, `.claude/agents/redwood.md`, `.claude/agents/cypress.md`.
