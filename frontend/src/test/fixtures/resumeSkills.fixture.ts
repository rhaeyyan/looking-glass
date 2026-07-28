import type { RoleSkillRow } from '../../lib/supabaseClient'

// Fixtures for spec 006 (deterministic-extraction) Task 2: pure resume-text + vocabulary inputs
// for the new synchronous `extractResumeSkills(resumeText, vocabulary)` contract. Replaces the
// old LLM-response-shaped fixtures (mocked `supabase.functions.invoke` bodies), which no longer
// apply now that extraction is zero-I/O, zero-LLM regex matching.
//
// The `computeSkillGap()` fixture section below (GAP_MATCH_ROWS and friends) is UNCHANGED from
// spec 004 — it is out of this SPEC's scope (`gap.ts`'s have/gap matching is unaffected by the
// extractor rewrite) and `gap.test.ts` still imports it from this same file.

// ---------------------------------------------------------------------------------------------
// Edge case 1 — basic affirmed match (case-insensitive)
// ---------------------------------------------------------------------------------------------
export const BASIC_MATCH_RESUME_TEXT = 'I worked with kubernetes and PostgreSQL for three years.'
export const BASIC_MATCH_VOCABULARY = ['Kubernetes', 'PostgreSQL', 'Rust']
export const BASIC_MATCH_EXPECTED = ['Kubernetes', 'PostgreSQL']

// ---------------------------------------------------------------------------------------------
// Edge case 2 — substring-inside-longer-word non-match (solved case)
// ---------------------------------------------------------------------------------------------
export const SUBSTRING_TRAP_RESUME_TEXT = 'I shipped cargo to Chicago last quarter.'
export const SUBSTRING_TRAP_VOCABULARY = ['go']
// Neither "cargo" nor "Chicago" contains a standalone, boundary-safe "go" token — in both words
// the character immediately preceding "go" is alphanumeric ("r" in cargo, "a" in Chicago), so the
// left-hand lookaround boundary fails and neither substring counts as a match.
export const SUBSTRING_TRAP_EXPECTED: string[] = []

// ---------------------------------------------------------------------------------------------
// Edge case 3 — punctuation-preserving boundary / false-merge trap
// ---------------------------------------------------------------------------------------------
export const PUNCTUATION_TRAP_RESUME_TEXT = 'I write C# daily.'
export const PUNCTUATION_TRAP_VOCABULARY = ['C', 'C#', 'C++']
export const PUNCTUATION_TRAP_EXPECTED = ['C#']

// ---------------------------------------------------------------------------------------------
// Edge case 4 — documented, NOT fixed: short-skill token collides with an unrelated abbreviation
// ---------------------------------------------------------------------------------------------
// "R&D" tokenizes, under lookaround word-boundary rules, as a standalone "R" (bounded by a space
// before and "&" after — "&" is non-alphanumeric, so the right-hand boundary is satisfied) exactly
// like a real mention of the "r" skill would. Distinguishing "R" the language from "R&D" the
// department requires real NLP/semantic context, which this project has already decided against
// (spec 006's own regression analysis). This is an accepted, permanent residual false positive —
// pinned here as documented behavior, not a bug to chase.
export const R_AND_D_RESUME_TEXT = 'Our R&D team ships fast.'
export const R_AND_D_VOCABULARY = ['r']
export const R_AND_D_EXPECTED = ['r']

// ---------------------------------------------------------------------------------------------
// Edge case 5 — negation, direct adjacency
// ---------------------------------------------------------------------------------------------
export const NEGATION_ADJACENT_RESUME_TEXT =
  'I have no Kubernetes experience and am not familiar with Rust.'
export const NEGATION_ADJACENT_VOCABULARY = ['Kubernetes', 'Rust']
export const NEGATION_ADJACENT_EXPECTED: string[] = []

// ---------------------------------------------------------------------------------------------
// Edge case 6 — negation does not leak across a sentence boundary
// ---------------------------------------------------------------------------------------------
export const NEGATION_SENTENCE_BOUNDARY_RESUME_TEXT = "I don't like Java. I know Kubernetes."
export const NEGATION_SENTENCE_BOUNDARY_VOCABULARY = ['Java', 'Kubernetes']
export const NEGATION_SENTENCE_BOUNDARY_EXPECTED = ['Kubernetes']

// ---------------------------------------------------------------------------------------------
// Edge case 7 — documented, NOT fixed: negation cue beyond the window fails to suppress
// ---------------------------------------------------------------------------------------------
// The negation cue "never" sits far more than 40 characters before "Elixir", with no sentence
// terminator in between, so it falls outside both halves of the window rule (40-char lookback OR
// nearer sentence terminator) and fails to suppress the match. Pinned as an accepted, documented
// limitation of the fixed-window heuristic, not a bug — full resolution needs real NLP.
export const NEGATION_OUT_OF_WINDOW_RESUME_TEXT =
  'I never had the chance during my last three jobs across two different countries to work with Elixir'
export const NEGATION_OUT_OF_WINDOW_VOCABULARY = ['Elixir']
export const NEGATION_OUT_OF_WINDOW_EXPECTED = ['Elixir']

