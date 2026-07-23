import type { RoleSkillRow } from '../../lib/supabaseClient'

// Shared fixture for the demand×scarcity matrix + arbitrage ladder tests.
//
// Column names and types are copied VERBATIM from `RoleSkillRow` in
// `frontend/src/lib/supabaseClient.ts` (mirrors the `role_skill_arbitrage` view). Every displayed
// number in the components under test must trace back to one of these fields (Bounded-AI boundary:
// nothing is computed in the view/UI layer that isn't already in the row).
//
// The rows are deliberately NOT pre-sorted by `arbitrage_score`, so the ladder's descending sort is
// actually exercised rather than accidentally satisfied by input order. Exactly one row has
// `skill_key: null` — the "demand only, scarcity unknown" case where the view's LEFT JOIN found no
// D1/D2 arbitrage match, so every numeric arbitrage field is null. That row must survive into the
// table and the ladder (flagged), and be excluded only from the scatter's plotted (x,y) points.
// `salary_premium_pct` / `median_days_open` (Task 1 of specs/005-template-narrator.md) are added
// below on every row, including the demand-only `gRPC` row (both `null` there, same as every other
// nullable field on that row). Until Task 2 adds these two fields to `RoleSkillRow`
// (frontend/src/lib/supabaseClient.ts), this file fails `tsc --noEmit` on excess-property checking
// — that is the deliberate type-level RED this task locks in.
export const roleSkillProfileFixture: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'Kubernetes',
    skill_key: 'kubernetes',
    pct_of_role: 55,
    postings_with_skill: 1800,
    demand_score: 91,
    scarcity_index: 34,
    arbitrage_score: 7.3,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 6.2,
    salary_premium_pct: 11.8,
    median_days_open: 30,
  },
  {
    role_family: 'Backend',
    skill_name_raw: 'Rust',
    skill_key: 'rust',
    pct_of_role: 18,
    postings_with_skill: 420,
    demand_score: 63,
    scarcity_index: 88,
    arbitrage_score: 9.1,
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 1.4,
    salary_premium_pct: 22.6,
    median_days_open: 45,
  },
  {
    role_family: 'Backend',
    skill_name_raw: 'PostgreSQL',
    skill_key: 'postgresql',
    pct_of_role: 42,
    postings_with_skill: 1200,
    demand_score: 88,
    scarcity_index: 12,
    arbitrage_score: 4.2,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 5.1,
    salary_premium_pct: 14.5,
    median_days_open: 21,
  },
  {
    // Demand-only row: no D1/D2 arbitrage match, so skill_key and every numeric field are null.
    role_family: 'Backend',
    skill_name_raw: 'gRPC',
    skill_key: null,
    pct_of_role: 9,
    postings_with_skill: 210,
    demand_score: null,
    scarcity_index: null,
    arbitrage_score: null,
    scarcity_data_completeness: null,
    d3_corroborated: null,
    d3_pct_of_all_postings: null,
    salary_premium_pct: null,
    median_days_open: null,
  },
]

// Convenience projections for readable assertions. Kept in the fixture so the "expected" ordering
// lives next to the data it is derived from.

// Skills that HAVE a numeric (x=demand, y=scarcity) coordinate — the only rows the scatter plots.
export const SCORED_SKILLS = ['Kubernetes', 'Rust', 'PostgreSQL'] as const
export const SCORED_COUNT = SCORED_SKILLS.length // 3

// The single demand-only skill (null arbitrage_score / skill_key).
export const DEMAND_ONLY_SKILL = 'gRPC'

// Ladder order: descending by arbitrage_score, with the null-score row sorted LAST.
export const LADDER_ORDER_DESC = ['Rust', 'Kubernetes', 'PostgreSQL', 'gRPC'] as const

// ---------------------------------------------------------------------------------------------
// Have/gap fixture (spec 004, Task 5) — the identifier scheme is the SAME one `computeSkillGap`
// (frontend/src/lib/gap.ts) produces: `row.skill_key ?? normalizeSkillName(row.skill_name_raw)`.
// Consumers of `haveSkillKeys` (SkillMatrix / ArbitrageLadder / SkillDataTable) must key into it
// with that exact identifier, never the raw `skill_name_raw`.
//
// Deliberately covers BOTH a plotted/scored row (Kubernetes) and the demand-only row (gRPC, whose
// `skill_key` is null so the fallback normalized-`skill_name_raw` path is exercised too) as
// "have", leaving Rust and PostgreSQL as "gap" — every one of the four fixture rows is exercised
// by at least one have/gap assertion.
export const HAVE_SKILL_KEYS: Set<string> = new Set(['kubernetes', 'grpc'])
export const HAVE_SKILLS = ['Kubernetes', 'gRPC'] as const
export const GAP_SKILLS = ['Rust', 'PostgreSQL'] as const
