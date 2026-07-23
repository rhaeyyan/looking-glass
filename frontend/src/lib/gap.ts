import type { RoleSkillRow } from './supabaseClient'
import { normalizeSkillName } from './normalize'

// Deterministic resume-vs-role skill gap computation (spec 004, Task 4). No I/O, no LLM access,
// no score computation — every `arbitrage_score` is read verbatim from the input rows.
//
// Matching: normalize both the role-side identifier (`skill_key ?? normalizeSkillName(skill_name_raw)`)
// and each resume-extracted skill string, then exact-match. No fuzzy/alias matching.
//
// Sort: reuses ArbitrageLadder's exact `byArbitrageDesc` null-scores-last descending-by-
// `arbitrage_score` rule — never a second, independently-drifting sort.
function byArbitrageDesc(a: RoleSkillRow, b: RoleSkillRow): number {
  if (a.arbitrage_score === null && b.arbitrage_score === null) return 0
  if (a.arbitrage_score === null) return 1
  if (b.arbitrage_score === null) return -1
  return b.arbitrage_score - a.arbitrage_score
}

export function computeSkillGap(
  rows: RoleSkillRow[],
  resumeSkills: string[],
): { haveSkillKeys: Set<string>; rows: RoleSkillRow[] } {
  const resumeSkillKeys = new Set(resumeSkills.map(normalizeSkillName))

  const haveSkillKeys = new Set<string>()
  for (const row of rows) {
    const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
    if (resumeSkillKeys.has(key)) {
      haveSkillKeys.add(key)
    }
  }

  return {
    haveSkillKeys,
    rows: [...rows].sort(byArbitrageDesc),
  }
}
