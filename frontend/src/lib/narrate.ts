import type { RoleSkillRow } from './supabaseClient'
import { normalizeSkillName } from './normalize'
import { formatNum } from './format'

// Deterministic, synchronous, zero-I/O narration of a role's top skill gap (spec 005, Task 4).
// No LLM/network call, no `await`, anywhere in this file — this IS the entire narration layer,
// and (per the approved framing) the literal fallback branch any future LLM-narration
// reintroduction would call into on rate-limit/timeout/schema-validation failure.
//
// Every number interpolated below is `formatNum(...)` of a real field read verbatim from
// `topGap`/`runnerUpGap` — never re-derived, never fabricated, never printed for a null field.

// Fixed tie-precedence chain (never field-declaration order): first non-tied, both-non-null
// field wins. A `null` on either side is not a win for either row — fall through to the next
// field, per spec.
const TIE_PRECEDENCE = [
  'arbitrage_score',
  'demand_score',
  'scarcity_index',
  'salary_premium_pct',
  'median_days_open',
] as const

type ComparableField = (typeof TIE_PRECEDENCE)[number]

const FIELD_LABEL: Record<ComparableField, string> = {
  arbitrage_score: 'arbitrage score',
  demand_score: 'demand',
  scarcity_index: 'scarcity',
  salary_premium_pct: 'salary premium',
  median_days_open: 'median days to fill',
}

/** First field in the fixed precedence chain where both sides are non-null and not tied. */
function findDecidingField(top: RoleSkillRow, runnerUp: RoleSkillRow): ComparableField | null {
  for (const field of TIE_PRECEDENCE) {
    const a = top[field]
    const b = runnerUp[field]
    if (typeof a !== 'number' || typeof b !== 'number') continue // null/undefined -> fall through
    if (formatNum(a) === formatNum(b)) continue // tied (rounded), never a raw === compare
    return field
  }
  return null
}

/** Verbatim, non-null score clauses for a single row — used only in the no-runner-up case. */
function scoreClauses(row: RoleSkillRow): string[] {
  const clauses: string[] = []
  if (typeof row.arbitrage_score === 'number') {
    clauses.push(`an arbitrage score of ${formatNum(row.arbitrage_score)}`)
  }
  if (typeof row.demand_score === 'number') {
    clauses.push(`demand ${formatNum(row.demand_score)}`)
  }
  if (typeof row.scarcity_index === 'number') {
    clauses.push(`scarcity ${formatNum(row.scarcity_index)}`)
  }
  if (typeof row.salary_premium_pct === 'number') {
    clauses.push(`a ${formatNum(row.salary_premium_pct)}% salary premium`)
  }
  if (typeof row.median_days_open === 'number') {
    clauses.push(`a median ${formatNum(row.median_days_open)} days to fill`)
  }
  return clauses
}

// Demand-only degradation: no D1/D2 match at all, so demand_score/scarcity_index/
// arbitrage_score/salary_premium_pct/median_days_open are all null together. `pct_of_role` comes
// straight from the role profile and is never null — it is the only real demand signal left to
// cite; never hardcode a null field as the citation source.
function demandOnlySentence(row: RoleSkillRow): string {
  return (
    `${row.skill_name_raw} is your top gap to close: arbitrage and scarcity data are ` +
    `unavailable for it yet, but it already appears in ${formatNum(row.pct_of_role)}% of role ` +
    `postings, a strong raw demand signal.`
  )
}

function soloSentence(row: RoleSkillRow): string {
  const clauses = scoreClauses(row)
  return `${row.skill_name_raw} is your top gap to close, with ${clauses.join(', ')}.`
}

function comparisonSentence(top: RoleSkillRow, runnerUp: RoleSkillRow, field: ComparableField): string {
  const label = FIELD_LABEL[field]
  const topVal = formatNum(top[field] as number)
  const runnerVal = formatNum(runnerUp[field] as number)
  return `${top.skill_name_raw} ranks above ${runnerUp.skill_name_raw} on ${label}: ${topVal} vs ${runnerVal}.`
}

function tieFallbackSentence(top: RoleSkillRow, runnerUp: RoleSkillRow): string {
  return (
    `${top.skill_name_raw} and ${runnerUp.skill_name_raw} are tied on every comparable metric; ` +
    `${top.skill_name_raw} is listed first, but either is a solid next move.`
  )
}

function buildNarrative(topGap: RoleSkillRow, runnerUpGap: RoleSkillRow | null): string {
  if (topGap.arbitrage_score === null) {
    return demandOnlySentence(topGap)
  }
  if (!runnerUpGap) {
    return soloSentence(topGap)
  }
  const decidingField = findDecidingField(topGap, runnerUpGap)
  if (decidingField) {
    return comparisonSentence(topGap, runnerUpGap, decidingField)
  }
  return tieFallbackSentence(topGap, runnerUpGap)
}

/**
 * Scans `rows` (assumed already sorted by `computeSkillGap`'s convention: descending
 * `arbitrage_score`, null-last) for the first non-"have" row (the top gap) and the next non-
 * "have" row after it (the runner-up gap, which may not exist), then narrates the result.
 * Pure, synchronous, zero I/O — reuses the exact `skill_key ?? normalizeSkillName(skill_name_raw)`
 * key convention from `gap.ts`.
 */
export function narrateTopGap(
  rows: RoleSkillRow[],
  haveSkillKeys: Set<string>,
): { topGap: RoleSkillRow; runnerUpGap: RoleSkillRow | null; narrative: string } | null {
  const gaps: RoleSkillRow[] = []
  for (const row of rows) {
    const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
    if (haveSkillKeys.has(key)) continue
    gaps.push(row)
    if (gaps.length === 2) break
  }

  if (gaps.length === 0) return null

  const topGap = gaps[0]
  const runnerUpGap = gaps[1] ?? null

  return { topGap, runnerUpGap, narrative: buildNarrative(topGap, runnerUpGap) }
}
