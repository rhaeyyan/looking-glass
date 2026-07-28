import { describe, it, expect } from 'vitest'
import type { RoleSkillRow } from './supabaseClient'
// This module does not exist yet — that is the RED for specs/026-skill-group-breakdown.md:
// Redwood must author `computeSkillGroupBreakdown` in `frontend/src/lib/skillGroupBreakdown.ts`.
// Until then this entire file fails to even resolve its import.
import { computeSkillGroupBreakdown } from './skillGroupBreakdown'

// `RoleSkillRow` (frontend/src/lib/supabaseClient.ts) does not yet declare `skill_group` — that
// column is added by the same SPEC's migration/type-passthrough task. Extending the type locally
// (rather than editing supabaseClient.ts, which is out of scope for this test-only task) keeps
// these fixtures valid both today and once `skill_group` is added to the real `RoleSkillRow`.
type Row = RoleSkillRow & { skill_group: string | null }

// Builds a fixture row with sensible defaults for every field `computeSkillGroupBreakdown` does
// not itself inspect, so each test only spells out the fields it actually cares about — same
// "explicit RoleSkillRow literal per row" spirit as roleSkillProfile.fixture.ts, minus the
// boilerplate this file's many small, per-edge-case fixtures would otherwise repeat.
function row(overrides: Partial<Row> & Pick<Row, 'skill_name_raw' | 'skill_key' | 'skill_group'>): Row {
  return {
    role_family: 'Backend',
    pct_of_role: 10,
    postings_with_skill: 100,
    demand_score: null,
    scarcity_index: null,
    arbitrage_score: null,
    scarcity_data_completeness: null,
    d3_corroborated: null,
    d3_pct_of_all_postings: null,
    salary_premium_pct: null,
    median_days_open: null,
    ...overrides,
  }
}

describe('computeSkillGroupBreakdown — grouping and null-skill_group handling', () => {
  it('buckets a null skill_group row into a literal "Uncategorized" group, never dropped or merged', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'Mystery Skill', skill_key: null, skill_group: null, arbitrage_score: 5 }),
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
    ]

    const result = computeSkillGroupBreakdown(rows)

    const uncategorized = result.find((g) => g.skill_group === 'Uncategorized')
    expect(uncategorized).toBeDefined()
    expect(uncategorized!.total_skills).toBe(1)

    const cloud = result.find((g) => g.skill_group === 'Cloud')
    expect(cloud).toBeDefined()
    expect(cloud!.total_skills).toBe(1)

    // Never merged into another group, never silently discarded: exactly 2 groups total.
    expect(result).toHaveLength(2)
  })

  it('buckets a group name never used anywhere else in this fixture file correctly (no hardcoded enum)', () => {
    const inventedGroupName = 'Quantum Widgetry'
    const rows: Row[] = [
      row({
        skill_name_raw: 'Qubit Tuning',
        skill_key: 'qubit-tuning',
        skill_group: inventedGroupName,
        arbitrage_score: 7,
      }),
    ]

    const result = computeSkillGroupBreakdown(rows)

    expect(result).toHaveLength(1)
    expect(result[0].skill_group).toBe(inventedGroupName)
    expect(result[0].total_skills).toBe(1)
    expect(result[0].scored_skills).toBe(1)
  })
})

