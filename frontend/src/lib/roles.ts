// Single source of truth for the six V1 role strings, verbatim as they appear in the
// `role_family` column of `role_skill_arbitrage` (see AGENTS.md's data invariants). Reused by
// the role-picker `<select>`'s options and by Cypress's tests — never re-typed elsewhere.
export const ROLES = [
  'Backend',
  'Full Stack',
  'Data Scientist / ML',
  'Data Engineer',
  'Software Engineer',
  'DevOps / Cloud / SRE',
] as const

export type Role = (typeof ROLES)[number]
