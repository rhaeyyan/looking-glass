// specs/031-skill-group-chip-row.md — RED-phase tests for the chip-row rewrite of
// <SkillGroupBreakdown />. The component currently on disk (./SkillGroupBreakdown) still renders
// the OLD contract (a vertical <ul> list + <input type="search"> filter + a local `selectedGroup`
// useState + a "✓ Selected" text badge) — spec 027's shape. This file asserts the NEW contract from
// spec 031 instead, so every test below is expected to fail against today's implementation: not
// because of a typo here, but because the chip row, the required `selectedGroup`/`onSelectGroup`
// props, and the fully-controlled selection model do not exist yet. Uses the same RED-phase-safe
// dynamic-import pattern as SkillMatrix.legendAndReveal.test.tsx / the prior round of this exact
// file (variable specifier + @vite-ignore) so an incomplete implementation fails per-test with a
// real assertion instead of aborting file collection outright.
//
// Component contract this task locks in (Redwood/Magnolia MUST honor):
//   - Props: `{ rows: RoleSkillRow[]; haveSkillKeys?: Set<string>; selectedGroup: string | null;
//     onSelectGroup: (group: string | null) => void }`. `selectedGroup`/`onSelectGroup` are now
//     REQUIRED — selection state lives in App.tsx alone, never inside this component.
//   - Renders nothing (`container.firstChild === null`) when `rows` is empty — unchanged from spec
//     027.
//   - A chip row: `All skills` first, then one chip per `computeSkillGroupBreakdown(rows,
//     haveSkillKeys)` entry, in that function's own already-sorted order (untouched/re-verified
//     here — this suite only asserts render order matches whatever the library already returns).
//   - Every chip is a real `<button>`, `aria-pressed` driven purely by the `selectedGroup` PROP —
//     never internal state. The single-source-of-truth test below is the landmine the SPEC names by
//     name: it fails on any implementation that still holds its own `useState`.
//   - `All skills` always calls `onSelectGroup(null)` on click — a reset, not a toggle. A group chip
//     toggles: selected -> click -> `onSelectGroup(null)`; unselected -> click -> `onSelectGroup(<its
//     own group>)`.
//   - Chip text: group name + `avg leverage N.NN` (existing `formatNum`) or `Not scored` when
//     `avg_arbitrage_score === null`.
//   - A non-color selected-state cue (e.g. an `aria-hidden="true"` glyph, or any visible text/DOM
//     change) beyond `aria-pressed` and any bg/border tint (WCAG 1.4.1 — no color-only encoding).
//   - The old `<input type="search">` filter and its `Filter skill groups` label are GONE.
//   - Reduced-motion (no inline transition/animation style) and axe-core conventions carried over
//     unchanged from the prior round of this file.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { computeSkillGroupBreakdown } from '../../lib/skillGroupBreakdown'
import { formatNum } from '../../lib/format'

const SKILL_GROUP_BREAKDOWN_MODULE = './SkillGroupBreakdown'
async function loadSkillGroupBreakdown() {
  const mod = await import(/* @vite-ignore */ SKILL_GROUP_BREAKDOWN_MODULE)
  return mod.SkillGroupBreakdown
}

afterEach(() => {
  vi.restoreAllMocks()
})

function row(overrides: Partial<RoleSkillRow> & Pick<RoleSkillRow, 'skill_name_raw' | 'skill_key'>): RoleSkillRow {
  return {
    role_family: 'Backend',
    pct_of_role: 10,
    postings_with_skill: 100,
    demand_score: null,
    scarcity_index: null,
    arbitrage_score: null,
    scarcity_data_completeness: null,
    d3_corroborated: null,
    d3_pct_of_all_postings: null,
    salary_premium_pct: null,
    median_days_open: null,
    skill_group: null,
    ...overrides,
  }
}

