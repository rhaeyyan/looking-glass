import type { RoleSkillRow } from '../../lib/supabaseClient'

// Fixtures for spec 004 Task 3 (resume-gap-layer): mocked `supabase.functions.invoke` response
// bodies for `extractResumeSkills()`, plus a dedicated `RoleSkillRow[]` set for
// `computeSkillGap()`'s normalization/matching edge cases (deliberately distinct from
// `roleSkillProfile.fixture.ts`, which exists to exercise the matrix/ladder/table rendering, not
// the have/gap match rule).

// ---------------------------------------------------------------------------------------------
// extractResumeSkills() — mocked `supabase.functions.invoke('extract-resume-skills', ...)` bodies
// ---------------------------------------------------------------------------------------------

// A well-formed edge-function response: `supabase-js`'s `functions.invoke` resolves `{ data,
// error }`, never throws for an HTTP-level failure — `error` is how those surface.
export const VALID_INVOKE_RESPONSE = {
  data: { skills: ['Kubernetes', 'Rust', 'PostgreSQL'] },
  error: null,
}

export const EMPTY_SKILLS_INVOKE_RESPONSE = {
  data: { skills: [] },
  error: null,
}

// Malformed response bodies — each must be rejected by the Zod schema, never coerced/passed
// through. Kept as the exact `data` payload the mocked `invoke` would resolve with.
export const MALFORMED_MISSING_SKILLS_KEY = {
  data: { skillz: ['aws'] },
  error: null,
}

export const MALFORMED_WRONG_TYPE_NOT_ARRAY = {
  data: { skills: 'aws, rust, postgresql' },
  error: null,
}

export const MALFORMED_WRONG_TYPE_NON_STRING_ITEMS = {
  data: { skills: ['aws', 42, null] },
  error: null,
}

// The Zod schema's `skills` array is bounded (contract: `.max(200)`, see resumeSkills.test.ts) —
// this fixture is one over that bound so the "oversized array" edge case is unambiguous
// regardless of the exact limit Redwood picks, as long as it documents and honors one.
export const OVERSIZED_SKILLS_ARRAY = Array.from({ length: 201 }, (_, i) => `skill-${i}`)
export const MALFORMED_OVERSIZED = {
  data: { skills: OVERSIZED_SKILLS_ARRAY },
  error: null,
}

// A supabase-level invocation failure (network error, non-2xx from the edge function, etc.) —
// `data` is null and `error` is populated. Distinct failure mode from a schema-malformed body.
export const INVOKE_LEVEL_ERROR_RESPONSE = {
  data: null,
  error: { message: 'FunctionsHttpError: non-2xx status code' },
}

// ---------------------------------------------------------------------------------------------
// computeSkillGap() — RoleSkillRow fixture exercising the V1 exact-normalized-match rule
// ---------------------------------------------------------------------------------------------
//
// Normalization rule under test (mirrors `src/ingest/normalize.py`, the join-key normalizer this
// SPEC's normalizeSkillName() must reuse): lowercase, collapse whitespace/`/`/`-`/`_` runs to a
// single space, but keep `#`, `+`, `.` intact — no alias/acronym expansion (e.g. "Amazon Web
// Services" is deliberately NOT folded to "aws" — that would be a false merge).

export const GAP_MATCH_ROWS: RoleSkillRow[] = [
  {
    // Case/whitespace variance target: skill_key is already the normalized join key.
    role_family: 'Backend',
    skill_name_raw: 'AWS',
    skill_key: 'aws',
    pct_of_role: 60,
    postings_with_skill: 2000,
    demand_score: 90,
    scarcity_index: 40,
    arbitrage_score: 8.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 7.0,
  },
  {
    // Separator-variance target: skill_key already collapses "/" to a space.
    role_family: 'Backend',
    skill_name_raw: 'CI/CD',
    skill_key: 'ci cd',
    pct_of_role: 40,
    postings_with_skill: 900,
    demand_score: 70,
    scarcity_index: 20,
    arbitrage_score: 3.5,
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 2.1,
  },
  {
    // Punctuation-preservation target: "#" must survive normalization, so "c#" != "c++" != "c".
    role_family: 'Backend',
    skill_name_raw: 'C#',
    skill_key: 'c#',
    pct_of_role: 15,
    postings_with_skill: 300,
    demand_score: 50,
    scarcity_index: 55,
    arbitrage_score: 6.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 0.9,
  },
  {
    // Distinct skill sharing a prefix with C# — a false-merge trap. Never has an extracted skill.
    role_family: 'Backend',
    skill_name_raw: 'C++',
    skill_key: 'c++',
    pct_of_role: 10,
    postings_with_skill: 150,
    demand_score: 45,
    scarcity_index: 60,
    arbitrage_score: 5.0,
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 0.5,
  },
  {
    // Demand-only row: skill_key is null (no D1/D2 match). Matching must fall back to normalized
    // skill_name_raw, and the row must survive into the output regardless of have/gap status.
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
  },
]

// Convenience projection: expected descending-by-arbitrage_score order (null-score row last) for
// GAP_MATCH_ROWS, mirroring `ArbitrageLadder`'s `byArbitrageDesc` convention.
export const GAP_MATCH_ROWS_ARBITRAGE_DESC_ORDER = ['AWS', 'C#', 'C++', 'CI/CD', 'gRPC'] as const

// Resume-extracted skill strings deliberately varied in case/whitespace/separator punctuation —
// every one of these must still match its GAP_MATCH_ROWS counterpart (normalization works both
// directions: role-side skill_key/skill_name_raw and resume-extraction-side strings).
export const RESUME_SKILLS_WITH_VARIANTS = [
  '  aws  ', // whitespace padding + already-lowercase
  'AWS', // exact case of the role's skill_name_raw
  'ci-cd', // hyphen separator instead of "/"
  'CI_CD', // underscore separator, upper case
  'C#', // punctuation-preserving exact match
  'gRPC', // must match the null-skill_key row via normalized skill_name_raw
] as const

// An extracted skill with no corresponding role-profile skill at all — must be silently ignored,
// never surfaced as an error and never added to the output.
export const RESUME_SKILL_WITH_NO_ROLE_MATCH = 'terraform'