describe('computeSkillGroupBreakdown — score aggregation never fabricates a value', () => {
  it('a group where every row has arbitrage_score:null has avg_arbitrage_score:null and top_skill:null (never 0)', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'gRPC', skill_key: null, skill_group: 'Networking', arbitrage_score: null }),
      row({ skill_name_raw: 'Thrift', skill_key: null, skill_group: 'Networking', arbitrage_score: null }),
    ]

    const result = computeSkillGroupBreakdown(rows)
    const networking = result.find((g) => g.skill_group === 'Networking')!

    expect(networking.scored_skills).toBe(0)
    expect(networking.avg_arbitrage_score).toBeNull()
    expect(networking.top_skill).toBeNull()
  })

  it('total_skills counts every row in the group; scored_skills counts only rows with a non-null arbitrage_score', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
      row({ skill_name_raw: 'gRPC', skill_key: null, skill_group: 'Cloud', arbitrage_score: null }),
    ]

    const result = computeSkillGroupBreakdown(rows)
    const cloud = result.find((g) => g.skill_group === 'Cloud')!

    expect(cloud.total_skills).toBe(2)
    expect(cloud.scored_skills).toBe(1)
  })

  it('avg_arbitrage_score averages only over scored rows, ignoring null-score rows in the same group', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 4 }),
      row({ skill_name_raw: 'GCP', skill_key: 'gcp', skill_group: 'Cloud', arbitrage_score: 8 }),
      row({ skill_name_raw: 'gRPC', skill_key: null, skill_group: 'Cloud', arbitrage_score: null }),
    ]

    const result = computeSkillGroupBreakdown(rows)
    const cloud = result.find((g) => g.skill_group === 'Cloud')!

    expect(cloud.avg_arbitrage_score).toBe(6)
  })

  it('top_skill is the highest-arbitrage_score row within its group', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 4 }),
      row({ skill_name_raw: 'GCP', skill_key: 'gcp', skill_group: 'Cloud', arbitrage_score: 9 }),
    ]

    const result = computeSkillGroupBreakdown(rows)
    const cloud = result.find((g) => g.skill_group === 'Cloud')!

    expect(cloud.top_skill).toEqual({ skill_name_raw: 'GCP', arbitrage_score: 9 })
  })
})

describe('computeSkillGroupBreakdown — have/gap counts distinguish "no resume yet" from "zero gaps"', () => {
  it('haveSkillKeys omitted entirely -> have_skills and gap_skills are null for every group (never 0)', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
    ]

    const result = computeSkillGroupBreakdown(rows)

    expect(result[0].have_skills).toBeNull()
    expect(result[0].gap_skills).toBeNull()
  })

  it('haveSkillKeys provided but empty -> have_skills:0, gap_skills:total (0 is distinguishable from omitted/null)', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
    ]

    const result = computeSkillGroupBreakdown(rows, new Set())

    expect(result[0].have_skills).toBe(0)
    expect(result[0].gap_skills).toBe(1)
  })

  it('computes have_skills/gap_skills counts per group against haveSkillKeys', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
      row({ skill_name_raw: 'GCP', skill_key: 'gcp', skill_group: 'Cloud', arbitrage_score: 5 }),
    ]

    const result = computeSkillGroupBreakdown(rows, new Set(['aws']))
    const cloud = result.find((g) => g.skill_group === 'Cloud')!

    expect(cloud.have_skills).toBe(1)
    expect(cloud.gap_skills).toBe(1)
  })
})

describe('computeSkillGroupBreakdown — sort order (descending avg_arbitrage_score, alphabetical tie-break, null-last)', () => {
  it('breaks a tie in avg_arbitrage_score alphabetically by skill_group', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'Zed Tool', skill_key: 'zed', skill_group: 'Zeta', arbitrage_score: 5 }),
      row({ skill_name_raw: 'Alpha Tool', skill_key: 'alpha', skill_group: 'Alpha', arbitrage_score: 5 }),
    ]

    const result = computeSkillGroupBreakdown(rows)

    expect(result.map((g) => g.skill_group)).toEqual(['Alpha', 'Zeta'])
  })

  it('sorts groups descending by avg_arbitrage_score, with null-average groups sorted last', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'Unscored', skill_key: null, skill_group: 'Unscored Group', arbitrage_score: null }),
      row({ skill_name_raw: 'HighScore', skill_key: 'hs', skill_group: 'High', arbitrage_score: 9 }),
      row({ skill_name_raw: 'LowScore', skill_key: 'ls', skill_group: 'Low', arbitrage_score: 2 }),
    ]

    const result = computeSkillGroupBreakdown(rows)

    expect(result.map((g) => g.skill_group)).toEqual(['High', 'Low', 'Unscored Group'])
  })
})

describe('computeSkillGroupBreakdown — determinism', () => {
  it('calling twice on identical input yields identical (deep-equal) output', () => {
    const rows: Row[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
      row({ skill_name_raw: 'Rust', skill_key: 'rust', skill_group: 'Language', arbitrage_score: 6 }),
      row({ skill_name_raw: 'Mystery', skill_key: null, skill_group: null, arbitrage_score: null }),
    ]

    const first = computeSkillGroupBreakdown(rows, new Set(['aws']))
    const second = computeSkillGroupBreakdown(rows, new Set(['aws']))

    expect(second).toEqual(first)
  })
})