const CLOUD_ROWS: RoleSkillRow[] = [
  row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
  row({ skill_name_raw: 'GCP', skill_key: 'gcp', skill_group: 'Cloud', arbitrage_score: 5 }),
]
const LANGUAGE_ROWS: RoleSkillRow[] = [
  row({ skill_name_raw: 'Rust', skill_key: 'rust', skill_group: 'Language', arbitrage_score: 7 }),
]
const UNCATEGORIZED_ROWS: RoleSkillRow[] = [
  row({ skill_name_raw: 'Mystery Skill', skill_key: null, skill_group: null, arbitrage_score: 3 }),
]
// The one group with no scored member row at all -> avg_arbitrage_score === null -> "Not scored",
// and (per the library's own, untouched sort) sorts after every scored group.
const NOT_SCORED_ROWS: RoleSkillRow[] = [
  row({ skill_name_raw: 'Kubernetes', skill_key: 'kubernetes', skill_group: 'Ops', arbitrage_score: null }),
]
const MIXED_ROWS: RoleSkillRow[] = [...CLOUD_ROWS, ...LANGUAGE_ROWS, ...UNCATEGORIZED_ROWS, ...NOT_SCORED_ROWS]

describe('<SkillGroupBreakdown /> gating', () => {
  it('renders nothing when rows is empty (same hasRows gating as SkillMatrix/SkillLeverageTable)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const { container } = render(
      <SkillGroupBreakdown rows={[]} selectedGroup={null} onSelectGroup={() => {}} />,
    )

    expect(container.firstChild).toBeNull()
  })
})

describe('<SkillGroupBreakdown /> chip row rendering', () => {
  it('renders "All skills" first, then one chip per computeSkillGroupBreakdown entry in its existing sorted order', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />)

    // The already-tested library function's own order is the oracle for render order — this suite
    // never re-derives or re-verifies the sort itself.
    const expected = computeSkillGroupBreakdown(MIXED_ROWS)
    const buttons = screen.getAllByRole('button')
    const labels = buttons.map((b) => b.textContent ?? '')

    expect(labels[0]).toMatch(/All skills/)
    expect(buttons.length).toBe(expected.length + 1)
    expected.forEach((group, i) => {
      expect(labels[i + 1]).toContain(group.skill_group)
    })
  })

  it('each group chip shows "avg leverage N.NN" or "Not scored" exactly per avg_arbitrage_score', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />)

    const expected = computeSkillGroupBreakdown(MIXED_ROWS)
    for (const group of expected) {
      const chip = screen.getByRole('button', { name: new RegExp(`^${group.skill_group}`) })
      if (group.avg_arbitrage_score === null) {
        expect(chip.textContent).toMatch(/Not scored/)
      } else {
        expect(chip.textContent).toContain(`avg leverage ${formatNum(group.avg_arbitrage_score)}`)
      }
    }
  })

  it('the "Not scored" group (avg_arbitrage_score === null) sorts last, per the library\'s own (untouched) sort', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />)

    const expected = computeSkillGroupBreakdown(MIXED_ROWS)
    const lastExpected = expected[expected.length - 1]
    // Fixture sanity check, not a re-test of the sort algorithm itself.
    expect(lastExpected.avg_arbitrage_score).toBeNull()

    const buttons = screen.getAllByRole('button')
    const lastChip = buttons[buttons.length - 1]
    expect(lastChip.textContent).toContain(lastExpected.skill_group)
    expect(lastChip.textContent).toMatch(/Not scored/)
  })

  it('the old search input and its "Filter skill groups" label are gone', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />)

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Filter skill groups')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter skill groups')).not.toBeInTheDocument()
  })
})

