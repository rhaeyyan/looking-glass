import type { RoleSkillRow } from './supabaseClient'

// specs/026-skill-group-breakdown.md: a pure, deterministic groupby/aggregate over a role's
// already-fetched `role_skill_arbitrage` rows, by `skill_group` — data-layer only, no UI here.
// No new score/gap/join computation: every field aggregated below (arbitrage_score, skill_key
// membership) is already computed upstream (Supabase views / gap.ts). Grouping is dynamic off
// each row's own `skill_group` value — no hardcoded enum — because the real `skill_group` value
// set is not enumerated in this checkout (see the SPEC's Constraints).

export interface SkillGroupBreakdown {
  skill_group: string // a real skills_core.skill_group value, or "Uncategorized"
  total_skills: number
  scored_skills: number
  have_skills: number | null // null if haveSkillKeys is undefined (no resume yet)
  gap_skills: number | null // null if haveSkillKeys is undefined
  avg_arbitrage_score: number | null // null if scored_skills === 0
  top_skill: { skill_name_raw: string; arbitrage_score: number } | null
}

const UNCATEGORIZED = 'Uncategorized'

export function computeSkillGroupBreakdown(
  rows: RoleSkillRow[],
  haveSkillKeys?: Set<string>,
): SkillGroupBreakdown[] {
  const groups = new Map<string, RoleSkillRow[]>()

  for (const row of rows) {
    const key = row.skill_group ?? UNCATEGORIZED
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      groups.set(key, [row])
    }
  }

  const breakdown: SkillGroupBreakdown[] = []

  for (const [skillGroup, groupRows] of groups) {
    const scoredRows = groupRows.filter(
      (row): row is RoleSkillRow & { arbitrage_score: number } => row.arbitrage_score !== null,
    )

    let avgArbitrageScore: number | null = null
    let topSkill: SkillGroupBreakdown['top_skill'] = null

    if (scoredRows.length > 0) {
      const sum = scoredRows.reduce((total, row) => total + row.arbitrage_score, 0)
      avgArbitrageScore = sum / scoredRows.length

      const top = scoredRows.reduce((best, row) =>
        row.arbitrage_score > best.arbitrage_score ? row : best,
      )
      topSkill = { skill_name_raw: top.skill_name_raw, arbitrage_score: top.arbitrage_score }
    }

    const haveSkills =
      haveSkillKeys === undefined
        ? null
        : groupRows.filter((row) => row.skill_key !== null && haveSkillKeys.has(row.skill_key))
            .length
    const gapSkills = haveSkillKeys === undefined ? null : groupRows.length - (haveSkills ?? 0)

    breakdown.push({
      skill_group: skillGroup,
      total_skills: groupRows.length,
      scored_skills: scoredRows.length,
      have_skills: haveSkills,
      gap_skills: gapSkills,
      avg_arbitrage_score: avgArbitrageScore,
      top_skill: topSkill,
    })
  }

  breakdown.sort((a, b) => {
    if (a.avg_arbitrage_score === null && b.avg_arbitrage_score === null) {
      return a.skill_group.localeCompare(b.skill_group)
    }
    if (a.avg_arbitrage_score === null) return 1
    if (b.avg_arbitrage_score === null) return -1
    if (a.avg_arbitrage_score !== b.avg_arbitrage_score) {
      return b.avg_arbitrage_score - a.avg_arbitrage_score
    }
    return a.skill_group.localeCompare(b.skill_group)
  })

  return breakdown
}