// ---------------------------------------------------------------------------------------------
// Edge case 8 — any-affirmed-anywhere-wins
// ---------------------------------------------------------------------------------------------
export const ANY_AFFIRMED_ANYWHERE_RESUME_TEXT =
  "I don't have Docker experience at my current job. At my previous job, I used Docker daily."
export const ANY_AFFIRMED_ANYWHERE_VOCABULARY = ['Docker']
export const ANY_AFFIRMED_ANYWHERE_EXPECTED = ['Docker']

// ---------------------------------------------------------------------------------------------
// Edge case 9 — no alias/synonym folding
// ---------------------------------------------------------------------------------------------
export const NO_ALIAS_FOLDING_RESUME_TEXT = 'I have deployed extensively on Amazon Web Services.'
export const NO_ALIAS_FOLDING_VOCABULARY = ['AWS']
export const NO_ALIAS_FOLDING_EXPECTED: string[] = []

// ---------------------------------------------------------------------------------------------
// Edge case 10 — empty vocabulary / no matches at all
// ---------------------------------------------------------------------------------------------
export const NO_MATCHES_RESUME_TEXT = 'I enjoy hiking and playing chess on weekends.'
export const NO_MATCHES_VOCABULARY = ['Kubernetes', 'Rust', 'PostgreSQL']
export const NO_MATCHES_EXPECTED: string[] = []

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

// ---------------------------------------------------------------------------------------------
// Spec 025 — skill-alias fuzzy matching fixtures
// ---------------------------------------------------------------------------------------------
// These fixtures assume an `ALIAS_TABLE` entry `{'kubernetes': ['k8s']}` (per spec 025's
// illustrative Inputs/Outputs section) is wired into `extractResumeSkills`. Today (pre-Redwood)
// no such table exists, so every one of these cases is expected to fail red.

// Edge case 1 — alias match, basic
export const ALIAS_BASIC_RESUME_TEXT = '5 years with k8s clusters'
export const ALIAS_BASIC_VOCABULARY = ['Kubernetes']
export const ALIAS_BASIC_EXPECTED = ['Kubernetes']

// Edge case 3 — alias + negation
export const ALIAS_NEGATION_RESUME_TEXT = 'no k8s experience'
export const ALIAS_NEGATION_VOCABULARY = ['Kubernetes']
export const ALIAS_NEGATION_EXPECTED: string[] = []

// Edge case 4 — alias + any-affirmed-anywhere-wins (one negated alias occurrence, one affirmed
// canonical occurrence elsewhere)
export const ALIAS_ANY_AFFIRMED_ANYWHERE_RESUME_TEXT =
  "no k8s experience, but I've since learned Kubernetes"
export const ALIAS_ANY_AFFIRMED_ANYWHERE_VOCABULARY = ['Kubernetes']
export const ALIAS_ANY_AFFIRMED_ANYWHERE_EXPECTED = ['Kubernetes']

// Edge case 5 — overlap resolution across alias and canonical spans. "postgres sql" is aliased to
// PostgreSQL per spec 025's illustrative table; the text also contains the literal alias
// "postgres" as a prefix of "postgres sql" — both could independently match overlapping text, and
// the existing longest-first/overlap-discard rule must resolve this without double-counting or a
// crash, returning the canonical entry exactly once.
export const ALIAS_OVERLAP_RESUME_TEXT = 'I have run postgres sql in production for years.'
export const ALIAS_OVERLAP_VOCABULARY = ['PostgreSQL']
export const ALIAS_OVERLAP_EXPECTED = ['PostgreSQL']

// Edge case 6 — a vocabulary entry with no alias-table entry behaves exactly as spec 006 today
// (backward compatible): "Rust" has no known alias, so a resume mentioning only an unrelated
// abbreviation must not match it.
export const ALIAS_NO_ENTRY_RESUME_TEXT = 'I enjoy woodworking and gardening on weekends.'
export const ALIAS_NO_ENTRY_VOCABULARY = ['Rust']
export const ALIAS_NO_ENTRY_EXPECTED: string[] = []

// Edge case 7 — case-insensitivity for aliases ("K8S", "Postgres" both match)
export const ALIAS_CASE_INSENSITIVE_RESUME_TEXT =
  'Comfortable administering K8S and Postgres databases.'
export const ALIAS_CASE_INSENSITIVE_VOCABULARY = ['Kubernetes', 'PostgreSQL']
export const ALIAS_CASE_INSENSITIVE_EXPECTED = ['Kubernetes', 'PostgreSQL']

// Edge case 9 — empty vocabulary / no aliases found anywhere still yields []
export const ALIAS_EMPTY_VOCABULARY_RESUME_TEXT = 'I have used k8s and postgres extensively.'
export const ALIAS_EMPTY_VOCABULARY: string[] = []
export const ALIAS_EMPTY_VOCABULARY_EXPECTED: string[] = []

export const ALIAS_NO_MATCH_ANYWHERE_RESUME_TEXT = 'I enjoy hiking and playing chess on weekends.'
export const ALIAS_NO_MATCH_ANYWHERE_VOCABULARY = ['Kubernetes', 'PostgreSQL']
export const ALIAS_NO_MATCH_ANYWHERE_EXPECTED: string[] = []