describe('<SkillGroupBreakdown /> single source of truth for selection (the landmine)', () => {
  it('SPEC edge case: aria-pressed is driven purely by the selectedGroup prop, never internal state', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    const { rerender } = render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={onSelectGroup} />,
    )

    const cloudChip = screen.getByRole('button', { name: /^Cloud/ })
    expect(cloudChip).toHaveAttribute('aria-pressed', 'false')

    await user.click(cloudChip)

    // Half 1: the callback fires with the right value...
    expect(onSelectGroup).toHaveBeenCalledWith('Cloud')
    // ...but the chip's OWN rendered aria-pressed must NOT have flipped: no new `selectedGroup`
    // prop has arrived yet (this test double is standing in for App.tsx, which hasn't re-rendered
    // it). If this assertion fails — aria-pressed flips on click alone — the component still holds
    // internal selection state and is not actually controlled.
    expect(
      screen.getByRole('button', { name: /^Cloud/ }),
      'aria-pressed flipped after a click with no new selectedGroup prop supplied — the component ' +
        'still holds internal selection state instead of being fully controlled by the prop.',
    ).toHaveAttribute('aria-pressed', 'false')

    // Half 2: now simulate the parent (App.tsx) re-rendering with the new prop, WITHOUT any further
    // click at all — this only reflects "true" if selection is read purely from the prop.
    rerender(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={onSelectGroup} />,
    )

    expect(
      screen.getByRole('button', { name: /^Cloud/ }),
      'aria-pressed did not become "true" after re-rendering with selectedGroup="Cloud" and no ' +
        'click — the component is not reading selection from the prop.',
    ).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('<SkillGroupBreakdown /> click behavior', () => {
  it('"All skills" always calls onSelectGroup(null) — a reset, not a toggle', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={onSelectGroup} />,
    )

    await user.click(screen.getByRole('button', { name: /^All skills/ }))

    expect(onSelectGroup).toHaveBeenCalledWith(null)
  })

  it('"All skills" calls onSelectGroup(null) even when nothing is currently selected (idempotent reset, never toggles away from null)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={onSelectGroup} />,
    )

    await user.click(screen.getByRole('button', { name: /^All skills/ }))

    expect(onSelectGroup).toHaveBeenCalledWith(null)
  })

  it('clicking the already-selected group chip calls onSelectGroup(null) (toggle-clears)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={onSelectGroup} />,
    )

    await user.click(screen.getByRole('button', { name: /^Cloud/ }))

    expect(onSelectGroup).toHaveBeenCalledWith(null)
  })

  it('clicking a different, not-yet-selected group chip calls onSelectGroup with that group', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={onSelectGroup} />,
    )

    await user.click(screen.getByRole('button', { name: /^Language/ }))

    expect(onSelectGroup).toHaveBeenCalledWith('Language')
  })
})

