// Single source of truth for all fifteen role strings, verbatim as they appear in the
// `role_family` column of `role_skill_arbitrage` (see AGENTS.md's data invariants). Reused by
// the role-picker `<select>`'s options and by Cypress's tests — never re-typed elsewhere.
export const ROLES = [
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
] as const

export type Role = (typeof ROLES)[number]
