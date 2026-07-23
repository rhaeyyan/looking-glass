import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import {
  roleSkillProfileFixture,
  LADDER_ORDER_DESC,
  DEMAND_ONLY_SKILL,
  HAVE_SKILL_KEYS,
  HAVE_SKILLS,
  GAP_SKILLS,
} from '../../test/fixtures/roleSkillProfile.fixture'

// RED phase (Task 6 of specs/003) — Magnolia's <ArbitrageLadder> does NOT exist yet. Dynamic import
// keeps a missing module a per-test failure, not a collection abort.
//
// Component contract Magnolia MUST honor (see [COMPLIANCE-REPORT]):
//   - named export `ArbitrageLadder`, prop `rows: RoleSkillRow[]`
//   - each ladder bar:  data-testid="ladder-item", role="button" (or <button>), tabbable,
//                       accessible name including the skill_name_raw
//   - order:            rendered descending by arbitrage_score, null-score rows LAST
//   - demand-only row:  present and flagged with text matching /demand only/i
// Variable specifier + @vite-ignore so Vite does NOT statically pre-resolve the (not-yet-existing)
// module at transform time — that would abort file collection. Instead the import throws at RUNTIME
// inside each test, yielding a clean per-test RED failure until Task 7 creates the component.
const ARBITRAGE_LADDER_MODULE = './ArbitrageLadder'
async function loadArbitrageLadder() {
  const mod = await import(/* @vite-ignore */ ARBITRAGE_LADDER_MODULE)
  return mod.ArbitrageLadder
}

describe('<ArbitrageLadder /> ranked gap list', () => {
  it('renders one ladder item per fixture skill, including the demand-only row', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} />)

    const items = screen.getAllByTestId('ladder-item')
    // Every skill is ranked — the null-score row is not dropped, only sorted last.
    expect(items).toHaveLength(roleSkillProfileFixture.length)
  })

  it('orders items descending by arbitrage_score with the null-score row last', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} />)

    const items = screen.getAllByTestId('ladder-item')
    const renderedOrder = items.map((item) => {
      const match = LADDER_ORDER_DESC.find((skill) => item.textContent?.includes(skill))
      return match ?? '<unknown>'
    })
    expect(renderedOrder).toEqual([...LADDER_ORDER_DESC])
  })

  it('flags the demand-only (null arbitrage_score) row', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} />)

    const flagged = screen.getByText(/demand only/i)
    expect(flagged).toBeInTheDocument()
    // The flag belongs to the demand-only skill's item.
    const item = flagged.closest('[data-testid="ladder-item"]')
    expect(item).not.toBeNull()
    expect(item?.textContent).toContain(DEMAND_ONLY_SKILL)
  })

  it('makes every ladder item a real focusable, keyboard-operable element', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    const user = userEvent.setup()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} />)

    const items = screen.getAllByTestId('ladder-item')
    for (const item of items) {
      const isButtonLike =
        item.tagName === 'BUTTON' || item.getAttribute('role') === 'button'
      expect(isButtonLike).toBe(true)
      expect(item).toHaveAccessibleName()
    }

    const focused = new Set<Element>()
    for (let i = 0; i < items.length + 3; i++) {
      await user.tab()
      if (document.activeElement) focused.add(document.activeElement)
    }
    for (const item of items) {
      expect(focused.has(item)).toBe(true)
    }
  })

  it('has zero axe violations on the fully mounted ladder', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    const { container } = render(<ArbitrageLadder rows={roleSkillProfileFixture} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

// RED phase (Task 5 of specs/004) — <ArbitrageLadder> does not accept `haveSkillKeys` yet.
//
// Component contract Magnolia MUST honor (identical marker vocabulary to SkillMatrix.test.tsx —
// see [COMPLIANCE-REPORT] for the single canonical definition):
//   - additive optional prop `haveSkillKeys?: Set<string>`.
//   - identifier scheme: `row.skill_key ?? normalizeSkillName(row.skill_name_raw)`, the exact
//     identifier `computeSkillGap` produces.
//   - when OMITTED: byte-identical to today's rendering (no `data-have`, no glyph, no
//     accessible-name suffix) — keeps every test above passing unmodified.
//   - when provided, each `data-testid="ladder-item"` additionally carries:
//       - `data-have="true"` / `data-have="false"`.
//       - a visible child `data-testid="have-flag"` with text exactly `"Have"` or `"Gap"`.
//       - accessible name suffixed with exactly `", you already have this skill"` (have) or
//         `", gap — you do not have this skill yet"` (gap), appended after the existing
//         rank/name/(score or demand-only-flag) text — for the demand-only row this suffix comes
//         AFTER the existing "Demand only, scarcity unknown" text, so both flags coexist.
describe('<ArbitrageLadder /> have/gap rendering (haveSkillKeys prop)', () => {
  it('marks matching ladder items data-have="true" and non-matching ones data-have="false"', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    for (const skill of HAVE_SKILLS) {
      const item = screen.getByRole('button', { name: new RegExp(`${skill},`) })
      expect(item).toHaveAttribute('data-have', 'true')
    }
    for (const skill of GAP_SKILLS) {
      const item = screen.getByRole('button', { name: new RegExp(`${skill},`) })
      expect(item).toHaveAttribute('data-have', 'false')
    }
  })

  it('renders a non-color "Have"/"Gap" glyph/label on every ladder item, including the demand-only row', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const items = screen.getAllByTestId('ladder-item')
    expect(items).toHaveLength(roleSkillProfileFixture.length)

    for (const skill of HAVE_SKILLS) {
      const item = screen.getByRole('button', { name: new RegExp(`${skill},`) })
      expect(within(item).getByTestId('have-flag')).toHaveTextContent('Have')
    }
    for (const skill of GAP_SKILLS) {
      const item = screen.getByRole('button', { name: new RegExp(`${skill},`) })
      expect(within(item).getByTestId('have-flag')).toHaveTextContent('Gap')
    }

    // gRPC (DEMAND_ONLY_SKILL) is in HAVE_SKILL_KEYS via its normalized skill_name_raw fallback.
    const demandOnlyItem = screen.getByText(/demand only/i).closest('[data-testid="ladder-item"]')!
    expect(demandOnlyItem).toHaveAttribute('data-have', 'true')
    expect(within(demandOnlyItem as HTMLElement).getByTestId('have-flag')).toHaveTextContent('Have')
    expect(demandOnlyItem.textContent).toContain(DEMAND_ONLY_SKILL)
  })

  it('suffixes the accessible name with explicit have/gap wording (not color-only)', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    for (const skill of HAVE_SKILLS) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`${skill},.*you already have this skill`),
        }),
      ).toBeInTheDocument()
    }
    for (const skill of GAP_SKILLS) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`${skill},.*you do not have this skill yet`),
        }),
      ).toBeInTheDocument()
    }
  })

  it('renders every item identically to the no-prop case when haveSkillKeys is omitted (backward compatible)', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    render(<ArbitrageLadder rows={roleSkillProfileFixture} />)

    for (const item of screen.getAllByTestId('ladder-item')) {
      expect(item).not.toHaveAttribute('data-have')
      expect(within(item).queryByTestId('have-flag')).not.toBeInTheDocument()
    }
  })

  it('has zero axe violations on the fully mounted ladder with have/gap state populated', async () => {
    const ArbitrageLadder = await loadArbitrageLadder()
    const { container } = render(
      <ArbitrageLadder rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
