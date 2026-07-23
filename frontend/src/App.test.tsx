import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import App from './App'
import type { RoleSkillRow } from './lib/supabaseClient'

// Characterization tests (SPIKE path): freeze the observed behavior of the walking-skeleton <App />.
// `./lib/supabaseClient` is mocked wholesale so no network/credentials load and `createClient`
// never runs. Only `fetchRoleSkillProfile` is exercised.
vi.mock('./lib/supabaseClient', () => ({
  fetchRoleSkillProfile: vi.fn(),
}))

// Task 5 (spec 004): the resume-paste flow's only LLM boundary is `extractResumeSkills` — mock it
// wholesale, exactly like `fetchRoleSkillProfile` above. `computeSkillGap` (frontend/src/lib/gap.ts)
// is NEVER mocked here: it is 100% deterministic, so these tests exercise the REAL function to
// prove the rendered have/gap state traces verbatim to its output, never to a raw LLM field
// rendered directly (the Bounded-AI boundary this SPEC exists to lock).
vi.mock('./lib/resumeSkills', () => ({
  extractResumeSkills: vi.fn(),
  ExtractionSchemaError: class ExtractionSchemaError extends Error {},
}))

import { fetchRoleSkillProfile } from './lib/supabaseClient'
import { extractResumeSkills } from './lib/resumeSkills'

const mockFetch = vi.mocked(fetchRoleSkillProfile)
const mockExtract = vi.mocked(extractResumeSkills)

function makeRow(overrides: Partial<RoleSkillRow> = {}): RoleSkillRow {
  return {
    role_family: 'Backend',
    skill_name_raw: 'PostgreSQL',
    skill_key: 'postgresql',
    pct_of_role: 42,
    postings_with_skill: 1200,
    demand_score: 88,
    scarcity_index: 12,
    arbitrage_score: 7.3,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 5.1,
    ...overrides,
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue([])
  mockExtract.mockReset()
})

// Explicit cleanup: the vitest config does not set `globals: true`, so Testing Library's
// automatic afterEach unmount is not auto-registered. Without this, successive renders pile up
// in document.body, duplicating the `role-picker` id and corrupting accessible-name lookups.
afterEach(cleanup)

describe('<App /> walking skeleton', () => {
  it('renders the role picker with an accessible name and all six roles plus a placeholder', () => {
    render(<App />)

    const select = screen.getByRole('combobox', { name: 'Target role' })
    expect(select).toBeInTheDocument()

    const options = within(select).getAllByRole('option')
    // Placeholder + six roles.
    expect(options).toHaveLength(7)
    expect(within(select).getByRole('option', { name: 'Select a role' })).toBeInTheDocument()
    for (const role of [
      'Backend',
      'Full Stack',
      'Data Scientist / ML',
      'Data Engineer',
      'Software Engineer',
      'DevOps / Cloud / SRE',
    ]) {
      expect(within(select).getByRole('option', { name: role })).toBeInTheDocument()
    }
  })

  it('calls fetchRoleSkillProfile with the exact selected role_family string', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Target role' }),
      'DevOps / Cloud / SRE',
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('DevOps / Cloud / SRE')
  })

  it('renders the fetched rows as an accessible table with a caption', async () => {
    mockFetch.mockResolvedValue([makeRow({ skill_name_raw: 'PostgreSQL' })])
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Target role' }),
      'Backend',
    )

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Skill profile for Backend')).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'PostgreSQL' })).toBeInTheDocument()
  })

  it('renders a null-skill_key row flagged as demand-only, never filtered out', async () => {
    mockFetch.mockResolvedValue([
      makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' }),
      makeRow({
        skill_name_raw: 'gRPC',
        skill_key: null,
        demand_score: null,
        scarcity_index: null,
        arbitrage_score: null,
        scarcity_data_completeness: null,
        d3_corroborated: null,
        d3_pct_of_all_postings: null,
      }),
    ])
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Target role' }),
      'Backend',
    )

    const table = await screen.findByRole('table')
    // Both rows present: the demand-only row survives.
    expect(within(table).getByRole('rowheader', { name: 'gRPC' })).toBeInTheDocument()
    // The null-skill_key row carries the demand-only flag text.
    expect(within(table).getByText('Demand only, scarcity unknown')).toBeInTheDocument()
    // Its unknown numeric fields render as an em dash, not dropped.
    const grpcRow = within(table).getByRole('rowheader', { name: 'gRPC' }).closest('tr')!
    expect(within(grpcRow).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders an empty-state message when a role resolves to zero skills', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Target role' }),
      'Backend',
    )

    expect(await screen.findByText('No skills found for this role.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('surfaces a fetch failure via role="alert" without crashing', async () => {
    mockFetch.mockRejectedValue(new Error('permission denied'))
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Target role' }),
      'Backend',
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load skill profile: permission denied')
  })

  it('has no axe violations in the initial idle state', async () => {
    const { container } = render(<App />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations once the accessible table (chart text alternative) is rendered', async () => {
    mockFetch.mockResolvedValue([
      makeRow({ skill_name_raw: 'PostgreSQL' }),
      makeRow({ skill_name_raw: 'gRPC', skill_key: null }),
    ])
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Target role' }),
      'Backend',
    )
    await screen.findByRole('table')

    expect(await axe(container)).toHaveNoViolations()
  })
})

