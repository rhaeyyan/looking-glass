import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import App from './App'
import type { RoleSkillRow } from './lib/supabaseClient'
// Real (never mocked) deterministic functions — reused ONLY to compute each test's *expected*
// narration value the same way `handleResumeSubmit` must (spec 005 Task 6): `computeSkillGap`
// then `narrateTopGap` on its sorted `rows` output. This is what "byte-identical to narrateTopGap's
// return value" (the Bounded-AI boundary this SPEC locks) is checked against — never a hand-typed
// expected string that could drift from the real function's actual output.
import { computeSkillGap } from './lib/gap'
import { narrateTopGaps } from './lib/narrate'

// Characterization tests (SPIKE path): freeze the observed behavior of the walking-skeleton <App />.
// `./lib/supabaseClient` is mocked wholesale so no network/credentials load and `createClient`
// never runs. Only `fetchRoleSkillProfile` is exercised.
vi.mock('./lib/supabaseClient', () => ({
  fetchRoleSkillProfile: vi.fn(),
}))

// Task 4a (spec 006): `extractResumeSkills` is now a pure, synchronous, zero-I/O function
// (`(resumeText: string, vocabulary: string[]) => string[]`) — no LLM, no Promise, no schema
// error class. It is still mocked wholesale here (exactly like `fetchRoleSkillProfile` above) so
// these tests control its return value directly via `mockReturnValue`, never
// `mockResolvedValue`/`mockRejectedValue`. `computeSkillGap` (frontend/src/lib/gap.ts) is NEVER
// mocked here: it is 100% deterministic, so these tests exercise the REAL function to prove the
// rendered have/gap state traces verbatim to its output, never to a raw extracted field rendered
// directly (the Bounded-AI boundary this SPEC exists to lock).
vi.mock('./lib/resumeSkills', () => ({
  extractResumeSkills: vi.fn(),
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

// RED phase (Task 4a of specs/006) — `<App />` still calls the OLD, one-argument, `await`-ed
// `extractResumeSkills(resumeText)` (spec 004's LLM-shaped contract). Task 4b (Redwood) rewires
// it per this contract (see [COMPLIANCE-REPORT]):
//   - resume input:  a <textarea> with accessible name "Resume text" (e.g. a <label htmlFor=...>).
//   - submit control: a <button> (inside a <form>, so Enter-to-submit works) with accessible name
//                      "Find my gaps".
//   - on submit: `extractResumeSkills(<exact textarea value>, rows.map(r => r.skill_name_raw))`
//                is called SYNCHRONOUSLY (no `await`, no pending state, no throw path over
//                already-validated inputs — spec 006's extractor is pure and never throws), then
//                the real `computeSkillGap(<current role's rows>, <extractResumeSkills result>)`
//                — never a mocked/stubbed gap function — and its `haveSkillKeys` output is
//                threaded into SkillMatrix / ArbitrageLadder / SkillDataTable exactly as those
//                components' own test files specify.
//   - client-side validation (no `extractResumeSkills` call is made in either case):
//       - no role selected yet -> inline `role="alert"` reading exactly
//         "Select a target role before finding your gaps."
//       - empty/whitespace-only resume text -> inline `role="alert"` reading exactly
//         "Paste your resume text before finding your gaps."
//   - REMOVED (spec 006): the pending-extraction `role="status"` ("Extracting skills from your
//     resume…") and the extraction-failure `role="alert"` ("Could not extract skills from your
//     resume: …") no longer exist — a pure synchronous function has neither a pending window nor
//     a realistic throw path over already-validated inputs. These states are deleted from the
//     DOM entirely, not restyled; their tests are deleted below, not updated to new copy.
const RESUME_TEXTAREA_NAME = 'Resume text'
const SUBMIT_BUTTON_NAME = 'Find my gaps'
const ROLE_REQUIRED_MESSAGE = 'Select a target role before finding your gaps.'
const RESUME_REQUIRED_MESSAGE = 'Paste your resume text before finding your gaps.'

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

  it("calls extractResumeSkills with the exact textarea value and the current role's skill vocabulary on submit", async () => {
    const roleRows = [
      makeRow({ skill_name_raw: 'PostgreSQL' }),
      makeRow({ skill_name_raw: 'gRPC', skill_key: null }),
    ]
    mockFetch.mockResolvedValue(roleRows)
    mockExtract.mockReturnValue(['PostgreSQL'])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)
    // Wait for the role's rows to actually be in state before submitting, so the vocabulary
    // argument below reflects the loaded rows rather than a still-empty initial array.
    await screen.findByRole('table')

    const resumeText = 'Built services with PostgreSQL and gRPC.'
    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), resumeText)
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    expect(mockExtract).toHaveBeenCalledTimes(1)
    expect(mockExtract).toHaveBeenCalledWith(
      resumeText,
      roleRows.map((row) => row.skill_name_raw),
    )
  })

  // Note: no loading/error state tests exist here (spec 006, Task 4a) — extractResumeSkills is
  // now pure and synchronous, so `App.tsx`'s pending-extraction `role="status"` and
  // extraction-failure `role="alert"` regions are removed from the DOM entirely, not restyled.
  // Their absence is proven by App.tsx no longer containing that dead code once Task 4b lands,
  // not by a runtime test failure here (a deleted test can't "fail").

  it('renders the deterministic have/gap partition from computeSkillGap, never a raw extraction field', async () => {
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
    mockExtract.mockReturnValue(['PostgreSQL'])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'I know PostgreSQL.')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    // PostgreSQL (matched) renders as "have"; gRPC (not extracted) renders as "gap" — traced
    // verbatim through the real computeSkillGap, never a raw extraction field rendered directly.
    await screen.findByText(/you already have this skill/i)
    expect(screen.getByText(/you already have this skill/i)).toBeInTheDocument()
    expect(screen.getByText(/worth learning — not on your resume yet/i)).toBeInTheDocument()
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
    mockExtract.mockReturnValue(['PostgreSQL'])
    const user = userEvent.setup()
    const { container } = render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'PostgreSQL')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByText(/you already have this skill/i)

    expect(await axe(container)).toHaveNoViolations()
  })
})

