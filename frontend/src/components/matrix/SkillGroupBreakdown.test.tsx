// specs/027-skill-group-breakdown-ui.md — RED phase tests for the new <SkillGroupBreakdown />
// panel. The component (`./SkillGroupBreakdown`) does not exist yet — that is the point: every
// test below must fail because the module cannot be loaded / the contract does not exist, not
// because of a typo in this file. Uses the same RED-phase-safe dynamic-import pattern as
// `SkillMatrix.legendAndReveal.test.tsx` (variable specifier + @vite-ignore) so a missing or
// incomplete implementation fails per-test with a real assertion instead of aborting file
// collection outright.
//
// Component contract this task locks in (Magnolia MUST honor):
//   - Props: `{ rows: RoleSkillRow[]; haveSkillKeys?: Set<string>; onSelectGroup?: (group: string
//     | null) => void }`. Internally calls `computeSkillGroupBreakdown(rows, haveSkillKeys)`
//     exactly once — never re-sorts/re-derives the group order.
//   - Renders nothing (`container.firstChild === null` or equivalent) when `rows` is empty —
//     matches the same `hasRows` gating App.tsx already applies before SkillMatrix/SkillLeverageTable.
//   - A controlled `<input type="search">` filters the list by case-insensitive substring match on
//     `skill_group`.
//   - Zero matches -> a visible "No skill groups match" message (not a silently empty list).
//   - The literal "Uncategorized" group renders like any other group in the unfiltered list.
//   - `haveSkillKeys` undefined -> group entries show "not analyzed yet" wording (or omit the
//     have/gap line), never coerce null have/gap counts to "0".
//   - Each group entry is a native, tab-reachable toggle (button) operable via Enter/Space; when
//     clicked with `onSelectGroup` wired up, calls it with the group name, and re-clicking the
//     same (now-selected) entry calls it again with `null` (toggle-clears, not one-way).
//   - No focus trap; the whole mounted tree (list + filter engaged + a group selected) is axe-clean.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import type { RoleSkillRow } from '../../lib/supabaseClient'

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
const MIXED_ROWS: RoleSkillRow[] = [...CLOUD_ROWS, ...LANGUAGE_ROWS, ...UNCATEGORIZED_ROWS]

describe('<SkillGroupBreakdown /> gating', () => {
  it('renders nothing when rows is empty (same hasRows gating as SkillMatrix/SkillLeverageTable)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const { container } = render(<SkillGroupBreakdown rows={[]} />)

    expect(container.firstChild).toBeNull()
  })
})

describe('<SkillGroupBreakdown /> list contents', () => {
  it('renders the literal "Uncategorized" group like any other group in the unfiltered list', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} />)

    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
    expect(screen.getByText('Cloud')).toBeInTheDocument()
    expect(screen.getByText('Language')).toBeInTheDocument()
  })

  it('renders group entries in the exact order returned by computeSkillGroupBreakdown (no re-sort)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} />)

    // Cloud (avg 7) > Language (avg 7)... use distinct scores to make the expected order
    // unambiguous: Language (7) > Cloud (avg of 9,5 = 7)... avoid ties, assert against known order.
    const buttons = screen.getAllByRole('button', { name: /^(Cloud|Language|Uncategorized)/ })
    const labels = buttons.map((b) => b.textContent)
    // Whatever the exact order, it must be internally consistent with descending avg_arbitrage_score
    // computed by the already-tested data layer: Cloud avg=7, Language avg=7 (tie -> alpha: Cloud
    // then Language), Uncategorized avg=3 last.
    expect(labels.join('|')).toMatch(/Cloud.*Language.*Uncategorized/s)
  })
})

