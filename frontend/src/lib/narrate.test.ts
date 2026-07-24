import { describe, it, expect } from 'vitest'
import type { RoleSkillRow } from './supabaseClient'
import { formatNum, formatSalaryPremiumPhrase } from './format'
import {
  TIE_DEMAND_DECIDES_ROWS,
  TIE_SALARY_DECIDES_ROWS,
  FULL_TIE_ROWS,
  DEMAND_ONLY_TOP_GAP_ROWS,
  DEMAND_ONLY_HAVE_KEYS,
  NULL_SALARY_DAYS_ROWS,
  SOLO_TOP_GAP_ROWS,
  SOLO_TOP_GAP_HAVE_KEYS,
  ALL_HAVE_ROWS,
  ALL_HAVE_KEYS,
  HAVE_ROW_HIGHEST_SCORE_ROWS,
  HAVE_ROW_HIGHEST_SCORE_HAVE_KEYS,
  NEGATIVE_SALARY_PREMIUM_ROWS,
  NEGATIVE_SALARY_PREMIUM_HAVE_KEYS,
} from '../test/fixtures/narrateTopGap.fixture'

// RED phase (spec 005 Task 3): `narrateTopGap()` does not exist yet — Redwood builds it in Task 4
// to make these tests pass. This file locks the contract:
//
//   narrateTopGap(rows: RoleSkillRow[], haveSkillKeys: Set<string>)
//     -> { topGap: RoleSkillRow; runnerUpGap: RoleSkillRow | null; narrative: string } | null
//
//   - Pure, synchronous, zero-I/O. `rows` is assumed ALREADY sorted by `computeSkillGap`'s
//     convention (descending arbitrage_score, null-last) — this function does not re-sort; it
//     scans for the first non-`have` row (top gap) and the next non-`have` row after it
//     (runner-up gap, may be absent), using the exact `skill_key ?? normalizeSkillName(skill_name_raw)`
//     key convention from `gap.ts`.
//   - Tolerance rule: two numeric fields are "tied" iff `formatNum(a) === formatNum(b)`, never raw
//     `===`.
//   - Tie precedence (fixed order, first non-tied field wins): arbitrage_score -> demand_score ->
//     scarcity_index -> salary_premium_pct -> median_days_open. All tied/null -> honest fallback.
//   - Bounded-AI: every number in `narrative` is `formatNum(...)` of a real field read verbatim
//     from `topGap`/`runnerUpGap` — never re-derived, never printed for a null field.
//
// No network/LLM mock is defined anywhere in this file — narrateTopGap takes plain in-memory data
// and must work with zero mocks, proving it is genuinely synchronous and I/O-free.
import { narrateTopGap, narrateTopGaps } from './narrate'

// ---------------------------------------------------------------------------------------------
// Test helpers — generic Bounded-AI number-provenance check, reused across every scenario below.
// ---------------------------------------------------------------------------------------------

const NUMERIC_FIELDS = [
  'demand_score',
  'scarcity_index',
  'arbitrage_score',
  'salary_premium_pct',
  'median_days_open',
  'pct_of_role',
  'postings_with_skill',
] as const

/** Every numeric-looking substring appearing in the narrative, as JS numbers. */
function numbersIn(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g) ?? []
  return matches.map(Number)
}

/**
 * The full set of legitimate, verbatim-formatted numbers `narrative` is allowed to contain:
 * `formatNum(field)` for every non-null numeric field on either row. If a number appears in the
 * narrative that isn't in this set, it was re-derived, interpolated, or fabricated — a Bounded-AI
 * violation.
 *
 * Spec 013 carve-out (narrow, field-scoped — do NOT generalize to other fields): once `narrate.ts`
 * wires `formatSalaryPremiumPhrase` in, a negative `salary_premium_pct` is rendered as its absolute
 * magnitude (the sign is conveyed by "below" in prose, never a literal minus digit). So for
 * `salary_premium_pct` specifically, also allow `Math.abs(Number(formatNum(value)))` in the
 * allowed set. Every other field's provenance rule is unchanged.
 */
function allowedNumbers(rows: Array<RoleSkillRow | null>): Set<number> {
  const out = new Set<number>()
  for (const row of rows) {
    if (!row) continue
    for (const field of NUMERIC_FIELDS) {
      const value = row[field]
      if (typeof value === 'number') {
        out.add(Number(formatNum(value)))
        if (field === 'salary_premium_pct') {
          out.add(Math.abs(Number(formatNum(value))))
        }
      }
    }
  }
  return out
}

function assertEveryNumberIsProvenanced(narrative: string, rows: Array<RoleSkillRow | null>) {
  const allowed = allowedNumbers(rows)
  for (const n of numbersIn(narrative)) {
    expect(allowed.has(n)).toBe(true)
  }
}