// RED phase (Task 5 of specs/005-template-narrator.md) — `<App />` does not call `narrateTopGap`
// or render any narration region yet. Task 6 (Magnolia) wires it up per this contract (see
// [COMPLIANCE-REPORT]):
//   - at the same point `handleResumeSubmit` computes `haveSkillKeys` (no new async trigger,
//     no second `extractResumeSkills` call), also compute `narrateTopGap(<sorted rows from
//     computeSkillGap>, haveSkillKeys)` and render its result via `<TopGapNarration>`.
//   - a real top gap  -> a labelled `<section>` (accessible name referencing the top gap's
//                        skill_name_raw) containing `narrateTopGap(...)`'s `narrative` string as
//                        real, byte-identical DOM text.
//   - `narrateTopGap` -> null (every role skill already "have") -> a DISTINCT, positive
//                        `role="status"` message reading exactly:
//                        "No gaps — you already have every skill this role needs." — never a
//                        blank region, never the stale previous role's narration.
//   - `haveSkillKeys === undefined` (no resume submitted yet, or role just changed) -> no
//     narration region of either kind renders at all.
//   - switching roles or re-submitting a new resume REPLACES (never appends/stacks) the
//     narration region.
const NO_GAPS_MESSAGE = 'No gaps — you already have every skill this role needs.'

function makeGapRow(overrides: Partial<RoleSkillRow> = {}): RoleSkillRow {
  return {
    role_family: 'Backend',
    skill_name_raw: 'Rust',
    skill_key: 'rust',
    pct_of_role: 18,
    postings_with_skill: 420,
    demand_score: 63,
    scarcity_index: 88,
    arbitrage_score: 9.1,
    scarcity_data_completeness: 'complete',
    d3_corroborated: false,
    d3_pct_of_all_postings: 1.4,
    salary_premium_pct: 22.6,
    median_days_open: 45,
    ...overrides,
  }
}

// Backend fixture: Rust (highest arbitrage_score) ranks above PostgreSQL.
const BACKEND_ROWS: RoleSkillRow[] = [
  makeGapRow({ skill_name_raw: 'Rust', skill_key: 'rust', arbitrage_score: 9.1 }),
  makeGapRow({
    skill_name_raw: 'PostgreSQL',
    skill_key: 'postgresql',
    arbitrage_score: 4.2,
    demand_score: 88,
    scarcity_index: 12,
    salary_premium_pct: 14.5,
    median_days_open: 21,
  }),
]

// Full Stack fixture: a disjoint skill set so switching roles produces a genuinely different top
// gap, never a stale carryover from BACKEND_ROWS.
const FULL_STACK_ROWS: RoleSkillRow[] = [
  makeGapRow({
    skill_name_raw: 'GraphQL',
    skill_key: 'graphql',
    arbitrage_score: 6.5,
    demand_score: 55,
    scarcity_index: 30,
    salary_premium_pct: 28.4,
    median_days_open: 10,
  }),
]

/** Computes the exact narration `<App>` must produce for `rows`/`resumeSkills`, via the real
 * (never mocked) `computeSkillGap` + `narrateTopGap` — the Bounded-AI byte-identity check below is
 * only meaningful if the expected value comes from the same functions, not a hand-typed string. */
function expectedNarration(rows: RoleSkillRow[], resumeSkills: string[]) {
  const gap = computeSkillGap(rows, resumeSkills)
  return narrateTopGaps(gap.rows, gap.haveSkillKeys)
}

