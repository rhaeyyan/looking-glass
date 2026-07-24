import { describe, it, expect } from 'vitest'
import { formatNum, formatSalaryPremiumPhrase } from './format'

// RED phase (spec 013): `formatSalaryPremiumPhrase` does not exist yet — Redwood builds it to
// make these tests pass. This file locks the contract:
//
//   formatSalaryPremiumPhrase(value: number | null): string | null
//
//   - `null` in -> `null` out.
//   - Rounding reuses `formatNum`'s existing 2-decimal convention internally.
//   - Sign rule, evaluated AFTER rounding (i.e. against `Number(formatNum(value))`, not the raw
//     value) so a value like -0.001 that rounds to 0 takes the zero branch, not the negative one:
//       > 0   -> `${formatNum(value)}% above typical pay for this skill`
//       < 0   -> `${formatNum(Math.abs(value))}% below typical pay for this skill` — no literal
//                minus sign anywhere in the output; direction is conveyed by "below" alone.
//       === 0 -> the literal string "right at typical pay for this skill" — no `0%` digit
//                rendered at all.

describe('formatSalaryPremiumPhrase', () => {
  it('returns null for a null input, unchanged', () => {
    expect(formatSalaryPremiumPhrase(null)).toBeNull()
  })

  it('renders a positive value as an "above" phrase using formatNum\'s rounding', () => {
    expect(formatSalaryPremiumPhrase(12)).toBe('12% above typical pay for this skill')
  })

  it('renders a positive non-integer value rounded to formatNum\'s 2-decimal convention', () => {
    expect(formatSalaryPremiumPhrase(12.345)).toBe(
      `${formatNum(12.345)}% above typical pay for this skill`,
    )
  })

  it('renders a negative value as a "below" phrase using the absolute magnitude', () => {
    expect(formatSalaryPremiumPhrase(-8)).toBe('8% below typical pay for this skill')
  })

  it('never emits a literal minus sign for a negative value — direction is conveyed by "below" alone', () => {
    const result = formatSalaryPremiumPhrase(-8.4)
    expect(result).not.toBeNull()
    expect(result).not.toMatch(/-\d/)
    expect(result).not.toContain('-')
    expect(result).toContain('below typical pay for this skill')
  })

  it('renders exactly zero as the no-percentage phrase, with no "0%" digit', () => {
    expect(formatSalaryPremiumPhrase(0)).toBe('right at typical pay for this skill')
  })

  it('renders a value that rounds to zero (e.g. -0.001) as the no-percentage phrase, not "below"', () => {
    const result = formatSalaryPremiumPhrase(-0.001)
    expect(result).toBe('right at typical pay for this skill')
    expect(result).not.toContain('below')
    expect(result).not.toContain('%')
  })

  it('renders a small positive value that rounds to zero (e.g. 0.001) as the no-percentage phrase, not "above"', () => {
    const result = formatSalaryPremiumPhrase(0.001)
    expect(result).toBe('right at typical pay for this skill')
    expect(result).not.toContain('above')
    expect(result).not.toContain('%')
  })

  it('the zero-edge phrase never renders a "0%" digit sequence', () => {
    expect(formatSalaryPremiumPhrase(0)).not.toMatch(/0%/)
  })

  it('is deterministic: repeated calls with the same input produce byte-identical output', () => {
    expect(formatSalaryPremiumPhrase(-8.4)).toBe(formatSalaryPremiumPhrase(-8.4))
    expect(formatSalaryPremiumPhrase(12.345)).toBe(formatSalaryPremiumPhrase(12.345))
  })
})