describe('narrateTopGap — synchronicity (Bounded-AI: zero I/O, zero LLM)', () => {
  it('returns a plain value synchronously, never a Promise', () => {
    const result = narrateTopGap(TIE_DEMAND_DECIDES_ROWS, new Set())

    expect(result).not.toBeInstanceOf(Promise)
  })

  it('is not an async function', () => {
    expect(narrateTopGap.constructor.name).not.toBe('AsyncFunction')
  })

  it('is deterministic: repeated calls with the same inputs produce byte-identical output', () => {
    const first = narrateTopGap(TIE_DEMAND_DECIDES_ROWS, new Set())
    const second = narrateTopGap(TIE_DEMAND_DECIDES_ROWS, new Set())

    expect(first).toEqual(second)
  })
})

describe('narrateTopGap — top gap / runner-up gap definition', () => {
  it('skips a "have" row even when it holds the single highest arbitrage_score in the list', () => {
    const result = narrateTopGap(
      HAVE_ROW_HIGHEST_SCORE_ROWS,
      HAVE_ROW_HIGHEST_SCORE_HAVE_KEYS,
    )

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('Rust')
    expect(result!.runnerUpGap?.skill_name_raw).toBe('PostgreSQL')
  })

  it('returns null when every role skill is already a "have" (no gap rows at all)', () => {
    const result = narrateTopGap(ALL_HAVE_ROWS, ALL_HAVE_KEYS)

    expect(result).toBeNull()
  })

  it('returns null for an empty rows array', () => {
    const result = narrateTopGap([] as RoleSkillRow[], new Set())

    expect(result).toBeNull()
  })

  it('has a null runnerUpGap when the top gap is the only remaining gap', () => {
    const result = narrateTopGap(SOLO_TOP_GAP_ROWS, SOLO_TOP_GAP_HAVE_KEYS)

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('Terraform')
    expect(result!.runnerUpGap).toBeNull()
  })
})

describe('narrateTopGap — tie precedence chain (fixed order, first non-tied field wins)', () => {
  it('cites demand_score as the deciding reason when arbitrage_score is tied (formatNum) but demand_score differs', () => {
    const result = narrateTopGap(TIE_DEMAND_DECIDES_ROWS, new Set())

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('Terraform')
    expect(result!.runnerUpGap?.skill_name_raw).toBe('Ansible')

    // The deciding field's real, verbatim numbers must appear; every number present must be
    // provenanced to a real field (Bounded-AI boundary).
    expect(result!.narrative).toContain(formatNum(90))
    expect(result!.narrative).toContain(formatNum(70))
    expect(result!.narrative.toLowerCase()).toContain('demand')
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })

  it('skips the tied scarcity_index and cites salary_premium_pct per fixed precedence order (not field-declaration order)', () => {
    const result = narrateTopGap(TIE_SALARY_DECIDES_ROWS, new Set())

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('GraphQL')
    expect(result!.runnerUpGap?.skill_name_raw).toBe('Elasticsearch')

    expect(result!.narrative.toLowerCase()).toContain('premium')
    // The tied scarcity_index value (30) must not be cited as a differentiator claim; the real
    // premium numbers must appear.
    expect(result!.narrative).toContain(formatNum(28.4))
    expect(result!.narrative).toContain(formatNum(9.2))
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })

  it('falls back to an honest tie statement when every comparable field is tied (including both nullable fields being null on both sides), never fabricating a differentiator', () => {
    const result = narrateTopGap(FULL_TIE_ROWS, new Set())

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('Kafka')
    expect(result!.runnerUpGap?.skill_name_raw).toBe('RabbitMQ')

    // Never render a null field as "null"/"NaN"/"—".
    expect(result!.narrative).not.toMatch(/\bnull\b/i)
    expect(result!.narrative).not.toMatch(/\bNaN\b/)
    expect(result!.narrative).not.toContain('—')
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })
})