describe('<App /> top-gap narration (spec 005)', () => {
  it('renders no narration region at all before any resume has been submitted', async () => {
    mockFetch.mockResolvedValue(BACKEND_ROWS)
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)
    await screen.findByRole('table')

    expect(screen.queryByRole('region', { name: /Rust/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '' })).not.toBeInTheDocument()
    expect(screen.queryByText(NO_GAPS_MESSAGE)).not.toBeInTheDocument()
  })

  it('renders the top-gap narration in a labelled section with byte-identical narrative text', async () => {
    mockFetch.mockResolvedValue(BACKEND_ROWS)
    mockExtract.mockReturnValue([])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'no relevant skills')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    const expected = expectedNarration(BACKEND_ROWS, [])
    expect(expected).not.toBeNull()
    expect(expected!.moves[0].row.skill_name_raw).toBe('Rust')

    const section = await screen.findByRole('region', { name: /Rust/i })
    expect(within(section).getByText(expected!.headline)).toBeInTheDocument()

    // Real (not aria-hidden) text.
    const textNode = within(section).getByText(expected!.headline)
    let node: HTMLElement | null = textNode
    while (node) {
      expect(node.getAttribute('aria-hidden')).not.toBe('true')
      node = node.parentElement
    }

    // Synchronous piggyback on the same submit — no second extraction call triggered by
    // rendering the narration region.
    expect(mockExtract).toHaveBeenCalledTimes(1)
  })

  it('renders a distinct, positive role="status" message (never a blank or stale region) when narrateTopGap returns null', async () => {
    mockFetch.mockResolvedValue(BACKEND_ROWS)
    mockExtract.mockReturnValue(['Rust', 'PostgreSQL'])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'Rust and PostgreSQL expert')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    const expected = expectedNarration(BACKEND_ROWS, ['Rust', 'PostgreSQL'])
    expect(expected).toBeNull()

    // Query by role="status" directly (not just matching text) — the "distinct, positive
    // role=status message" requirement is about the ARIA role, not merely the text existing
    // somewhere in the DOM.
    const status = await screen.findByRole('status', { name: '' })
    expect(status).toHaveTextContent(NO_GAPS_MESSAGE)
    expect(screen.queryByRole('region', { name: /Rust/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /PostgreSQL/i })).not.toBeInTheDocument()

    // Exactly one role="status" region exists (the "no gaps" message) — no stray extraction
    // loading status lingers, since spec 006's extractResumeSkills has no pending state at all.
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('replaces (never stacks) the narration when re-submitting a new resume under the same role', async () => {
    mockFetch.mockResolvedValue(BACKEND_ROWS)
    mockExtract.mockReturnValue([])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    const textarea = screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME })
    await user.type(textarea, 'no relevant skills')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByRole('region', { name: /Rust/i })

    // Re-submit: the resume now shows Rust, so PostgreSQL becomes the new top gap.
    mockExtract.mockReturnValue(['Rust'])
    await user.clear(textarea)
    await user.type(textarea, 'I know Rust now')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    const postgresSection = await screen.findByRole('region', { name: /PostgreSQL/i })
    expect(postgresSection).toBeInTheDocument()
    // The stale Rust-named narration must be gone, not left stacked alongside the new one.
    expect(screen.queryByRole('region', { name: /^Rust\b/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: /PostgreSQL/i })).toHaveLength(1)
  })

  it('replaces (never stacks) the narration when switching to a different role and resubmitting', async () => {
    mockFetch.mockResolvedValueOnce(BACKEND_ROWS)
    mockExtract.mockReturnValue([])
    const user = userEvent.setup()
    render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'no relevant skills')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByRole('region', { name: /Rust/i })

    // Switching roles resets haveSkillKeys -> narration must disappear immediately, before any
    // new submit happens.
    mockFetch.mockResolvedValueOnce(FULL_STACK_ROWS)
    const select = screen.getByRole('combobox', { name: 'Target role' })
    await user.selectOptions(select, 'Full Stack')
    await vi.waitFor(() => expect(select).toHaveValue('Full Stack'))

    expect(screen.queryByRole('region', { name: /Rust/i })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), ' still nothing relevant')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))

    const graphqlSection = await screen.findByRole('region', { name: /GraphQL/i })
    expect(graphqlSection).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Rust/i })).not.toBeInTheDocument()
  })

  it('has no axe violations with the narration region present in the "has a top gap" state', async () => {
    mockFetch.mockResolvedValue(BACKEND_ROWS)
    mockExtract.mockReturnValue([])
    const user = userEvent.setup()
    const { container } = render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'no relevant skills')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByRole('region', { name: /Rust/i })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations with the narration region present in the "no gaps" state', async () => {
    mockFetch.mockResolvedValue(BACKEND_ROWS)
    mockExtract.mockReturnValue(['Rust', 'PostgreSQL'])
    const user = userEvent.setup()
    const { container } = render(<App />)
    await selectBackendRole(user)

    await user.type(screen.getByRole('textbox', { name: RESUME_TEXTAREA_NAME }), 'Rust and PostgreSQL expert')
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }))
    await screen.findByText(NO_GAPS_MESSAGE)

    expect(await axe(container)).toHaveNoViolations()
  })
})
