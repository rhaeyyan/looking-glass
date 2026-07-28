// specs/030-filter-status-bar.md — RED phase tests for the new <FilterStatusBar /> component.
// The component (`./FilterStatusBar`) does not exist yet — that is the point: every test below
// must fail because the module cannot be loaded / the contract does not exist, not because of a
// typo in this file. Uses the same RED-phase-safe dynamic-import pattern as
// `SeniorityFraming.test.tsx` / `TopGapNarration.test.tsx` / `SkillGroupBreakdown.test.tsx`
// (variable specifier + @vite-ignore) so a missing or incomplete implementation fails per-test
// with a real assertion instead of aborting file collection outright.
//
// Component contract this task locks in (Magnolia MUST honor):
//   - Props: `{ selectedGroup: string | null; filteredCount: number; totalCount: number; onClear:
//     () => void }`. Purely presentational/controlled — no internal state, no computation.
//   - Filtered (`selectedGroup !== null`): renders
//     "✓ <selectedGroup> — the matrix and table below show <filteredCount> of <totalCount> skills",
//     plus a "✕ Clear filter" `<button>` that calls `onClear` when clicked.
//   - Unfiltered (`selectedGroup === null`): renders
//     "Showing all <totalCount> skills — select a group above to narrow the matrix and table",
//     and no clear button at all.
//   - `filteredCount === totalCount` while `selectedGroup !== null` is a valid state (a group
//     filter that happens to include every skill) and must still render the FILTERED copy, not
//     silently fall back to the unfiltered string — explicit SPEC edge case.
//   - Root element carries `role="status"` and `aria-live="polite"` (SPEC "Inputs/Outputs").
//   - The `✓`/`✕` glyphs are wrapped in `aria-hidden="true"` spans; the surrounding text carries
//     the real accessible/announced meaning (mirrors `.matrix-legend-chip`, `.lev-status-icon`,
//     `.breakdown-entry-selected-badge` idiom in matrix.css, and SkillGroupBreakdown's own "✓
//     Selected" pattern) — the raw glyph must never be the sole accessible content.
//   - Zero axe violations in both filtered and unfiltered states.
//
// Note on the SPEC's documented edge case that this file does NOT test: `totalCount === 0` is
// asserted by the SPEC to not occur in practice (the caller only renders this component once
// `hasRows` is true, i.e. `rows.length > 0`) — no defensive null-render branch is required inside
// the component, and this file intentionally does not pad coverage for a state that structurally
// cannot occur (see CLAUDE.md's flagged failure mode of testing/coding around impossible cases).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'

const FILTER_STATUS_BAR_MODULE = './FilterStatusBar'
async function loadFilterStatusBar() {
  const mod = await import(/* @vite-ignore */ FILTER_STATUS_BAR_MODULE)
  return mod.FilterStatusBar
}

describe('<FilterStatusBar /> filtered state', () => {
  it('renders the "✓ <group> — … show <filteredCount> of <totalCount> skills" copy', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={4}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    expect(
      screen.getByText(
        'Cloud — the matrix and table below show 4 of 12 skills',
        { exact: false },
      ),
    ).toBeInTheDocument()
  })

  it('renders a "✕ Clear filter" button that calls onClear when clicked', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    const user = userEvent.setup()
    let cleared = false
    const onClear = () => {
      cleared = true
    }

    render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={4}
        totalCount={12}
        onClear={onClear}
      />,
    )

    const clearButton = screen.getByRole('button', { name: /clear filter/i })
    await user.click(clearButton)

    expect(cleared).toBe(true)
  })
})

describe('<FilterStatusBar /> unfiltered state', () => {
  it('renders "Showing all <totalCount> skills — select a group above to narrow the matrix and table"', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    render(
      <FilterStatusBar
        selectedGroup={null}
        filteredCount={12}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    expect(
      screen.getByText(
        'Showing all 12 skills — select a group above to narrow the matrix and table',
        { exact: false },
      ),
    ).toBeInTheDocument()
  })

  it('renders no clear-filter button when there is no active filter', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    render(
      <FilterStatusBar
        selectedGroup={null}
        filteredCount={12}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument()
  })
})

describe('<FilterStatusBar /> live-region contract', () => {
  it('the root element carries role="status" and aria-live="polite"', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={4}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    const statusEl = screen.getByRole('status')
    expect(statusEl).toHaveAttribute('aria-live', 'polite')
  })
})

describe('<FilterStatusBar /> filteredCount === totalCount edge case', () => {
  it('still renders the FILTERED copy (not the unfiltered fallback) when a group filter happens to include every skill', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={12}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    expect(
      screen.getByText('Cloud — the matrix and table below show 12 of 12 skills', {
        exact: false,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/select a group above to narrow/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument()
  })
})

describe('<FilterStatusBar /> non-color-only glyph encoding', () => {
  it('wraps the ✓ glyph in an aria-hidden span, with the surrounding text carrying the announced meaning (filtered state)', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    const { container } = render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={4}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    const hiddenGlyphs = Array.from(container.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent?.includes('✓'),
    )
    expect(hiddenGlyphs.length).toBeGreaterThan(0)

    // The accessible/announced text must not be the bare glyph alone — the status region's
    // overall accessible name/content must carry the real sentence.
    const statusEl = screen.getByRole('status')
    expect(statusEl.textContent).not.toBe('✓')
    expect(statusEl.textContent).toMatch(/Cloud/)
    expect(statusEl.textContent).toMatch(/4 of 12 skills/)
  })

  it('wraps the ✕ glyph (Clear filter button) in an aria-hidden span, with the button carrying an accessible name beyond the glyph', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    const { container } = render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={4}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    const clearButton = screen.getByRole('button', { name: /clear filter/i })
    const hiddenGlyphInButton = Array.from(clearButton.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent?.includes('✕'),
    )
    expect(hiddenGlyphInButton.length).toBeGreaterThan(0)

    // querySelectorAll on the whole container too, in case markup differs slightly from
    // expectation (still must exist somewhere, aria-hidden, holding the glyph).
    const anyHiddenCross = Array.from(container.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent?.includes('✕'),
    )
    expect(anyHiddenCross.length).toBeGreaterThan(0)

    // The button's accessible name (computed by testing-library's getByRole "name" matching)
    // already proved above it resolves via /clear filter/i — i.e. real text, not the bare glyph.
    expect(clearButton.textContent).not.toBe('✕')
  })
})

describe('<FilterStatusBar /> accessibility', () => {
  it('stays axe-clean in the filtered state', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    const { container } = render(
      <FilterStatusBar
        selectedGroup="Cloud"
        filteredCount={4}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('stays axe-clean in the unfiltered state', async () => {
    const FilterStatusBar = await loadFilterStatusBar()
    const { container } = render(
      <FilterStatusBar
        selectedGroup={null}
        filteredCount={12}
        totalCount={12}
        onClear={() => {}}
      />,
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
