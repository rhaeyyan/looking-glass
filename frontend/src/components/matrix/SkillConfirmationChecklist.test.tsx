// specs/038b-skill-confirmation-checklist-ui.md — audit-phase unit coverage for
// `<SkillConfirmationChecklist>`, added by Cypress alongside the spec-038b compliance audit.
//
// This component has NO dedicated unit test in the SPEC's own Files list (only
// `frontend/e2e/skill-confirmation.spec.ts` is named as the checklist's oracle), but the audit
// mandate ("check WCAG 2.2 AA ... Magnolia claims all of this; verify, don't just accept") is not
// satisfiable by the e2e suite alone — no e2e spec in this repo runs axe-core (the project's own
// convention keeps mechanical a11y scans in vitest + jest-axe; see SkillGroupBreakdown.test.tsx),
// and no existing App.test.tsx describe block ever axe-scans the checklist's own on-screen state
// (every axe scan there now runs AFTER the "Confirm skills" click added for spec 038b, i.e. once
// the checklist has already unmounted). This file closes that gap directly against the component,
// isolated from App.tsx's fetch/extraction plumbing.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { SkillConfirmationChecklist } from './SkillConfirmationChecklist'
import type { RoleSkillRow } from '../../lib/supabaseClient'

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
    ...overrides,
  }
}

