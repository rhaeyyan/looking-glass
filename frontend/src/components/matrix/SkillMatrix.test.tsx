import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import {
  roleSkillProfileFixture,
  SCORED_SKILLS,
  SCORED_COUNT,
  DEMAND_ONLY_SKILL,
  HAVE_SKILL_KEYS,
  HAVE_SKILLS,
  GAP_SKILLS,
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

// RED phase (Task 5 of specs/004) — <SkillMatrix> does not accept `haveSkillKeys` yet. Task 6
// (Magnolia) threads it through the scatter points AND the wrapped <SkillDataTable>.
//
// Component contract Magnolia MUST honor (see [COMPLIANCE-REPORT]):
//   - additive optional prop `haveSkillKeys?: Set<string>` on SkillMatrix (and SkillDataTable,
//     which SkillMatrix renders internally and must forward the prop to).
//   - identifier scheme: a row's have/gap status is looked up via
//     `row.skill_key ?? normalizeSkillName(row.skill_name_raw)` against the Set — the SAME
//     identifier `computeSkillGap` (frontend/src/lib/gap.ts) produces.
//   - when `haveSkillKeys` is OMITTED (undefined): rendering is BYTE-IDENTICAL to today (no
//     `data-have` attribute, no glyph, no accessible-name suffix) — this is what keeps every test
//     above passing unmodified.
//   - when `haveSkillKeys` IS provided, each scatter point additionally carries:
//       - `data-have="true"` (skill key is in the set) or `data-have="false"` (not in the set) —
//         a non-color attribute differentiator, layered on top of the existing per-skill
//         `data-shape` encoding (never replacing it).
//       - a visible child element `data-testid="have-flag"` with text content exactly `"Have"` or
//         `"Gap"` — the "distinct glyph/label" the SPEC requires, present for BOTH states (not
//         "have" glyph vs. silent absence).
//       - an accessible name (aria-label) SUFFIXED with exactly
//         `", you already have this skill"` (have) or `", gap — you do not have this skill yet"`
//         (gap), appended after the existing demand/scarcity/market-share/arbitrage-score text.
//   - the wrapped <SkillDataTable> gets an explicit have/gap column: `<th scope="col">` text
//     `"Have or gap"`, with each `<td>` reading exactly `"Have"` or `"Gap"` (text, never
//     color-only) — see the mirrored contract note in ArbitrageLadder.test.tsx.
describe('<SkillMatrix /> have/gap rendering (haveSkillKeys prop)', () => {
  it('marks matching scatter points data-have="true" and non-matching ones data-have="false"', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    // Kubernetes (skill_key 'kubernetes') is in HAVE_SKILL_KEYS.
    const kubernetesPoint = screen.getByRole('button', { name: /^Kubernetes:/ })
    expect(kubernetesPoint).toHaveAttribute('data-have', 'true')

    // Rust and PostgreSQL are not in HAVE_SKILL_KEYS -> gap.
    for (const skill of GAP_SKILLS) {
      const point = screen.getByRole('button', { name: new RegExp(`^${skill}:`) })
      expect(point).toHaveAttribute('data-have', 'false')
    }
  })

  it('preserves the existing per-skill shape encoding alongside the new have/gap attribute (never replaces it)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      expect(point).toHaveAttribute('data-shape')
      expect(point.getAttribute('data-shape')).toBeTruthy()
      expect(point).toHaveAttribute('data-have')
    }
  })

  it('renders a non-color "Have"/"Gap" glyph/label on every scored scatter point', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const kubernetesPoint = screen.getByRole('button', { name: /^Kubernetes:/ })
    expect(within(kubernetesPoint).getByTestId('have-flag')).toHaveTextContent('Have')

    for (const skill of GAP_SKILLS) {
      const point = screen.getByRole('button', { name: new RegExp(`^${skill}:`) })
      expect(within(point).getByTestId('have-flag')).toHaveTextContent('Gap')
    }
  })

  it('suffixes the accessible name with explicit have/gap wording (not color-only)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    expect(
      screen.getByRole('button', { name: /Kubernetes:.*you already have this skill/ }),
    ).toBeInTheDocument()

    for (const skill of GAP_SKILLS) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`^${skill}:.*you do not have this skill yet`),
        }),
      ).toBeInTheDocument()
    }
  })

  it('threads haveSkillKeys into the accessible table alternative as an explicit have/gap column (never color-only)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const table = screen.getByRole('table')
    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.some((th) => /have.*gap/i.test(th.textContent ?? ''))).toBe(true)

    for (const skill of HAVE_SKILLS) {
      const rowHeader = within(table).getByRole('rowheader', { name: skill })
      const row = rowHeader.closest('tr')!
      expect(within(row).getByText('Have')).toBeInTheDocument()
    }
    for (const skill of GAP_SKILLS) {
      const rowHeader = within(table).getByRole('rowheader', { name: skill })
      const row = rowHeader.closest('tr')!
      expect(within(row).getByText('Gap')).toBeInTheDocument()
    }
  })

  it('renders every point identically to the no-prop case when haveSkillKeys is omitted (backward compatible)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      expect(point).not.toHaveAttribute('data-have')
      expect(within(point).queryByTestId('have-flag')).not.toBeInTheDocument()
    }
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Have')).not.toBeInTheDocument()
    expect(within(table).queryByText('Gap')).not.toBeInTheDocument()
  })

  it('has zero axe violations on the fully mounted matrix with have/gap state populated', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const { container } = render(
      <SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
