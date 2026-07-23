import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import {
  roleSkillProfileFixture,
  SCORED_SKILLS,
  SCORED_COUNT,
  DEMAND_ONLY_SKILL,
} from '../../test/fixtures/roleSkillProfile.fixture'

// RED phase (Task 6 of specs/003) — Magnolia's <SkillMatrix> does NOT exist yet. Each test
// dynamically imports it so a missing module fails THIS test with a real assertion/throw rather
// than aborting collection of the whole file. When Task 7 lands the component, these go green.
//
// Component contract Magnolia MUST honor (see [COMPLIANCE-REPORT]):
//   - named export `SkillMatrix`, prop `rows: RoleSkillRow[]`
//   - matrix root:            data-testid="skill-matrix"
//   - each plotted point:     data-testid="scatter-point", role="button" (or <button>),
//                             tabbable, accessible name including the skill_name_raw,
//                             a non-empty `data-shape` attribute (non-color encoding)
//   - reduced motion:         root carries data-reduced-motion="true" when
//                             (prefers-reduced-motion: reduce) matches; no inline animation/
//                             transition on points
//   - table alternative:      a real <table> with <caption> and <th scope="col">, one body row
//                             per fixture skill, exposing the raw numeric fields; the demand-only
//                             row present and flagged.
// Variable specifier + @vite-ignore so Vite does NOT statically pre-resolve the (not-yet-existing)
// module at transform time — that would abort file collection. Instead the import throws at RUNTIME
// inside each test, yielding a clean per-test RED failure until Task 7 creates the component.
const SKILL_MATRIX_MODULE = './SkillMatrix'
async function loadSkillMatrix() {
  const mod = await import(/* @vite-ignore */ SKILL_MATRIX_MODULE)
  return mod.SkillMatrix
}

const realMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
})

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('<SkillMatrix /> demand×scarcity scatter', () => {
  it('plots exactly one point per SCORED skill and excludes the null-score row', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    // Only the three rows with numeric (demand, scarcity) coordinates are plotted.
    expect(points).toHaveLength(SCORED_COUNT)

    for (const skill of SCORED_SKILLS) {
      expect(screen.getByRole('button', { name: new RegExp(skill) })).toBeInTheDocument()
    }
    // The demand-only row has no plotted coordinate and must NOT appear as a scatter point.
    expect(
      screen.queryByRole('button', { name: new RegExp(DEMAND_ONLY_SKILL) }),
    ).not.toBeInTheDocument()
  })

  it('encodes each point with a non-color shape attribute (not color-only)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    expect(points).toHaveLength(SCORED_COUNT)
    for (const point of points) {
      // A distinguishing encoding that survives color-blindness / grayscale.
      expect(point).toHaveAttribute('data-shape')
      expect(point.getAttribute('data-shape')).toBeTruthy()
      // Every point is announceable — accessible name, never a bare glyph.
      expect(point).toHaveAccessibleName()
    }
  })

  it('makes every plotted point a real focusable, keyboard-operable element', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    for (const point of points) {
      // Operable via Enter/Space requires a button role (native <button> or role="button").
      const isButtonLike =
        point.tagName === 'BUTTON' || point.getAttribute('role') === 'button'
      expect(isButtonLike).toBe(true)
    }

    // Reachable by keyboard alone: tabbing through the document lands on each point.
    const focused = new Set<Element>()
    for (let i = 0; i < points.length + 3; i++) {
      await user.tab()
      if (document.activeElement) focused.add(document.activeElement)
    }
    for (const point of points) {
      expect(focused.has(point)).toBe(true)
    }
  })

  it('renders an accessible <table> alternative with every fixture skill and its raw numbers', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const table = screen.getByRole('table')
    expect(table.querySelector('caption')).toBeTruthy()

    // Column headers must be scoped for screen readers.
    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.length).toBeGreaterThan(0)
    for (const th of columnHeaders) {
      expect(th).toHaveAttribute('scope', 'col')
    }

    // One row per fixture skill — including the demand-only row (never dropped).
    for (const row of roleSkillProfileFixture) {
      expect(within(table).getByText(row.skill_name_raw)).toBeInTheDocument()
    }

    // Raw numeric fields surface verbatim (arbitrage scores are unique per row).
    expect(within(table).getByText('9.1')).toBeInTheDocument()
    expect(within(table).getByText('7.3')).toBeInTheDocument()
    expect(within(table).getByText('4.2')).toBeInTheDocument()

    // The demand-only row is flagged, not silently blank.
    expect(within(table).getByText(/demand only/i)).toBeInTheDocument()
  })

  it('respects prefers-reduced-motion: no animation applied when reduce is set', async () => {
    mockReducedMotion(true)
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const root = screen.getByTestId('skill-matrix')
    expect(root).toHaveAttribute('data-reduced-motion', 'true')

    for (const point of screen.getAllByTestId('scatter-point')) {
      const el = point as HTMLElement
      expect(el.style.animation).toBe('')
      expect(el.style.transition).toBe('')
    }
  })

  it('has zero axe violations on the fully mounted matrix', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const { container } = render(<SkillMatrix rows={roleSkillProfileFixture} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
