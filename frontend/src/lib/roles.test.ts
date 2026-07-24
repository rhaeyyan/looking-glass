import { describe, it, expect } from 'vitest'
import { ROLES } from './roles'

// Characterization tests: freeze the observed contract of the role list.
// These 15 strings are the single source of truth for the picker's options AND the exact
// `role_family` values queried against Supabase — internal slash-spacing and the parenthetical
// in "Designer (UX/UI)" are load-bearing. Byte-for-byte match with
// tests/test_data_invariants.py's ALL_15_ROLE_FAMILIES (spec 011).
const ALL_15_ROLES = [
  'Backend',
  'Full Stack',
  'Data Scientist / ML',
  'Data Engineer',
  'Software Engineer',
  'DevOps / Cloud / SRE',
  'Frontend',
  'Data Analyst / BI',
  'Mobile',
  'Security',
  'QA / Test',
  'Business Analyst',
  'Designer (UX/UI)',
  'Product Manager',
  'Project / Program Mgr',
]

describe('ROLES', () => {
  it('exports exactly the fifteen role strings, verbatim, as a set (order-independent)', () => {
    expect(new Set(ROLES)).toEqual(new Set(ALL_15_ROLES))
  })

  it('has exactly fifteen roles', () => {
    expect(ROLES).toHaveLength(15)
  })

  it('preserves the internal " / " slash-spacing exactly (no trimming or collapsing)', () => {
    // Regression guard: a normalizer that "cleans up" spacing would silently break the
    // Supabase .eq('role_family', ...) filter, which matches these strings byte-for-byte.
    expect(ROLES).toContain('Data Scientist / ML')
    expect(ROLES).toContain('DevOps / Cloud / SRE')
    expect(ROLES).toContain('Data Analyst / BI')
    expect(ROLES).toContain('QA / Test')
    expect(ROLES).toContain('Project / Program Mgr')
    expect(ROLES).not.toContain('Data Scientist/ML')
    expect(ROLES).not.toContain('DevOps/Cloud/SRE')
  })

  it('preserves the parenthetical in "Designer (UX/UI)" verbatim', () => {
    expect(ROLES).toContain('Designer (UX/UI)')
    expect(ROLES).not.toContain('Designer (UX / UI)')
    expect(ROLES).not.toContain('Designer')
  })

  it('contains no duplicates', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length)
  })
})
