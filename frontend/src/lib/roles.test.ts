import { describe, it, expect } from 'vitest'
import { ROLES } from './roles'

// Characterization tests (SPIKE path): freeze the observed contract of the role list.
// These six strings are the single source of truth for the picker's options AND the exact
// `role_family` values queried against Supabase — internal slash-spacing is load-bearing.
describe('ROLES', () => {
  it('exports exactly the six V1 role strings, verbatim, in order', () => {
    expect(ROLES).toEqual([
      'Backend',
      'Full Stack',
      'Data Scientist / ML',
      'Data Engineer',
      'Software Engineer',
      'DevOps / Cloud / SRE',
    ])
  })

  it('has exactly six roles', () => {
    expect(ROLES).toHaveLength(6)
  })

  it('preserves the internal " / " slash-spacing exactly (no trimming or collapsing)', () => {
    // Regression guard: a normalizer that "cleans up" spacing would silently break the
    // Supabase .eq('role_family', ...) filter, which matches these strings byte-for-byte.
    expect(ROLES).toContain('Data Scientist / ML')
    expect(ROLES).toContain('DevOps / Cloud / SRE')
    expect(ROLES).not.toContain('Data Scientist/ML')
    expect(ROLES).not.toContain('DevOps/Cloud/SRE')
  })

  it('contains no duplicates', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length)
  })
})