describe('<SkillGroupBreakdown /> filter text', () => {
  it('filters the list by case-insensitive substring match on skill_group', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} />)

    const filterInput = screen.getByRole('searchbox')
    await user.type(filterInput, 'cloud')

    expect(screen.getByText('Cloud')).toBeInTheDocument()
    expect(screen.queryByText('Language')).not.toBeInTheDocument()
    expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
  })

  it('shows a visible "No skill groups match" message when the filter matches zero groups (never a silent empty list)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} />)

    const filterInput = screen.getByRole('searchbox')
    await user.type(filterInput, 'zzzznomatch')

    expect(screen.getByText(/no skill groups match/i)).toBeInTheDocument()
  })
})

describe('<SkillGroupBreakdown /> have/gap "not analyzed yet" handling', () => {
  it('haveSkillKeys undefined -> renders "not analyzed yet" wording, never coerces null have/gap to 0', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={CLOUD_ROWS} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ })
    expect(within(cloudEntry).queryByText(/^0$/)).not.toBeInTheDocument()
    expect(cloudEntry.textContent).toMatch(/not analyzed yet/i)
  })

  it('haveSkillKeys provided -> renders numeric have/gap counts (0 is distinguishable from "not analyzed yet")', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    render(<SkillGroupBreakdown rows={CLOUD_ROWS} haveSkillKeys={new Set(['aws'])} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ })
    expect(cloudEntry.textContent).not.toMatch(/not analyzed yet/i)
  })
})

describe('<SkillGroupBreakdown /> group toggle selection (reversible, single-select)', () => {
  it('clicking a group entry calls onSelectGroup with that group name', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={onSelectGroup} />)

    await user.click(screen.getByRole('button', { name: /Cloud/ }))

    expect(onSelectGroup).toHaveBeenCalledWith('Cloud')
  })

  it('clicking the same (already-selected) group entry again calls onSelectGroup with null (clears, not one-way)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={onSelectGroup} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ })
    await user.click(cloudEntry)
    await user.click(cloudEntry)

    expect(onSelectGroup).toHaveBeenNthCalledWith(1, 'Cloud')
    expect(onSelectGroup).toHaveBeenNthCalledWith(2, null)
  })

  it('reflects the selected group visually/semantically (aria-pressed) on the active entry only', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={() => {}} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ })
    const languageEntry = screen.getByRole('button', { name: /Language/ })

    expect(cloudEntry).toHaveAttribute('aria-pressed', 'false')
    await user.click(cloudEntry)
    expect(cloudEntry).toHaveAttribute('aria-pressed', 'true')
    expect(languageEntry).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the selected entry with a visible non-color cue, not a color change alone (SPEC Constraints: no color-only encoding, mirrors SkillMatrix\'s own ✓/✕ glyph + aria-label-suffix idiom for the identical requirement)', async () => {
    // aria-pressed alone does not satisfy this: it is an ARIA *state*, announced to assistive
    // tech, but conveys nothing to a sighted user who cannot distinguish the border/background
    // color shift (e.g. color-vision-deficient users) — exactly the WCAG 1.4.1 "use of color"
    // failure mode CLAUDE.md's Accessibility section calls out for this codebase's data-viz
    // surfaces, and the SPEC's Constraints field explicitly extends that checklist to this panel
    // "in full". SkillMatrix already solved this for its own selection-adjacent state with a
    // visible ✓/✕ glyph and an aria-label suffix (SkillMatrix.test.tsx: "renders a non-color ✓/✕
    // glyph on every scored scatter point", "suffixes the accessible name with explicit have/gap
    // wording (not color-only)") — this panel needs the equivalent: some visible text/glyph/label
    // change on selection, not color (border/background) as the only differentiator.
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={() => {}} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ })
    const unselectedText = cloudEntry.textContent
    const unselectedName = cloudEntry.getAttribute('aria-label')

    await user.click(cloudEntry)

    const selectedText = cloudEntry.textContent
    const selectedName = cloudEntry.getAttribute('aria-label')
    const hasVisibleTextCue = selectedText !== unselectedText
    const hasAccessibleNameCue = selectedName !== unselectedName

    expect(
      hasVisibleTextCue || hasAccessibleNameCue,
      'Selecting a group must add a visible text/glyph cue (or an accessible-name suffix) — ' +
        'aria-pressed plus a color-only border/background shift is not sufficient non-color ' +
        'encoding for a sighted, color-vision-deficient user.',
    ).toBe(true)
  })

  it('a selected group whose member rows include arbitrage_score: null (demand-only) rows is still selectable', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    const rowsWithDemandOnly: RoleSkillRow[] = [
      row({ skill_name_raw: 'AWS', skill_key: 'aws', skill_group: 'Cloud', arbitrage_score: 9 }),
      row({ skill_name_raw: 'Serverless', skill_key: null, skill_group: 'Cloud', arbitrage_score: null }),
    ]
    render(<SkillGroupBreakdown rows={rowsWithDemandOnly} onSelectGroup={onSelectGroup} />)

    await user.click(screen.getByRole('button', { name: /Cloud/ }))

    expect(onSelectGroup).toHaveBeenCalledWith('Cloud')
  })
})