describe('narrateTopGap — null-field degradation', () => {
  it('degrades to a demand-only framing when the top gap has arbitrage_score: null, never inventing a fake score/scarcity/premium number', () => {
    const result = narrateTopGap(DEMAND_ONLY_TOP_GAP_ROWS, DEMAND_ONLY_HAVE_KEYS)

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('Vault')
    expect(result!.topGap.arbitrage_score).toBeNull()

    const narrativeLower = result!.narrative.toLowerCase()
    expect(narrativeLower).toContain('demand')
    expect(narrativeLower).toMatch(/scarcity|unavailable/)

    // Never render the null fields as "null"/"NaN"/"—", and never fabricate a score/scarcity/
    // premium number for a row whose arbitrage/scarcity/salary data doesn't exist.
    expect(result!.narrative).not.toMatch(/\bnull\b/i)
    expect(result!.narrative).not.toMatch(/\bNaN\b/)
    expect(result!.narrative).not.toContain('—')
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })

  it('omits the salary_premium_pct/median_days_open clauses entirely when they are null on the top gap, rather than rendering null/NaN/—', () => {
    const result = narrateTopGap(NULL_SALARY_DAYS_ROWS, new Set())

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('Airflow')
    expect(result!.topGap.salary_premium_pct).toBeNull()
    expect(result!.topGap.median_days_open).toBeNull()

    expect(result!.narrative).not.toMatch(/\bnull\b/i)
    expect(result!.narrative).not.toMatch(/\bNaN\b/)
    expect(result!.narrative).not.toContain('—')
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })

  it('produces a solo-justification narrative (no comparison language, no invented runner-up) when no runner-up gap exists', () => {
    const result = narrateTopGap(SOLO_TOP_GAP_ROWS, SOLO_TOP_GAP_HAVE_KEYS)

    expect(result).not.toBeNull()
    expect(result!.runnerUpGap).toBeNull()

    // Must never leak the skipped "have" row's name into the narrative as though it were a
    // genuine runner-up comparison.
    expect(result!.narrative).not.toContain('React')
    expect(result!.narrative).toContain('Terraform')
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })
})

describe('narrateTopGap — Bounded-AI boundary (generic number-provenance guard)', () => {
  it('every number in the narrative is formatNum(...) of a real field on topGap/runnerUpGap, across every fixture scenario', () => {
    const scenarios: Array<[RoleSkillRow[], Set<string>]> = [
      [TIE_DEMAND_DECIDES_ROWS, new Set()],
      [TIE_SALARY_DECIDES_ROWS, new Set()],
      [FULL_TIE_ROWS, new Set()],
      [DEMAND_ONLY_TOP_GAP_ROWS, DEMAND_ONLY_HAVE_KEYS],
      [NULL_SALARY_DAYS_ROWS, new Set()],
      [SOLO_TOP_GAP_ROWS, SOLO_TOP_GAP_HAVE_KEYS],
      [HAVE_ROW_HIGHEST_SCORE_ROWS, HAVE_ROW_HIGHEST_SCORE_HAVE_KEYS],
    ]

    for (const [rows, haveKeys] of scenarios) {
      const result = narrateTopGap(rows, haveKeys)
      expect(result).not.toBeNull()
      assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
    }
  })

  it('accepts only a plain Set<string> of have-skill-keys as its second argument (matches computeSkillGap\'s haveSkillKeys shape)', () => {
    // Type-level contract check: if Redwood's implementation signature drifts away from
    // `Set<string>` (e.g. to an array or a richer object), this stops type-checking.
    const haveSkillKeys: Set<string> = new Set(['kubernetes'])
    expect(() => narrateTopGap(HAVE_ROW_HIGHEST_SCORE_ROWS, haveSkillKeys)).not.toThrow()
  })

  it('returns topGap/runnerUpGap objects deep-equal to the exact input rows (never a re-derived copy with altered fields)', () => {
    const result = narrateTopGap(TIE_DEMAND_DECIDES_ROWS, new Set())

    expect(result).not.toBeNull()
    expect(result!.topGap).toEqual(TIE_DEMAND_DECIDES_ROWS[0])
    expect(result!.runnerUpGap).toEqual(TIE_DEMAND_DECIDES_ROWS[1])
  })
})

describe('narrateTopGap — spec 013: sign-honest salary premium phrasing', () => {
  it('renders a negative salary_premium_pct via formatSalaryPremiumPhrase, saying "below" not a minus sign', () => {
    const result = narrateTopGap(NEGATIVE_SALARY_PREMIUM_ROWS, NEGATIVE_SALARY_PREMIUM_HAVE_KEYS)

    expect(result).not.toBeNull()
    expect(result!.topGap.skill_name_raw).toBe('COBOL')
    expect(result!.runnerUpGap).toBeNull() // solo path -> scoreClauses is exercised

    expect(result!.narrative).toContain('below typical pay for this skill')
    // No literal minus sign directly followed by a digit anywhere in the narrative.
    expect(result!.narrative).not.toMatch(/-\d/)
  })

  it('still passes the generic Bounded-AI number-provenance guard for the negative-premium fixture', () => {
    const result = narrateTopGap(NEGATIVE_SALARY_PREMIUM_ROWS, NEGATIVE_SALARY_PREMIUM_HAVE_KEYS)

    expect(result).not.toBeNull()
    assertEveryNumberIsProvenanced(result!.narrative, [result!.topGap, result!.runnerUpGap])
  })

  it('the narrative\'s salary clause matches formatSalaryPremiumPhrase(row.salary_premium_pct) verbatim', () => {
    const result = narrateTopGap(NEGATIVE_SALARY_PREMIUM_ROWS, NEGATIVE_SALARY_PREMIUM_HAVE_KEYS)

    expect(result).not.toBeNull()
    const phrase = formatSalaryPremiumPhrase(result!.topGap.salary_premium_pct ?? null)
    expect(phrase).not.toBeNull()
    expect(result!.narrative).toContain(phrase as string)
  })
})

