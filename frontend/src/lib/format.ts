// Presentation-only rounding for display (Bounded-AI: a display transform, never a recomputation
// of the underlying score/gap/join). Raw values stay untouched in RoleSkillRow.
export function formatNum(value: number | null): string {
  return value === null ? '—' : String(Math.round(value * 100) / 100)
}

// Sign-honest, plain-language phrasing of a raw `salary_premium_pct` (Bounded-AI: a display
// transform of an already-computed number, never a recomputation). Reuses `formatNum`'s 2-decimal
// rounding convention and evaluates the sign AFTER rounding, so a value that rounds to zero
// (e.g. -0.001) takes the zero branch rather than "below". Never renders a literal minus sign —
// direction is conveyed by "above"/"below" alone.
export function formatSalaryPremiumPhrase(value: number | null): string | null {
  if (value === null) return null
  const rounded = Number(formatNum(value))
  if (rounded === 0) return 'right at typical pay for this skill'
  if (rounded > 0) return `${formatNum(value)}% above typical pay for this skill`
  return `${formatNum(Math.abs(value))}% below typical pay for this skill`
}
