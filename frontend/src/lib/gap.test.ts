import { describe, it, expect } from 'vitest'
import type { RoleSkillRow } from './supabaseClient'
import {
  GAP_MATCH_ROWS,
  GAP_MATCH_ROWS_ARBITRAGE_DESC_ORDER,
  RESUME_SKILLS_WITH_VARIANTS,
  RESUME_SKILL_WITH_NO_ROLE_MATCH,
} from '../test/fixtures/resumeSkills.fixture'
import {
  roleSkillProfileFixture,
  LADDER_ORDER_DESC,
} from '../test/fixtures/roleSkillProfile.fixture'

// RED phase (spec 004 Task 3): `computeSkillGap()` does not exist yet — Redwood builds it in
// Task 4 to make these tests pass. This file locks the contract:
//
//   computeSkillGap(rows: RoleSkillRow[], resumeSkills: string[])
//     -> { haveSkillKeys: Set<string>; rows: RoleSkillRow[] }
//
//   - Pure, deterministic, no I/O, no LLM access — the second argument is a plain string[] (the
//     already-extracted skill list), never the raw extraction response object.
//   - Matching: normalize both sides (case-fold, collapse whitespace/`/`/`-`/`_`, keep `#`/`+`/`.`
//     intact — the same rule as src/ingest/normalize.py) and exact-match against
//     `row.skill_key ?? normalizeSkillName(row.skill_name_raw)`. No fuzzy/alias matching.
//   - `haveSkillKeys` contains that same identifier (`row.skill_key ?? normalizeSkillName(row.skill_name_raw)`)
//     for every row the resume "has" — the identifier scheme a caller uses to key into `rows`.
//   - `rows` is EVERY input row (have + gap), sorted by the exact same null-scores-last
//     descending-by-arbitrage_score rule as ArbitrageLadder's `byArbitrageDesc` — never dropped,
//     never re-scored.
import { computeSkillGap } from './gap'

describe('computeSkillGap — matching (normalization works both directions)', () => {
  it('matches case/whitespace/separator-punctuation variants of a resume skill to its role skill', () => {
    const { haveSkillKeys } = computeSkillGap(GAP_MATCH_ROWS, [...RESUME_SKILLS_WITH_VARIANTS])

    // AWS: matched via "  aws  " and "AWS" (whitespace + case variants) -> skill_key 'aws'.
    expect(haveSkillKeys.has('aws')).toBe(true)
    // CI/CD: matched via 'ci-cd' (hyphen) and 'CI_CD' (underscore, upper case) -> skill_key 'ci cd'.
    expect(haveSkillKeys.has('ci cd')).toBe(true)
    // C#: punctuation-preserving match -> skill_key 'c#'.
    expect(haveSkillKeys.has('c#')).toBe(true)
  })

  it('never false-merges punctuation-distinct skills (C# must not satisfy C++)', () => {
    const { haveSkillKeys } = computeSkillGap(GAP_MATCH_ROWS, [...RESUME_SKILLS_WITH_VARIANTS])

    // Only 'C#' was extracted; 'C++' shares a prefix but is a genuinely distinct skill_key and
    // must remain a gap.
    expect(haveSkillKeys.has('c#')).toBe(true)
    expect(haveSkillKeys.has('c++')).toBe(false)
  })

  it('matches a null-skill_key row against its normalized skill_name_raw, and never drops it', () => {
    const { haveSkillKeys, rows } = computeSkillGap(GAP_MATCH_ROWS, [...RESUME_SKILLS_WITH_VARIANTS])

    // 'gRPC' was extracted (case-variant of the raw name); the row has skill_key: null, so the
    // match must fall back to normalized skill_name_raw ('grpc').
    expect(haveSkillKeys.has('grpc')).toBe(true)
    // Regardless of have/gap status, the demand-only row must survive into the output.
    expect(rows.some((r) => r.skill_name_raw === 'gRPC')).toBe(true)
  })

  it('keeps a role skill with skill_key: null in the output even when NOT matched (gap, not dropped)', () => {
    const { haveSkillKeys, rows } = computeSkillGap(GAP_MATCH_ROWS, [])

    expect(haveSkillKeys.has('grpc')).toBe(false)
    expect(rows.some((r) => r.skill_name_raw === 'gRPC')).toBe(true)
    expect(rows).toHaveLength(GAP_MATCH_ROWS.length)
  })

  it('silently ignores an extracted skill with no corresponding role-profile skill (not an error)', () => {
    expect(() =>
      computeSkillGap(GAP_MATCH_ROWS, [RESUME_SKILL_WITH_NO_ROLE_MATCH]),
    ).not.toThrow()

    const { haveSkillKeys, rows } = computeSkillGap(GAP_MATCH_ROWS, [
      RESUME_SKILL_WITH_NO_ROLE_MATCH,
    ])

    // Nothing in the role profile matches "terraform" — every row stays a gap, and the unmatched
    // skill is not surfaced anywhere in the output shape.
    expect(haveSkillKeys.size).toBe(0)
    expect(rows).toHaveLength(GAP_MATCH_ROWS.length)
  })
})