const ROWS: RoleSkillRow[] = [
  row({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' }),
  row({ skill_name_raw: 'Rust', skill_key: 'rust' }),
  row({ skill_name_raw: 'gRPC', skill_key: null }), // demand-only row: skill_key falls back to normalizeSkillName
]

const AUTO_DETECTED_KEYS = new Set(['postgresql'])

// A non-literal string, deliberately: eslint-plugin-jsx-a11y's `aria-role` rule statically
// validates any JSX attribute literally named `role` against the ARIA role vocabulary regardless
// of the receiving element/component — this component's own `role` PROP is "the target role
// string" (e.g. "Backend"), unrelated to ARIA semantics. App.tsx's own real call site already
// sidesteps this false positive by passing a variable (`roleSlots[0]`), never an inline string
// literal; this test file follows the same established, lint-clean convention.
const TARGET_ROLE = 'Backend'

describe('<SkillConfirmationChecklist /> render + pre-checked state', () => {
  it('renders exactly one checkbox per row, each pre-checked per autoDetectedKeys (not guessed)', () => {
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const checklist = screen.getByTestId('skill-confirmation-checklist')
    const checkboxes = within(checklist).getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(ROWS.length)

    expect(within(checklist).getByRole('checkbox', { name: 'PostgreSQL' })).toBeChecked()
    expect(within(checklist).getByRole('checkbox', { name: 'Rust' })).not.toBeChecked()
    expect(within(checklist).getByRole('checkbox', { name: 'gRPC' })).not.toBeChecked()
  })

  it('every checkbox is a native input nested in its own label — accessible name is the raw skill name verbatim', () => {
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    for (const r of ROWS) {
      const checkbox = screen.getByRole('checkbox', { name: r.skill_name_raw }) as HTMLInputElement
      expect(checkbox.type).toBe('checkbox')
      expect(checkbox.closest('label')).not.toBeNull()
    }
  })

  it('renders "Back" and "Confirm skills" as real buttons', () => {
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm skills' })).toBeInTheDocument()
  })
})

describe('<SkillConfirmationChecklist /> edit + confirm/cancel behavior', () => {
  it('toggling a checkbox updates its own checked state without affecting others', async () => {
    const user = userEvent.setup()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const rust = screen.getByRole('checkbox', { name: 'Rust' })
    const postgres = screen.getByRole('checkbox', { name: 'PostgreSQL' })
    await user.click(rust)

    expect(rust).toBeChecked()
    expect(postgres).toBeChecked() // untouched — still reflects auto-detection

    await user.click(postgres)
    expect(postgres).not.toBeChecked()
  })

  it('"Confirm skills" hands onConfirm the LIVE edited set, not the original autoDetectedKeys', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    // Edit: uncheck the auto-detected skill, check an auto-missed one.
    await user.click(screen.getByRole('checkbox', { name: 'PostgreSQL' }))
    await user.click(screen.getByRole('checkbox', { name: 'Rust' }))
    await user.click(screen.getByRole('button', { name: 'Confirm skills' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const confirmedSet = onConfirm.mock.calls[0][0] as Set<string>
    expect(confirmedSet.has('postgresql')).toBe(false)
    expect(confirmedSet.has('rust')).toBe(true)
    // autoDetectedKeys itself must never be mutated by an edit — a fresh Set, not the same
    // reference/contents re-handed back.
    expect(AUTO_DETECTED_KEYS.has('postgresql')).toBe(true)
  })

  it('"Back" calls onCancel and never calls onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('re-syncs its edit buffer when handed a brand-new autoDetectedKeys draft (a resubmitted resume)', () => {
    const { rerender } = render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={new Set(['postgresql'])}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('checkbox', { name: 'PostgreSQL' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Rust' })).not.toBeChecked()

    rerender(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={new Set(['rust'])}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'PostgreSQL' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Rust' })).toBeChecked()
  })
})

describe('<SkillConfirmationChecklist /> non-color-only encoding (WCAG 1.4.1)', () => {
  it('checked state is carried by the native checkbox glyph/semantics, not solely by the row background tint', async () => {
    const user = userEvent.setup()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const rust = screen.getByRole('checkbox', { name: 'Rust' }) as HTMLInputElement
    expect(rust.checked).toBe(false)
    await user.click(rust)
    // The native `checked` DOM property (and therefore the rendered check glyph + `aria-checked`
    // exposed to assistive tech) is the load-bearing state — never merely an inline style/class.
    expect(rust.checked).toBe(true)
  })

  it('exposes a non-visual aria-live running total of checked skills, independent of color', () => {
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(`1 of ${ROWS.length} skills checked`)
  })
})

describe('<SkillConfirmationChecklist /> keyboard operability', () => {
  it('every checkbox and both buttons are tab-reachable', async () => {
    const user = userEvent.setup()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const expected = [
      ...screen.getAllByRole('checkbox'),
      screen.getByRole('button', { name: 'Back' }),
      screen.getByRole('button', { name: 'Confirm skills' }),
    ]

    const tabbable = new Set<Element>()
    for (let i = 0; i < expected.length + 2; i++) {
      await user.tab()
      if (document.activeElement && document.activeElement !== document.body) {
        tabbable.add(document.activeElement)
      }
    }

    for (const el of expected) {
      expect(tabbable.has(el)).toBe(true)
    }
  })

  it('a checkbox is toggleable via the keyboard (Space), same as a click', async () => {
    const user = userEvent.setup()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const rust = screen.getByRole('checkbox', { name: 'Rust' })
    rust.focus()
    await user.keyboard(' ')

    expect(rust).toBeChecked()
  })

  it('"Confirm skills" is activatable via the keyboard (Enter), same as a click', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    screen.getByRole('button', { name: 'Confirm skills' }).focus()
    await user.keyboard('{Enter}')

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does not trap focus — tabbing forward from the last control reaches an element after it', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <SkillConfirmationChecklist
          role={TARGET_ROLE}
          rows={ROWS}
          autoDetectedKeys={AUTO_DETECTED_KEYS}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
        <button>after-checklist-sentinel</button>
      </div>,
    )

    const sentinel = screen.getByRole('button', { name: 'after-checklist-sentinel' })
    const focused = new Set<Element>()
    for (let i = 0; i < 10 && !focused.has(sentinel); i++) {
      await user.tab()
      if (document.activeElement) focused.add(document.activeElement)
    }

    expect(focused.has(sentinel)).toBe(true)
  })
})

describe('<SkillConfirmationChecklist /> accessibility', () => {
  it('stays axe-clean in the initial pre-checked state', async () => {
    const { container } = render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('stays axe-clean after the user has toggled several checkboxes', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'PostgreSQL' }))
    await user.click(screen.getByRole('checkbox', { name: 'gRPC' }))

    expect(await axe(container)).toHaveNoViolations()
  })

  it('stays axe-clean with zero rows checked', async () => {
    const { container } = render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={new Set()}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})

// a11y fix (non-blocking finding from spec 038b's audit): mounting the checklist previously moved
// focus nowhere, so a keyboard/screen-reader user was never told "you're now looking at a new
// step". jsdom simulates DOM focus correctly (unlike layout), so this is a real, deterministic
// assertion — not the layout-dependent kind this project reserves for a real-Chromium e2e check.
describe('<SkillConfirmationChecklist /> focus management on mount', () => {
  it('moves focus to its own heading on mount, so a keyboard/screen-reader user is told a new step has started', () => {
    render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const heading = screen.getByRole('heading', { name: 'Confirm what you already know' })
    expect(heading).toHaveFocus()
    // Programmatically focusable (so `.focus()` can target it) but not a normal Tab stop — the
    // heading gets focus on mount, not by being permanently in the middle of the Tab sequence.
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('does not re-steal focus when autoDetectedKeys changes on an already-mounted instance (resubmitting while the checklist is still on screen)', () => {
    const { rerender } = render(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={AUTO_DETECTED_KEYS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const heading = screen.getByRole('heading', { name: 'Confirm what you already know' })
    expect(heading).toHaveFocus()

    // Move focus elsewhere (simulating the user having tabbed on to a checkbox), then re-render
    // with a NEW autoDetectedKeys set (the resubmit-while-showing case) WITHOUT unmounting.
    const rust = screen.getByRole('checkbox', { name: 'Rust' })
    rust.focus()
    expect(rust).toHaveFocus()

    rerender(
      <SkillConfirmationChecklist
        role={TARGET_ROLE}
        rows={ROWS}
        autoDetectedKeys={new Set(['rust'])}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    // The mount-only effect (empty deps) must not re-fire just because autoDetectedKeys changed —
    // focus stays wherever the user left it.
    expect(rust).toHaveFocus()
    expect(heading).not.toHaveFocus()
  })
})
