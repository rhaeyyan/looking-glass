import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import {
  roleSkillProfileFixture,
  LADDER_ORDER_DESC,
  DEMAND_ONLY_SKILL,
  HAVE_SKILL_KEYS,
  HAVE_SKILLS,
  GAP_SKILLS,
} from '../../test/fixtures/roleSkillProfile.fixture'
import { SkillLeverageTable } from './SkillLeverageTable'

// The merged "every skill, ranked by leverage" table replaces both the old standalone data table
// and the arbitrage ladder. Contract:
//   - an accessible <table> with a <caption>, `<th scope=col>` headers, one body row per fixture
//     skill (the demand-only row included, flagged, never dropped), row order descending by
//     arbitrage_score with the null-score row last.
//   - raw numeric fields render verbatim (Bounded-AI); the leverage bar is decorative.
//   - `haveSkillKeys` optional: omitted -> no Status column; provided -> a text Status column
//     (Already have / Worth learning), keyed by `skill_key ?? normalizeSkillName(skill_name_raw)`.
//   - zero axe violations.

function rowOrder(table: HTMLElement): string[] {
  const bodyRows = within(table).getAllByRole('row').slice(1) // drop the header row
  // The rowheader's own text content includes the demand-only flag as a child <span> — read only
  // the skill-name text node itself (the first child), not the flag appended after it.
  return bodyRows.map((r) => {
    const th = within(r).getByRole('rowheader')
    return th.firstChild?.textContent ?? ''
  })
}

describe('<SkillLeverageTable /> merged ranked table', () => {
  it('renders an accessible table with a caption and scoped column headers', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(table.querySelector('caption')).toBeTruthy()
    expect(within(table).getByText(/Skill profile for Backend/)).toBeInTheDocument()

    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.length).toBeGreaterThan(0)
    for (const th of columnHeaders) {
      expect(th).toHaveAttribute('scope', 'col')
    }
  })

  it('renders one row per skill, ordered by leverage descending with the demand-only row last', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(rowOrder(table)).toEqual([...LADDER_ORDER_DESC])
  })

  it('flags the demand-only (null arbitrage_score) row and never drops it', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })).toBeInTheDocument()
    expect(within(table).getByText(/demand only/i)).toBeInTheDocument()
    // Its unknown numeric fields render as an em dash, not blank/NaN.
    const grpcRow = within(table)
      .getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })
      .closest('tr')!
    expect(within(grpcRow).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('surfaces the raw numeric leverage scores verbatim', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    // Arbitrage/leverage scores are unique per row.
    expect(within(table).getByText('9.1')).toBeInTheDocument()
    expect(within(table).getByText('7.3')).toBeInTheDocument()
    expect(within(table).getByText('4.2')).toBeInTheDocument()
  })

  it('omits the Status column entirely when haveSkillKeys is not provided', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(within(table).queryByText('Already have')).not.toBeInTheDocument()
    expect(within(table).queryByText('Worth learning')).not.toBeInTheDocument()
  })

  it('renders a text Status column (Already have / Worth learning) keyed to computeSkillGap identifiers', () => {
    render(
      <SkillLeverageTable
        rows={roleSkillProfileFixture}
        roleName="Backend"
        haveSkillKeys={HAVE_SKILL_KEYS}
      />,
    )

    const table = screen.getByRole('table')
    for (const skill of HAVE_SKILLS) {
      const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
      expect(within(row).getByText('Already have')).toBeInTheDocument()
    }
    for (const skill of GAP_SKILLS) {
      const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
      expect(within(row).getByText('Worth learning')).toBeInTheDocument()
    }
  })

  it('has zero axe violations (no prop)', async () => {
    const { container } = render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has zero axe violations with the Status column populated', async () => {
    const { container } = render(
      <SkillLeverageTable
        rows={roleSkillProfileFixture}
        roleName="Backend"
        haveSkillKeys={HAVE_SKILL_KEYS}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
