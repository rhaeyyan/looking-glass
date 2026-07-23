import type { RoleSkillRow } from '../../lib/supabaseClient'

// Fixtures for spec 005 Task 3 (template-narrator): dedicated `RoleSkillRow[]` sets for
// `narrateTopGap()`'s tolerance-rule / tie-precedence / null-degradation edge cases.
//
// IMPORTANT: `narrateTopGap` does NOT re-sort its `rows` argument (per the SPEC, it assumes
// `computeSkillGap`'s convention already applied: descending `arbitrage_score`, null-last). Every
// array below is therefore written ALREADY in that exact order — narrate.test.ts must never rely
// on the function to fix up ordering.
//
// Tolerance rule under test: two numeric fields are "tied" iff `formatNum(a) === formatNum(b)`
// (2-decimal rounding), never raw `===`. Several fixtures below deliberately use raw-unequal but
// formatNum-equal pairs (e.g. 8.001 vs 7.999, both formatNum to "8") to prove the rounding rule is
// actually applied, not a coincidental tie.

// ---------------------------------------------------------------------------------------------
// 1. Tied on arbitrage_score (via formatNum), differ on demand_score -> demand_score decides
//    (precedence step 2).
// ---------------------------------------------------------------------------------------------
export const TIE_DEMAND_DECIDES_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'Terraform',
    skill_key: 'terraform',
    pct_of_role: 30,
    postings_with_skill: 500,
    demand_score: 90,
    scarcity_index: 40,
    arbitrage_score: 8.001, // formatNum -> "8"
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 4.0,
    salary_premium_pct: 15,
    median_days_open: 20,
  },
  {
    role_family: 'Backend',
    skill_name_raw: 'Ansible',
    skill_key: 'ansible',
    pct_of_role: 25,
    postings_with_skill: 400,
    demand_score: 70,
    scarcity_index: 40,
    arbitrage_score: 7.999, // formatNum -> "8" (tied with Terraform under the rounding rule)
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 3.0,
    salary_premium_pct: 15,
    median_days_open: 20,
  },
]

// ---------------------------------------------------------------------------------------------
// 2. Tied on arbitrage_score AND demand_score AND scarcity_index (all via formatNum), differ on
//    salary_premium_pct -> salary_premium_pct decides (precedence step 4), proving the chain
//    walks the FIXED precedence order (arbitrage_score -> demand_score -> scarcity_index ->
//    salary_premium_pct -> median_days_open) rather than stopping at the first tied field or
//    picking whichever field happens to differ first in `RoleSkillRow`'s declared property order
//    (which is demand_score, scarcity_index, arbitrage_score — a DIFFERENT order). median_days_open
//    also differs here (10 vs 50) specifically so a wrong implementation that reached past
//    salary_premium_pct would produce a different, detectably-wrong citation.
// ---------------------------------------------------------------------------------------------
export const TIE_SALARY_DECIDES_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'GraphQL',
    skill_key: 'graphql',
    pct_of_role: 22,
    postings_with_skill: 350,
    demand_score: 55.002, // formatNum -> "55"
    scarcity_index: 30.001, // formatNum -> "30"
    arbitrage_score: 6.501, // formatNum -> "6.5"
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 1.2,
    salary_premium_pct: 28.4,
    median_days_open: 10,
  },
  {
    role_family: 'Backend',
    skill_name_raw: 'Elasticsearch',
    skill_key: 'elasticsearch',
    pct_of_role: 20,
    postings_with_skill: 300,
    demand_score: 54.998, // formatNum -> "55" (tied)
    scarcity_index: 29.999, // formatNum -> "30" (tied)
    arbitrage_score: 6.499, // formatNum -> "6.5" (tied)
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 1.0,
    salary_premium_pct: 9.2,
    median_days_open: 50,
  },
]

// ---------------------------------------------------------------------------------------------
// 3. Tied on EVERY comparable field, including both nullable fields being null on both sides ->
//    honest-tie fallback, never a fabricated differentiator.
// ---------------------------------------------------------------------------------------------
export const FULL_TIE_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'Kafka',
    skill_key: 'kafka',
    pct_of_role: 18,
    postings_with_skill: 260,
    demand_score: 60,
    scarcity_index: 45,
    arbitrage_score: 5.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 0.9,
    salary_premium_pct: null,
    median_days_open: null,
  },
  {
    role_family: 'Backend',
    skill_name_raw: 'RabbitMQ',
    skill_key: 'rabbitmq',
    pct_of_role: 16,
    postings_with_skill: 240,
    demand_score: 60,
    scarcity_index: 45,
    arbitrage_score: 5.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 0.8,
    salary_premium_pct: null,
    median_days_open: null,
  },
]