// ---------------------------------------------------------------------------------------------
// narrateTopGaps — the ranked top-3 shortlist built on top of narrateTopGap.
// ---------------------------------------------------------------------------------------------

function makeRow(overrides: Partial<RoleSkillRow> = {}): RoleSkillRow {
  return {
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
    ...overrides,
  }
}

// Five gap rows, already sorted descending by arbitrage_score (computeSkillGap's convention).
const FIVE_GAP_ROWS: RoleSkillRow[] = [
  makeRow({ skill_name_raw: 'Kubernetes', skill_key: 'kubernetes', arbitrage_score: 9.1 }),
  makeRow({ skill_name_raw: 'Terraform', skill_key: 'terraform', arbitrage_score: 8.2 }),
  makeRow({ skill_name_raw: 'Go', skill_key: 'go', arbitrage_score: 7.4 }),
  makeRow({ skill_name_raw: 'Kafka', skill_key: 'kafka', arbitrage_score: 6.0 }),
  makeRow({ skill_name_raw: 'Redis', skill_key: 'redis', arbitrage_score: 5.5 }),
]

describe('narrateTopGaps — ranked top-3 shortlist', () => {
  it('returns null in exactly the same case narrateTopGap does (no gap rows at all)', () => {
    expect(narrateTopGaps(ALL_HAVE_ROWS, ALL_HAVE_KEYS)).toBeNull()
    expect(narrateTopGaps([] as RoleSkillRow[], new Set())).toBeNull()
  })

  it('surfaces at most three moves, ranked in input order, skipping "have" rows', () => {
    const haveKeys = new Set(['terraform']) // Terraform is a "have", so it drops out.
    const result = narrateTopGaps(FIVE_GAP_ROWS, haveKeys)

    expect(result).not.toBeNull()
    expect(result!.moves.map((m) => m.row.skill_name_raw)).toEqual(['Kubernetes', 'Go', 'Kafka'])
    expect(result!.moves.map((m) => m.rank)).toEqual([1, 2, 3])
  })

  it('uses narrateTopGap\'s narrative verbatim as the headline, and leaves move #1 note empty', () => {
    const result = narrateTopGaps(FIVE_GAP_ROWS, new Set())
    const base = narrateTopGap(FIVE_GAP_ROWS, new Set())

    expect(result).not.toBeNull()
    expect(result!.headline).toBe(base!.narrative)
    expect(result!.moves[0].note).toBe('')
    expect(result!.moves[1].note).not.toBe('')
  })

  it('provenances every number in each move\'s note + stats to a real field on that row', () => {
    const result = narrateTopGaps(FIVE_GAP_ROWS, new Set())
    expect(result).not.toBeNull()

    for (const move of result!.moves) {
      const text = move.note + ' ' + move.stats.join(' ')
      assertEveryNumberIsProvenanced(text, [move.row])
    }
  })

  it('spec 013: a move\'s salary stat chip is formatSalaryPremiumPhrase(row.salary_premium_pct) verbatim, sign-honest for a negative premium', () => {
    const rows: RoleSkillRow[] = [
      makeRow({ skill_name_raw: 'COBOL', skill_key: 'cobol', salary_premium_pct: -8.4 }),
    ]
    const result = narrateTopGaps(rows, new Set())

    expect(result).not.toBeNull()
    const chips = result!.moves[0].stats
    const phrase = formatSalaryPremiumPhrase(-8.4)
    expect(phrase).not.toBeNull()
    expect(chips).toContain(phrase as string)
    // Never a literal "+"-prefixed / minus-signed raw percentage for this chip.
    expect(chips.some((c) => /^[+-]?\d/.test(c) && c.includes('salary'))).toBe(false)
  })

  it('degrades a demand-only (null arbitrage_score) move to a demand framing without fabricating numbers', () => {
    const rows: RoleSkillRow[] = [
      makeRow({
        skill_name_raw: 'Vault',
        skill_key: null,
        demand_score: null,
        scarcity_index: null,
        arbitrage_score: null,
        salary_premium_pct: null,
        median_days_open: null,
      }),
    ]
    const result = narrateTopGaps(rows, new Set())

    expect(result).not.toBeNull()
    expect(result!.moves).toHaveLength(1)
    expect(result!.moves[0].stats).toEqual([]) // no numeric fields to cite
    expect(result!.headline).not.toMatch(/\bnull\b/i)
    expect(result!.headline).not.toContain('—')
  })
})