describe('<SkillGroupBreakdown /> keyboard operability', () => {
  it('the filter input and every group toggle are tab-reachable', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={() => {}} />)

    const filterInput = screen.getByRole('searchbox')
    const groupButtons = screen.getAllByRole('button', { name: /^(Cloud|Language|Uncategorized)/ })

    const tabbable = new Set<Element>()
    for (let i = 0; i < groupButtons.length + 3; i++) {
      await user.tab()
      if (document.activeElement && document.activeElement !== document.body) {
        tabbable.add(document.activeElement)
      }
    }

    expect(tabbable.has(filterInput)).toBe(true)
    for (const button of groupButtons) {
      expect(tabbable.has(button)).toBe(true)
    }
  })

  it('a group toggle is operable via the keyboard (Enter activates it, same as a click)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={onSelectGroup} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ })
    cloudEntry.focus()
    await user.keyboard('{Enter}')

    expect(onSelectGroup).toHaveBeenCalledWith('Cloud')
  })

  it('does not trap focus anywhere in the panel', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(
      <div>
        <SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={() => {}} />
        <button>after-panel-sentinel</button>
      </div>,
    )

    // Same Set-based membership idiom as
    // SkillMatrix.legendAndReveal.test.tsx's "does not add any new focusable elements" test:
    // record every element that ever receives focus while tabbing forward, rather than asserting
    // an exact tab-count/landing-position. A fixed "N tabs -> land here" formula is fragile
    // because it silently depends on how many focusable stops precede the sentinel (here: the
    // filter input + one button per skill group) *and* on focus-wraparound behavior once the end
    // of the document's tab order is reached (confirmed by tracing: tabbing far enough cycles
    // back through the panel's own controls rather than stopping outside them). What actually
    // proves "no trap" is that the sentinel is reachable at all while cycling forward — not which
    // absolute tab index reaches it.
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
  it('applies no inline transition/animation style to the selected entry (CSS-only mechanism, respects prefers-reduced-motion)', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    render(<SkillGroupBreakdown rows={MIXED_ROWS} onSelectGroup={() => {}} />)

    const cloudEntry = screen.getByRole('button', { name: /Cloud/ }) as HTMLElement
    await user.click(cloudEntry)

    expect(cloudEntry.style.transition).toBe('')
    expect(cloudEntry.style.animation).toBe('')
  })
})

describe('<SkillGroupBreakdown /> accessibility', () => {
  it('stays axe-clean with the list, filter, and a selection all engaged', async () => {
    const SkillGroupBreakdown = await loadSkillGroupBreakdown()
    const user = userEvent.setup()
    const { container } = render(
      <SkillGroupBreakdown rows={MIXED_ROWS} haveSkillKeys={new Set(['aws'])} onSelectGroup={() => {}} />,
    )

    await user.type(screen.getByRole('searchbox'), 'a')
    const remaining = screen.queryAllByRole('button', { name: /^(Cloud|Language|Uncategorized)/ })
    if (remaining.length > 0) {
      await user.click(remaining[0])
    }

    expect(await axe(container)).toHaveNoViolations()
  })
})
