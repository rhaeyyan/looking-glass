# 026 — Skill-group breakdown (category-level granularity, data layer)

## Context

V2 candidate: category-level granularity in the UI, so a user can see which category is driving
their arbitrage score instead of one blended per-role number. Flagged at specs/001-ingest-pipeline.md's
Tipping Point ("if V2 needs category-level granularity in the UI, e.g. per-category scarcity
display, the dominant-category collapse must be revisited").

**Field correction made during drafting**: the goal was initially scoped against `d2_primary_category`
(the 6-value `ai`/`data`/`devops`/`engineering`/`product`/`security` vocabulary), but the human
redirected this to target `skill_group` instead — a finer, currently unenumerated D2 taxonomy
(e.g. `Language`, `Cloud` per `data/schema-notes.md`'s sample rows) that is a distinct column from
`category`. This SPEC targets `skill_group`.

Lane: **INVARIANT** — the view passthrough itself is mechanical, but the per-group aggregation
(grouping scored rows by `skill_group`, computing averages/counts/top-skill) is genuine grouping
logic; a silent miscomputation (wrong tie-break, a skill dropped from its bucket, an uncategorized
skill silently discarded) would misdirect the user with no visible sign anything was wrong.

This SPEC is **data-layer only** — no UI. A follow-on Magnolia SPEC will render the breakdown once
Redwood has recorded the real `skill_group` value set (see Constraints).

## [SPEC]

- **Objective**: (1) Expose the already-loaded `skill_group` column (`skills_core.skill_group`,
  populated via `src/ingest/join_core.py`'s dominant-D2-row collapse — a finer, currently
  unenumerated D2 taxonomy, e.g. `Language`, `Cloud`, distinct from the 6-value `category`
  vocabulary) through the existing view chain — `arbitrage_scores` → `role_skill_arbitrage` — to
  the frontend, following the exact additive `CREATE OR REPLACE VIEW` precedent specs/005's Task 2
  established. (2) Add a pure, deterministic `computeSkillGroupBreakdown(rows: RoleSkillRow[],
  haveSkillKeys?: Set<string>): SkillGroupBreakdown[]` that groups a role's fetched rows by
  `skill_group` and aggregates each group's standing, so a follow-on Magnolia SPEC (not written
  here) can render "which skill group is driving your score" instead of one blended per-role
  number. This SPEC is data-layer only — no UI change.
- **Inputs/Outputs**:
  - Migration: no runtime input; appends `arbitrage_scores.skill_group` (from `skills_core`) and
    `role_skill_arbitrage.skill_group` (passed through from `arbitrage_scores`) as new trailing
    SELECT columns, `WITH (security_invoker = true)` repeated verbatim on both `CREATE OR REPLACE
    VIEW` statements — same two-view append `arbitrage_scores`/`role_skill_arbitrage`.
  - `RoleSkillRow` (frontend/src/lib/supabaseClient.ts): add `skill_group: string | null` (nullable
    — a role skill with no `skill_key` match has no `skill_group`, same null-propagation as every
    other arbitrage_scores-sourced field on an unmatched row) and add `skill_group` to
    `fetchRoleSkillProfile`'s select list.
  - `computeSkillGroupBreakdown(rows, haveSkillKeys?) -> SkillGroupBreakdown[]` where:
    ```ts
    interface SkillGroupBreakdown {
      skill_group: string        // a real skills_core.skill_group value, or "Uncategorized"
      total_skills: number
      scored_skills: number
      have_skills: number | null // null if haveSkillKeys is undefined (no resume yet)
      gap_skills: number | null  // null if haveSkillKeys is undefined
      avg_arbitrage_score: number | null // null if scored_skills === 0
      top_skill: { skill_name_raw: string; arbitrage_score: number } | null
    }
    ```
    grouped **dynamically** by each row's own `skill_group` value (no fixed enum/switch — the
    group set is whatever actually appears in `rows`, plus the literal `"Uncategorized"` bucket
    for `null`), sorted descending by `avg_arbitrage_score`, null-average groups last, ties broken
    alphabetically by `skill_group` (mirrors `join_core.py`'s dominant-row tie-break convention
    and `ArbitrageLadder`'s null-last sort convention — no new sort semantics invented).
- **Design Pattern**: none — simple case. One dynamic groupby key, one aggregate pass, no
  polymorphism to encapsulate. Grouping dynamically (rather than a hardcoded value list) is a
  direct mitigation for `skill_group`'s value set being unenumerated in this checkout — see
  Constraints.
- **Bounded-AI boundary**: 100% deterministic. The migration passes through an already-computed
  column verbatim (zero new computation in SQL). `computeSkillGroupBreakdown` only counts, sums,
  and averages already-computed `arbitrage_score`/`demand_score`/`scarcity_index` fields — it
  invents no new metric and never touches an LLM. The narrative sentence ("skill group X is
  driving your score because...") is explicitly **out of scope** here — presentation copy for the
  follow-on Magnolia SPEC, built the same deterministic-template way specs/005's narrator was.
- **Verification Oracle**: `tests/test_frontend_read_layer_migration.py` (extended with new regex
  assertions: `skill_group` present in the `arbitrage_scores` `CREATE OR REPLACE VIEW` trailing
  column list, `skill_group` present in `role_skill_arbitrage`'s trailing column list, both `WITH
  (security_invoker = true)` clauses still present after the replace) and
  `frontend/src/lib/skillGroupBreakdown.test.ts` (vitest, pure-function unit tests against
  **fixture** rows with hand-picked `skill_group` strings — no live Supabase, no dependency on
  the real enumeration to pass).
- **UI Scope**: N/A — this SPEC produces no UI. (Flag for the follow-on: rendering the breakdown
  as a filter/summary panel on the existing matrix layout will be **structural**, not cosmetic —
  new interactive grouping control, not styling on unchanged DOM. That follow-on SPEC will also
  need to know the group set's actual cardinality for layout purposes — e.g. a 4-value set lays
  out as chips, a 20-value set needs a scrollable list or search — which is exactly what Redwood's
  live-query enumeration below feeds into.)
- **Intellectual Control**: `skill_group` is already resolved to a single deterministic value per
  `skill_key` by the existing dominant-D2-row collapse (`join_core.py::_dominant_row`, same
  algorithm already used for `d1_primary_category`/`d2_primary_category`) — this SPEC adds no new
  join/collapse logic, only a passthrough. Grouping dynamically off the row data itself (rather
  than importing/hardcoding an assumed value list) means the aggregation is correct regardless of
  what the real enumeration turns out to be — the code cannot silently misroute a skill into a
  wrong bucket from a stale or incomplete hardcoded list, which was the actual risk with the
  earlier `category`-vocabulary draft's now-corrected premise.
- **Constraints**: no new npm/pip dependency. DDL only in `supabase/migrations/`, applied via the
  Supabase CLI, matching every prior migration in this repo. **`skill_group`'s full value set is
  not enumerated anywhere in this checkout** — `data/schema-notes.md`'s D2 sample shows only two
  illustrative values (`Language`, `Cloud`) from 3 rows, and the raw D2 CSV (`data/raw/d2/`) is
  gitignored and absent locally (only `data/raw/d4/` and
  `data/raw/AI-Skills-in-Job-Requirements/` exist in this checkout). Mirroring specs/025's
  precedent for the same situation: **Redwood must enumerate the real value set** before this
  SPEC is considered complete for downstream (Magnolia) planning purposes, via either (a) a
  live, read-only anon-key query — `SELECT DISTINCT skill_group FROM skills_core ORDER BY
  skill_group` — against the already-loaded, RLS-public `skills_core` table (no secret/service-role
  key involved, same category of live verification specs/003 Task 2 already performs), or (b)
  re-running the ingest pipeline against `data/raw/d2/skill-demand-index.csv` if it becomes
  available locally. This enumeration is **not a blocker for this SPEC's own code or tests** (the
  groupby is dynamic and the unit tests use fixture data), but its result must be recorded
  (e.g. appended to `data/schema-notes.md`'s D2 section) before Magnolia's follow-on SPEC is
  written, so that SPEC's layout/UI-Scope decision is made against real cardinality, not a guess.
- **Edge Cases** (must be asserted):
  - A row with `skill_key: null` (no D1/D2 match) has `skill_group: null` → bucketed into a
    literal `"Uncategorized"` group, never silently dropped and never merged into another group.
  - A group with zero scored rows → `avg_arbitrage_score: null`, `top_skill: null` — never `0`,
    which would misrepresent "no data" as "worst score."
  - `haveSkillKeys` omitted entirely (no resume submitted yet) → `have_skills`/`gap_skills` both
    `null` for every group, distinguishing "no resume yet" from "resume submitted, zero gaps in
    this group" (`0`).
  - Tie in `avg_arbitrage_score` between two groups → alphabetical tie-break by `skill_group`,
    deterministic and reproducible.
  - Determinism: calling `computeSkillGroupBreakdown` twice on identical input yields
    byte-identical output (same discipline as specs/001 Task 3 and specs/002 Task 1).
  - The function must not assume any particular number or set of `skill_group` values — a fixture
    test must include an invented group name absent from any prior fixture and prove it still
    buckets correctly (regression guard against ever hardcoding an enum, per Constraints).
- **Files**: `supabase/migrations/<timestamp>_expose_skill_group.sql`,
  `tests/test_frontend_read_layer_migration.py`, `frontend/src/lib/supabaseClient.ts`,
  `frontend/src/lib/skillGroupBreakdown.ts`, `frontend/src/lib/skillGroupBreakdown.test.ts`
- **Tipping Point**: if `skill_group` enumeration (once Redwood records it) turns out to have very
  high cardinality (e.g. >15-20 distinct values) or nests meaningfully under `category`, revisit
  whether a two-level `category → skill_group` breakdown is warranted instead of one flat groupby;
  not needed until the real value set is known.

## [FORCES]

1. Building against the human's actually-intended field (`skill_group`) > the previous draft's
   corrected-but-unrequested `category` field
2. Dynamic, data-driven grouping (no hardcoded enum) > blocking on an enumeration this checkout
   cannot produce
3. Deterministic, auditable aggregation locked by test > an ad hoc groupby computed inline in a
   future UI component
4. Simplicity > Pattern purity