describe('computeSkillGap — Bounded-AI boundary', () => {
  it('accepts only a plain string[] of skill names as its second argument (no raw LLM response shape)', () => {
    // Type-level contract check: this must compile as a plain string array, not
    // `{ skills: string[] }` or any richer extraction-response object. If Redwood's
    // implementation signature drifts to accept the raw response shape instead of string[],
    // this line stops type-checking.
    const resumeSkills: string[] = ['aws', 'ci cd']
    expect(() => computeSkillGap(GAP_MATCH_ROWS, resumeSkills)).not.toThrow()
  })

  it('never introduces or mutates a score — every output row field for a given skill is byte-identical to its input row', () => {
    const input = GAP_MATCH_ROWS
    const { rows } = computeSkillGap(input, ['aws'])

    const awsIn = input.find((r) => r.skill_name_raw === 'AWS')!
    const awsOut = rows.find((r) => r.skill_name_raw === 'AWS')!

    expect(awsOut).toEqual(awsIn)
    expect(awsOut.arbitrage_score).toBe(awsIn.arbitrage_score)
    expect(awsOut.demand_score).toBe(awsIn.demand_score)
    expect(awsOut.scarcity_index).toBe(awsIn.scarcity_index)
  })
})

describe('computeSkillGap — sort order (regression guard: no second, drifting sort)', () => {
  it('sorts GAP_MATCH_ROWS descending by arbitrage_score with the null-score row last', () => {
    const { rows } = computeSkillGap(GAP_MATCH_ROWS, [])

    expect(rows.map((r) => r.skill_name_raw)).toEqual([...GAP_MATCH_ROWS_ARBITRAGE_DESC_ORDER])
  })

  it('reproduces the exact order ArbitrageLadder computes for roleSkillProfileFixture', () => {
    // roleSkillProfileFixture / LADDER_ORDER_DESC are the SAME fixture ArbitrageLadder.test.tsx
    // asserts against (frontend/src/test/fixtures/roleSkillProfile.fixture.ts) — reusing it here
    // pins computeSkillGap's sort to the ladder's existing convention rather than a second,
    // independently-drifting implementation.
    const { rows } = computeSkillGap(roleSkillProfileFixture, [])

    expect(rows.map((r) => r.skill_name_raw)).toEqual([...LADDER_ORDER_DESC])
  })

  it('is deterministic: repeated calls with the same inputs produce the same order and have-set', () => {
    const first = computeSkillGap(GAP_MATCH_ROWS, [...RESUME_SKILLS_WITH_VARIANTS])
    const second = computeSkillGap(GAP_MATCH_ROWS, [...RESUME_SKILLS_WITH_VARIANTS])

    expect(first.rows.map((r) => r.skill_name_raw)).toEqual(second.rows.map((r) => r.skill_name_raw))
    expect([...first.haveSkillKeys].sort()).toEqual([...second.haveSkillKeys].sort())
  })
})

describe('computeSkillGap — empty inputs', () => {
  it('treats an empty rows array as an empty gap list without throwing', () => {
    const result = computeSkillGap([] as RoleSkillRow[], ['aws'])

    expect(result.rows).toEqual([])
    expect(result.haveSkillKeys.size).toBe(0)
  })

  it('treats an empty resumeSkills array as every row being a gap, never a have', () => {
    const { haveSkillKeys, rows } = computeSkillGap(GAP_MATCH_ROWS, [])

    expect(haveSkillKeys.size).toBe(0)
    expect(rows).toHaveLength(GAP_MATCH_ROWS.length)
  })
})