describe('<SkillGroupBreakdown /> aria-pressed reflects the selectedGroup prop across chips', () => {
  it('"All skills" is aria-pressed="true" only when selectedGroup is null', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const { rerender } = render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />,
    )

    expect(screen.getByRole('button', { name: /^All skills/ })).toHaveAttribute('aria-pressed', 'true')

    rerender(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={() => {}} />)

    expect(screen.getByRole('button', { name: /^All skills/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('exactly one group chip is aria-pressed="true" at a time, matching selectedGroup', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Language" onSelectGroup={() => {}} />)

    expect(screen.getByRole('button', { name: /^Cloud/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^Language/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('<SkillGroupBreakdown /> non-color selected-state indicator (WCAG 1.4.1)', () => {
  it('marks the selected chip with a visible non-color cue, not aria-pressed/color alone', async () => {
    // aria-pressed alone is an ARIA *state*, announced to assistive tech, but conveys nothing to a
    // sighted user who cannot distinguish a border/background tint shift (e.g. color-vision-deficient
    // users) — exactly the WCAG 1.4.1 "use of color" failure mode CLAUDE.md's Accessibility section
    // calls out, and the SPEC's Constraints explicitly re-authorizes a deviation from the literal
    // mockup for this one reason. This asserts SOME real DOM/text change accompanies selection: a
    // dedicated `aria-hidden="true"` glyph element is the SPEC's suggested mechanism ("or similar"),
    // so this checks generically for either a text-content change or a new aria-hidden marker,
    // exactly like the precedent this file's header comment points to (SkillMatrix's ✓/✕ glyph).
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const { rerender } = render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />,
    )

    const unselectedChip = screen.getByRole('button', { name: /^Cloud/ })
    const unselectedText = unselectedChip.textContent
    const unselectedHiddenGlyphCount = unselectedChip.querySelectorAll('[aria-hidden="true"]').length

    rerender(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={() => {}} />)

    const selectedChip = screen.getByRole('button', { name: /^Cloud/ })
    const selectedText = selectedChip.textContent
    const selectedHiddenGlyphCount = selectedChip.querySelectorAll('[aria-hidden="true"]').length

    const hasVisibleTextCue = selectedText !== unselectedText
    const hasAriaHiddenGlyphCue = selectedHiddenGlyphCount > unselectedHiddenGlyphCount

    expect(
      hasVisibleTextCue || hasAriaHiddenGlyphCue,
      'Selecting a chip must add a visible text/glyph cue (e.g. an aria-hidden="true" marker) — ' +
        'aria-pressed plus a color-only border/background shift is not sufficient non-color ' +
        'encoding for a sighted, color-vision-deficient user (WCAG 1.4.1).',
    ).toBe(true)
  })
})

describe('<SkillGroupBreakdown /> keyboard operability', () => {
  it('every chip, including "All skills", is tab-reachable', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />)

    const allChips = screen.getAllByRole('button')

    const tabbable = new Set<Element>()
    for (let i = 0; i < allChips.length + 2; i++) {
      await user.tab()
      if (document.activeElement && document.activeElement !== document.body) {
        tabbable.add(document.activeElement)
      }
    }

    for (const chip of allChips) {
      expect(tabbable.has(chip)).toBe(true)
    }
  })

  it('a group chip is operable via the keyboard (Enter activates it, same as a click)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={onSelectGroup} />,
    )

    const cloudChip = screen.getByRole('button', { name: /^Cloud/ })
    cloudChip.focus()
    await user.keyboard('{Enter}')

    expect(onSelectGroup).toHaveBeenCalledWith('Cloud')
  })

  it('does not trap focus anywhere in the panel', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(
      <div>
        <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />
        <button>after-panel-sentinel</button>
      </div>,
    )

    // Same Set-based membership idiom as SkillMatrix.legendAndReveal.test.tsx's "does not add any
    // new focusable elements" test: record every element that ever receives focus while tabbing
    // forward, rather than asserting an exact tab-count/landing-position.
    const focused = new Set<Element>()
    const sentinel = screen.getByRole('button', { name: 'after-panel-sentinel' })
    for (let i = 0; i < 8 && !focused.has(sentinel); i++) {
      await user.tab()
      if (document.activeElement) focused.add(document.activeElement)
    }

    expect(focused.has(sentinel)).toBe(true)
  })
})

describe('<SkillGroupBreakdown /> reduced motion', () => {
  it('applies no inline transition/animation style to the selected chip (CSS-only mechanism, respects prefers-reduced-motion)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const { rerender } = render(
      <SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup={null} onSelectGroup={() => {}} />,
    )

    rerender(<SkillGroupBreakdown rows={MIXED_ROWS} selectedGroup="Cloud" onSelectGroup={() => {}} />)
    const cloudChip = screen.getByRole('button', { name: /^Cloud/ }) as HTMLElement

    expect(cloudChip.style.transition).toBe('')
    expect(cloudChip.style.animation).toBe('')
  })
})

describe('<SkillGroupBreakdown /> accessibility', () => {
  it('stays axe-clean with the chip row rendered and a selection engaged', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const { container } = render(
      <SkillGroupBreakdown
        rows={MIXED_ROWS}
        haveSkillKeys={new Set(['aws'])}
        selectedGroup={null}
        onSelectGroup={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^Cloud/ }))

    expect(await axe(container)).toHaveNoViolations()
  })
})
