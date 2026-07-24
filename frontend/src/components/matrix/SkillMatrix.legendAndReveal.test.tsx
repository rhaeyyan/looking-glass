// Spec 010 (specs/010-scatter-legend-touch-motion.md) — RED phase tests for the three additions
// to <SkillMatrix>: a static text-only legend, a tap-accessible reveal toggle on each scatter
// point, and (verified separately, in matrix.legend-and-reveal.css.test.ts, since it is a pure CSS
// concern) a settle-in transition on role change.
//
// Component contract this task locks in (Redwood/Magnolia MUST honor):
//   - A NEW element `data-testid="matrix-legend"` inside the matrix section, rendered
//     unconditionally (even when `haveSkillKeys` is undefined — pre-resume-analysis state).
//       - It spells out the ✓ / ✕ glyph meaning in TEXT when `haveSkillKeys` is provided.
//       - It OMITS the glyph-key line entirely when `haveSkillKeys` is undefined (no stale/
//         inapplicable "have"/"gap" wording without any glyph actually rendered on the plot).
//       - It explains the color-tier ramp in text (the encoding), and must NOT restate any raw
//         fixture score number (that stays exclusively in the table).
//   - Every scatter point `<button>` gains:
//       - `aria-pressed` reflecting a per-point tap-revealed boolean, default `"false"`.
//       - `data-revealed="true"|"false"`, toggled on click — additive local UI state, not derived
//         from/written back to any score/gap data (Bounded-AI: presentation-only).
//       - Clicking toggles the state (on -> off -> on), is not a one-way reveal, and does not
//         require a second/different interaction to dismiss.
//       - No extra focusable element is introduced by the legend or the reveal mechanism — the
//         same buttons remain the only tab stops the scatter contributes.
//   - The whole mounted tree (legend + reveal state engaged) stays axe-clean.
//
// Variable specifier + @vite-ignore, same RED-phase-safe dynamic import pattern as
// SkillMatrix.test.tsx, so a missing/incomplete implementation fails per-test with a real
// assertion instead of aborting file collection.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import {
  roleSkillProfileFixture,
  SCORED_COUNT,
  HAVE_SKILL_KEYS,
} from '../../test/fixtures/roleSkillProfile.fixture'

const SKILL_MATRIX_MODULE = './SkillMatrix'
async function loadSkillMatrix() {
  const mod = await import(/* @vite-ignore */ SKILL_MATRIX_MODULE)
  return mod.SkillMatrix
}

afterEach(() => {
  vi.restoreAllMocks()
})

// Raw fixture numbers that must never leak into legend copy (the legend explains the ENCODING,
// never the DATA — those stay in the table/scatter labels).
const RAW_FIXTURE_NUMBERS = ['91', '34', '7.3', '88', '9.1', '12', '4.2']