// ---------------------------------------------------------------------------------------------
// 4. Top gap has `arbitrage_score: null` (demand-only row — no D1/D2 match at all, so
//    demand_score/scarcity_index/arbitrage_score/salary_premium_pct/median_days_open are ALL null
//    together, mirroring the real LEFT JOIN-miss shape already used for gRPC in
//    roleSkillProfile.fixture.ts). `pct_of_role`/`postings_with_skill` come from
//    `skill_role_profile` directly and are NEVER null — they are the only real "demand" signal
//    left to narrate from. A `have` row with the single highest arbitrage_score is placed first
//    (skipped) so this fixture also proves the demand-only row still becomes `topGap` correctly
//    even when scanning past a scored `have` row.
// ---------------------------------------------------------------------------------------------
export const DEMAND_ONLY_TOP_GAP_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'Docker',
    skill_key: 'docker',
    pct_of_role: 60,
    postings_with_skill: 1500,
    demand_score: 95,
    scarcity_index: 20,
    arbitrage_score: 9.9,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 8.0,
    salary_premium_pct: 10,
    median_days_open: 15,
  },
  {
    role_family: 'Backend',
    skill_name_raw: 'Vault',
    skill_key: null,
    pct_of_role: 12,
    postings_with_skill: 260,
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
export const DEMAND_ONLY_HAVE_KEYS: Set<string> = new Set(['docker'])

// ---------------------------------------------------------------------------------------------
// 5. Top gap has a non-null arbitrage_score, but null salary_premium_pct/median_days_open -> those
//    clauses must be omitted entirely from the sentence, never rendered as "null"/"NaN"/"—".
//    arbitrage_score is NOT tied here (7.2 vs 4.0) so the tie-precedence chain isn't even in play —
//    this fixture isolates the null-clause-omission behavior on its own.
// ---------------------------------------------------------------------------------------------
export const NULL_SALARY_DAYS_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Data Engineer',
    skill_name_raw: 'Airflow',
    skill_key: 'airflow',
    pct_of_role: 25,
    postings_with_skill: 420,
    demand_score: 80,
    scarcity_index: 50,
    arbitrage_score: 7.2,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 2.0,
    salary_premium_pct: null,
    median_days_open: null,
  },
  {
    role_family: 'Data Engineer',
    skill_name_raw: 'Redis',
    skill_key: 'redis',
    pct_of_role: 20,
    postings_with_skill: 380,
    demand_score: 65,
    scarcity_index: 42,
    arbitrage_score: 4.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 1.6,
    salary_premium_pct: 12.0,
    median_days_open: 18,
  },
]

// ---------------------------------------------------------------------------------------------
// 6. No runner-up gap exists — the top gap is the only remaining gap. `React` is a `have` row
//    placed first (also doubles as a "does not leak the have-row's name into the narrative" guard).
// ---------------------------------------------------------------------------------------------
export const SOLO_TOP_GAP_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Full Stack',
    skill_name_raw: 'React',
    skill_key: 'react',
    pct_of_role: 70,
    postings_with_skill: 2200,
    demand_score: 92,
    scarcity_index: 15,
    arbitrage_score: 3.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 9.0,
    salary_premium_pct: 5.0,
    median_days_open: 12,
  },
  {
    role_family: 'Full Stack',
    skill_name_raw: 'Terraform',
    skill_key: 'terraform',
    pct_of_role: 22,
    postings_with_skill: 300,
    demand_score: 70,
    scarcity_index: 35,
    arbitrage_score: 6.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 1.1,
    salary_premium_pct: 18.0,
    median_days_open: 25,
  },
]
export const SOLO_TOP_GAP_HAVE_KEYS: Set<string> = new Set(['react'])

// ---------------------------------------------------------------------------------------------
// 7. Every role skill is already a "have" -> narrateTopGap must return null (not throw, not "").
// ---------------------------------------------------------------------------------------------
export const ALL_HAVE_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'Docker',
    skill_key: 'docker',
    pct_of_role: 60,
    postings_with_skill: 1500,
    demand_score: 95,
    scarcity_index: 20,
    arbitrage_score: 9.9,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 8.0,
    salary_premium_pct: 10,
    median_days_open: 15,
  },
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
]
export const ALL_HAVE_KEYS: Set<string> = new Set(['docker', 'kubernetes'])

// ---------------------------------------------------------------------------------------------
// 8. Regression guard: a `have` row holds the SINGLE highest arbitrage_score in the whole list —
//    it must be skipped, and the highest-scoring NON-have row (Rust) must become topGap, not
//    Kubernetes.
// ---------------------------------------------------------------------------------------------
export const HAVE_ROW_HIGHEST_SCORE_ROWS: RoleSkillRow[] = [
  {
    role_family: 'Backend',
    skill_name_raw: 'Kubernetes',
    skill_key: 'kubernetes',
    pct_of_role: 55,
    postings_with_skill: 1800,
    demand_score: 91,
    scarcity_index: 34,
    arbitrage_score: 9.9, // single highest score in the list, but this row is a "have" -> skip it
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
    arbitrage_score: 7.0,
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
    arbitrage_score: 4.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 5.1,
    salary_premium_pct: 14.5,
    median_days_open: 21,
  },
]
export const HAVE_ROW_HIGHEST_SCORE_HAVE_KEYS: Set<string> = new Set(['kubernetes'])
