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

// Spec 014 — plain-language salary-premium phrasing + a persistently visible, aria-describedby
// linked footnote (no native `title` tooltip, no interactive popover; the footnote is always
// rendered in the DOM).
describe('<SkillLeverageTable /> salary premium phrase + footnote (spec 014)', () => {
  it('renders the plain-language salary-premium phrase instead of the bare ±X% in the cell', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    // Kubernetes: salary_premium_pct = 11.8 -> "11.8% above typical pay for this skill"
    expect(within(table).getByText('11.8% above typical pay for this skill')).toBeInTheDocument()
    // Rust: salary_premium_pct = 22.6 -> "22.6% above typical pay for this skill"
    expect(within(table).getByText('22.6% above typical pay for this skill')).toBeInTheDocument()
    // PostgreSQL: salary_premium_pct = 14.5 -> "14.5% above typical pay for this skill"
    expect(within(table).getByText('14.5% above typical pay for this skill')).toBeInTheDocument()

    // The bare "±X%" numeric-only rendering must be gone.
    expect(within(table).queryByText('11.8%')).not.toBeInTheDocument()
    expect(within(table).queryByText('22.6%')).not.toBeInTheDocument()
    expect(within(table).queryByText('14.5%')).not.toBeInTheDocument()
  })

  it('still renders an em dash for the demand-only row\'s null salary_premium_pct (no phrase)', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    const grpcRow = within(table)
      .getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })
      .closest('tr')!
    // Still at least one em dash on that row (multiple null fields already render '—').
    expect(within(grpcRow).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(grpcRow).queryByText(/typical pay/)).not.toBeInTheDocument()
  })

  it('gives the "Salary premium" column header a visible, aria-hidden marker glyph', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    // The header's accessible name (computed with aria-hidden content excluded) must still just
    // read "Salary premium" — the marker glyph must be aria-hidden, not part of the accessible name.
    expect(header).toHaveAccessibleName('Salary premium')
    // But a visible marker glyph must be present in the DOM, hidden from assistive tech.
    const hiddenMarker = header.querySelector('[aria-hidden="true"]')
    expect(hiddenMarker).toBeTruthy()
    expect(hiddenMarker?.textContent?.trim().length).toBeGreaterThan(0)
  })

  it('links the "Salary premium" header to a footnote via aria-describedby, and the referenced id exists exactly once in the DOM', () => {
    const { container } = render(
      <SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />,
    )

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    const describedBy = header.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()

    const referenced = container.querySelectorAll(`#${describedBy}`)
    expect(referenced.length).toBe(1)
    expect(referenced[0].tagName.toLowerCase()).toBe('p')
  })

  it('renders the footnote paragraph once (not per-row), near the ladder-hint paragraph, below the table', () => {
    const { container } = render(
      <SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />,
    )

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    const describedBy = header.getAttribute('aria-describedby')!
    const footnote = container.querySelector(`#${describedBy}`)!

    expect(footnote).toBeInTheDocument()
    // Exactly one footnote element in the whole document, regardless of row count.
    expect(container.querySelectorAll(`#${describedBy}`).length).toBe(1)

    // Honest copy: names the dataset's own "salary premium" metric and the comparison group as
    // "typical pay for that skill's job category" — must NOT invent an undocumented comparison
    // group like "postings without this skill".
    expect(footnote.textContent).toMatch(/salary premium/i)
    expect(footnote.textContent).toMatch(/typical pay/i)
    expect(footnote.textContent).not.toMatch(/postings without this skill/i)
  })

  it('does not use a native title attribute anywhere on the Salary premium header or cells (title tooltips are not WCAG-2.2-AA-sufficient)', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    expect(header).not.toHaveAttribute('title')

    const cells = within(table).getAllByText(/typical pay for this skill/)
    for (const cell of cells) {
      expect(cell.closest('td')).not.toHaveAttribute('title')
    }
  })

  it('has zero axe violations with the salary-premium footnote present (no dangling aria-describedby)', async () => {
    const { container } = render(
      <SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