// RED phase (Task 5 of specs/004) — `<App />` does not render a resume textarea/submit control
// yet. Task 6 (Magnolia) wires it up per this contract (see [COMPLIANCE-REPORT]):
//   - resume input:  a <textarea> with accessible name "Resume text" (e.g. a <label htmlFor=...>).
//   - submit control: a <button> (inside a <form>, so Enter-to-submit works) with accessible name
//                      "Find my gaps".
//   - on submit: `extractResumeSkills(<exact textarea value>)` is called, then the real
//                `computeSkillGap(<current role's rows>, <extractResumeSkills result>)` — never a
//                mocked/stubbed gap function — and its `haveSkillKeys` output is threaded into
//                SkillMatrix / ArbitrageLadder / SkillDataTable exactly as those components' own
//                test files specify.
//   - client-side validation (no `extractResumeSkills` call is made in either case):
//       - no role selected yet -> inline `role="alert"` reading exactly
//         "Select a target role before finding your gaps."
//       - empty/whitespace-only resume text -> inline `role="alert"` reading exactly
//         "Paste your resume text before finding your gaps."
//   - pending extraction -> `role="status"` reading exactly "Extracting skills from your resume…"
//   - extraction failure -> `role="alert"` reading exactly
//     "Could not extract skills from your resume: <error message>", app does not crash, and the
//     still-visible role profile (table/matrix/ladder) remains rendered underneath.
const RESUME_TEXTAREA_NAME = 'Resume text'
const SUBMIT_BUTTON_NAME = 'Find my gaps'
const ROLE_REQUIRED_MESSAGE = 'Select a target role before finding your gaps.'
const RESUME_REQUIRED_MESSAGE = 'Paste your resume text before finding your gaps.'
const LOADING_MESSAGE = 'Extracting skills from your resume…'

// Selects a role without assuming any particular fetched-row shape — callers that need the table
// present set `mockFetch`'s resolution themselves before calling this. Waits on the select's own
// value rather than a downstream table, so it works for both empty- and populated-row scenarios.
async function selectBackendRole(user: ReturnType<typeof userEvent.setup>) {
  const select = screen.getByRole('combobox', { name: 'Target role' })
  await user.selectOptions(select, 'Backend')
  await vi.waitFor(() => expect(select).toHaveValue('Backend'))
}

