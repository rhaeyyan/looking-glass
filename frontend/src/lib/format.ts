// Presentation-only rounding for display (Bounded-AI: a display transform, never a recomputation
// of the underlying score/gap/join). Raw values stay untouched in RoleSkillRow.
export function formatNum(value: number | null): string {
  return value === null ? '—' : String(Math.round(value * 100) / 100)
}