describe('<SkillMatrix /> legend (spec 010)', () => {
  it('renders a static, always-visible legend near the plot', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const legend = screen.getByTestId('matrix-legend')
    expect(legend).toBeInTheDocument()
    // Text-only: it must be legible without any additional interaction (no hover/focus needed).
    expect(legend).toBeVisible()
  })

  it('spells out the check/cross glyph meaning in text when haveSkillKeys is provided', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const legend = screen.getByTestId('matrix-legend')
    expect(legend).toHaveTextContent('✓')
    expect(legend).toHaveTextContent('✕')
    expect(legend).toHaveTextContent(/already have|have this skill/i)
    expect(legend).toHaveTextContent(/worth learning|gap/i)
  })

  it('explains the color-tier ramp in text (the encoding, not the data)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const legend = screen.getByTestId('matrix-legend')
    // Some textual reference to "leverage" tiers / darker-is-higher framing — the SPEC requires
    // the encoding to be explained, not merely re-decorated with the same colors.
    expect(legend).toHaveTextContent(/leverage|tier|darker/i)
  })

  it('never restates a raw fixture score number inside the legend', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const legend = screen.getByTestId('matrix-legend')
    for (const raw of RAW_FIXTURE_NUMBERS) {
      expect(legend.textContent).not.toContain(raw)
    }
  })

  it('still renders the legend when haveSkillKeys is undefined, but omits the glyph-key line', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const legend = screen.getByTestId('matrix-legend')
    expect(legend).toBeInTheDocument()
    // No glyph is actually rendered on any point in this state, so the legend must not claim one.
    expect(within(legend).queryByText('✓')).not.toBeInTheDocument()
    expect(within(legend).queryByText('✕')).not.toBeInTheDocument()
    expect(legend).not.toHaveTextContent(/already have|have this skill/i)
  })

  it('adds zero new axe violations with the legend present', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const { container } = render(
      <SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('<SkillMatrix /> tap-accessible label reveal (spec 010)', () => {
  it('every scatter point starts with aria-pressed="false" and data-revealed="false"', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      expect(point).toHaveAttribute('aria-pressed', 'false')
      expect(point).toHaveAttribute('data-revealed', 'false')
    }
  })

  it('toggles aria-pressed and data-revealed on click (tap-equivalent), and toggles back off on a second click', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const point = screen.getByRole('button', { name: /^Kubernetes:/ })
    expect(point).toHaveAttribute('aria-pressed', 'false')

    await user.click(point)
    expect(point).toHaveAttribute('aria-pressed', 'true')
    expect(point).toHaveAttribute('data-revealed', 'true')

    // No second/different interaction should be required to dismiss it — a second click suffices.
    await user.click(point)
    expect(point).toHaveAttribute('aria-pressed', 'false')
    expect(point).toHaveAttribute('data-revealed', 'false')
  })

  it('reveal toggling is per-point (does not leak to other buttons)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const kubernetes = screen.getByRole('button', { name: /^Kubernetes:/ })
    const rust = screen.getByRole('button', { name: /^Rust:/ })

    await user.click(kubernetes)
    expect(kubernetes).toHaveAttribute('data-revealed', 'true')
    expect(rust).toHaveAttribute('data-revealed', 'false')
  })

  it('does not add any new focusable elements to the scatter (legend + reveal stay non-tabbable extras)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    expect(points).toHaveLength(SCORED_COUNT)

    const focused = new Set<Element>()
    for (let i = 0; i < points.length + 5; i++) {
      await user.tab()
      if (document.activeElement && document.activeElement !== document.body) {
        focused.add(document.activeElement)
      }
    }
    // Exactly the scatter points are tabbable within this component's subtree — nothing from the
    // new legend markup enters the tab order.
    for (const point of points) {
      expect(focused.has(point)).toBe(true)
    }
    const legend = screen.getByTestId('matrix-legend')
    expect(within(legend).queryAllByRole('button')).toHaveLength(0)
  })

  it('losing hover/focus does not clear a tap-revealed point (union of triggers, not a fight)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const point = screen.getByRole('button', { name: /^Kubernetes:/ })
    await user.click(point)
    expect(point).toHaveAttribute('data-revealed', 'true')

    // Move focus elsewhere (simulates losing :focus-visible / hover) — the tap-revealed state must
    // persist until an explicit second tap, per the SPEC's edge case.
    await user.tab()
    expect(point).toHaveAttribute('data-revealed', 'true')
  })

  it('adds zero new axe violations with a point tap-revealed', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    const { container } = render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const point = screen.getByRole('button', { name: /^Kubernetes:/ })
    await user.click(point)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('<SkillMatrix /> settle-in transition does not animate the initial mount (spec 010)', () => {
  it('does not mark the freshly mounted scatter as mid-transition on first paint', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    // The root must not carry a "just changed roles" signal on the very first render — whatever
    // attribute the implementation uses to gate the settle-in CSS, it must be absent/false-y on
    // initial mount so a freshly picked role's first paint never flies in. We assert the concrete,
    // implementation-agnostic observable: no inline transition/animation style is present on any
    // point (the CSS-only mechanism this SPEC prescribes never needs one), matching the existing
    // reduced-motion invariant already covered in SkillMatrix.test.tsx.
    for (const point of screen.getAllByTestId('scatter-point')) {
      const el = point as HTMLElement
      expect(el.style.transition).toBe('')
      expect(el.style.animation).toBe('')
    }
  })
})