describe('<App /> resume input + have/gap', () => {
  it('renders a resume textarea and a submit button with the documented accessible names', () => {
    render(<App />)

    expect(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME })).toBeInTheDocument()
  })

  it('blocks submission client-side with role="alert" when no role is selected yet, and calls nothing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'I know PostgreSQL.')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(ROLE_REQUIRED_MESSAGE)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('blocks submission client-side with role="alert" when the resume text is empty or whitespace-only, and calls nothing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    // Empty textarea.
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    expect(await screen.findByRole('alert')).toHaveTextContent(RESUME_REQUIRED_MESSAGE)
    expect(mockExtract).not.toHaveBeenCalled()

    // Whitespace-only textarea.
    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), '   \n\t  ')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    expect(await screen.findByRole('alert')).toHaveTextContent(RESUME_REQUIRED_MESSAGE)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('calls extractResumeSkills with the exact textarea value on submit', async () => {
    mockExtract.mockResolvedValue(['PostgreSQL'])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    const resumeText = 'Built services with PostgreSQL and gRPC.'
    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), resumeText)
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    expect(mockExtract).toHaveBeenCalledTimes(1)
    expect(mockExtract).toHaveBeenCalledWith(resumeText)
  })

  it('shows a role="status" loading state while extraction is pending', async () => {
    let resolveExtract: (skills: string[]) => void = () => {}
    mockExtract.mockReturnValue(
      new Promise((resolve) => {
        resolveExtract = resolve
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'PostgreSQL')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(LOADING_MESSAGE)

    resolveExtract([])
  })

  it('surfaces an extraction failure via role="alert" without crashing, keeping the role profile visible', async () => {
    mockFetch.mockResolvedValue([makeRow({ skill_name_raw: 'PostgreSQL' })])
    mockExtract.mockRejectedValue(new Error('rate limited'))
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'PostgreSQL')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not extract skills from your resume: rate limited')
    // The app did not crash: the role profile table is still visible underneath.
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'PostgreSQL' })).toBeInTheDocument()
  })

  it('renders the deterministic have/gap partition from computeSkillGap, never a raw LLM field', async () => {
    mockFetch.mockResolvedValue([
      makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' }),
      makeRow({
        skill_name_raw: 'gRPC',
        skill_key: null,
        demand_score: null,
        scarcity_index: null,
        arbitrage_score: null,
        scarcity_data_completeness: null,
        d3_corroborated: null,
        d3_pct_of_all_postings: null,
      }),
    ])
    // extractResumeSkills only ever returns a flat skill-string list — computeSkillGap (the real,
    // unmocked function) is what actually derives the have/gap partition from it.
    mockExtract.mockResolvedValue(['PostgreSQL'])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'I know PostgreSQL.')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    // PostgreSQL (matched) renders as "have"; gRPC (not extracted) renders as "gap" — traced
    // verbatim through the real computeSkillGap, never a raw extraction field rendered directly.
    await screen.findByText(/you already have this skill/i)
    expect(screen.getByText(/you already have this skill/i)).toBeInTheDocument()
    expect(screen.getByText(/you do not have this skill yet/i)).toBeInTheDocument()
  })

  it('has no axe violations in the loading state', async () => {
    let resolveExtract: (skills: string[]) => void = () => {}
    mockExtract.mockReturnValue(
      new Promise((resolve) => {
        resolveExtract = resolve
      }),
    )
    const user = userEvent.setup()
    const { container } = render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'PostgreSQL')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByRole('status', { name: '' })

    expect(await axe(container)).toHaveNoViolations()
    resolveExtract([])
  })

  it('has no axe violations in the extraction-error state', async () => {
    mockExtract.mockRejectedValue(new Error('rate limited'))
    const user = userEvent.setup()
    const { container } = render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'PostgreSQL')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByRole('alert')

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in the populated have/gap state', async () => {
    mockFetch.mockResolvedValue([
      makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' }),
      makeRow({
        skill_name_raw: 'gRPC',
        skill_key: null,
        demand_score: null,
        scarcity_index: null,
        arbitrage_score: null,
        scarcity_data_completeness: null,
        d3_corroborated: null,
        d3_pct_of_all_postings: null,
      }),
    ])
    mockExtract.mockResolvedValue(['PostgreSQL'])
    const user = userEvent.setup()
    const { container } = render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'PostgreSQL')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByText(/you already have this skill/i)

    expect(await axe(container)).toHaveNoViolations()
  })
})
