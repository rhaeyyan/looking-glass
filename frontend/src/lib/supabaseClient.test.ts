import { describe, it, expect, vi, beforeEach } from 'vitest'

// Characterization tests (SPIKE path): freeze the observed behavior of `fetchRoleSkillProfile`.
// The real `@supabase/supabase-js` client is mocked so no live network or credentials are needed;
// this also sidesteps `createClient` throwing on the undefined VITE_SUPABASE_* env in jsdom.
//
// Mock shape mirrors the exact call chain the client makes:
//   supabase.from('role_skill_arbitrage').select('<cols>').eq('role_family', role)  -> awaited
const mockState = vi.hoisted(() => ({
  // The value the awaited `.eq(...)` resolves to; overridden per-test.
  response: { data: [] as unknown, error: null as unknown },
  from: undefined as unknown as ReturnType<typeof vi.fn>,
  select: undefined as unknown as ReturnType<typeof vi.fn>,
  eq: undefined as unknown as ReturnType<typeof vi.fn>,
}))

vi.mock('@supabase/supabase-js', () => {
  const eq = vi.fn(() => Promise.resolve(mockState.response))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  mockState.eq = eq
  mockState.select = select
  mockState.from = from
  return { createClient: vi.fn(() => ({ from })) }
})

import { fetchRoleSkillProfile } from './supabaseClient'
import type { RoleSkillRow } from './supabaseClient'

beforeEach(() => {
  mockState.response = { data: [], error: null }
  mockState.from.mockClear()
  mockState.select.mockClear()
  mockState.eq.mockClear()
})

describe('fetchRoleSkillProfile', () => {
  it('queries the role_skill_arbitrage view filtered by the exact role_family string', async () => {
    await fetchRoleSkillProfile('DevOps / Cloud / SRE')

    expect(mockState.from).toHaveBeenCalledWith('role_skill_arbitrage')
    // The slash-spacing must reach Supabase untouched — no normalization client-side.
    expect(mockState.eq).toHaveBeenCalledWith('role_family', 'DevOps / Cloud / SRE')
  })

  it('selects the frozen column list column-for-column with the view', async () => {
    await fetchRoleSkillProfile('Backend')

    // Task 1 of specs/005-template-narrator.md: the column-list string gains
    // `salary_premium_pct, median_days_open`, appended at the end — same append-only order as the
    // migration's SELECT list (tests/test_frontend_read_layer_migration.py).
    expect(mockState.select).toHaveBeenCalledWith(
      'role_family, skill_name_raw, skill_key, pct_of_role, postings_with_skill, demand_score, scarcity_index, arbitrage_score, scarcity_data_completeness, d3_corroborated, d3_pct_of_all_postings, salary_premium_pct, median_days_open',
    )
  })

  it('returns the rows verbatim on success, including a null-skill_key (demand-only) row', async () => {
    // Explicitly typed as `RoleSkillRow[]` (not left inferred) so this is a genuine type-level RED
    // per Task 1 of specs/005-template-narrator.md: until Task 2 adds `salary_premium_pct` /
    // `median_days_open` to `RoleSkillRow`, `tsc --noEmit` must fail excess-property checking on
    // these object literals.
    const rows: RoleSkillRow[] = [
      {
        role_family: 'Backend',
        skill_name_raw: 'PostgreSQL',
        skill_key: 'postgresql',
        pct_of_role: 42,
        postings_with_skill: 1200,
        demand_score: 88,
        scarcity_index: 12,
        arbitrage_score: 7.3,
        scarcity_data_completeness: 'complete',
        d3_corroborated: true,
        d3_pct_of_all_postings: 5.1,
        salary_premium_pct: 14.5,
        median_days_open: 21,
      },
      {
        role_family: 'Backend',
        skill_name_raw: 'gRPC',
        skill_key: null,
        pct_of_role: 8,
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
    mockState.response = { data: rows, error: null }

    const result = await fetchRoleSkillProfile('Backend')

    expect(result).toEqual(rows)
    // The demand-only row is never filtered out.
    expect(result).toHaveLength(2)
    expect(result[1].skill_key).toBeNull()
  })

  it('returns an empty array when Supabase returns null data', async () => {
    mockState.response = { data: null, error: null }

    await expect(fetchRoleSkillProfile('Backend')).resolves.toEqual([])
  })

  it('throws a descriptive error naming the role when Supabase returns an error', async () => {
    mockState.response = { data: null, error: { message: 'permission denied' } }

    await expect(fetchRoleSkillProfile('Data Engineer')).rejects.toThrow(
      'Failed to fetch role skill profile for "Data Engineer": permission denied',
    )
  })
})
