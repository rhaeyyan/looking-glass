import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { RoleSkillRow } from './lib/supabaseClient'

// specs/034-local-persistence.md — RED phase. `App.tsx` has no mount-time hydration wiring yet
// (no `loadPersistedState()` call, no persist-on-change effect, no "Clear saved data" button), so
// every test below that depends on hydration is expected to fail: the pre-seeded values will NOT
// appear in the rendered controls, because nothing reads `localStorage` on mount today.
//
// `./lib/supabaseClient` and `./lib/resumeSkills` are mocked wholesale exactly as in App.test.tsx,
// so hydration's re-fetch/re-gap-compute can be observed deterministically without any real
// network or LLM-shaped call.
vi.mock('./lib/supabaseClient', () => ({
  fetchRoleSkillProfile: vi.fn(),
}))
vi.mock('./lib/resumeSkills', () => ({
  extractResumeSkills: vi.fn(),
}))

import { fetchRoleSkillProfile } from './lib/supabaseClient'
import { extractResumeSkills } from './lib/resumeSkills'

const mockFetch = vi.mocked(fetchRoleSkillProfile)
const mockExtract = vi.mocked(extractResumeSkills)

// specs/038b-skill-confirmation-checklist-ui.md bumped the schema to v2
// (`lookingglass:v2:state`), adding two REQUIRED fields (`confirmedSkillKeys`,
// `confirmedFingerprint`) — see `localPersistence.test.ts`'s "stale v1 blob discard" describe
// block for the exact contract this file's seeded blobs must now match (both keys present, even
// when `null`, or the whole blob is discarded).
const STORAGE_KEY = 'lookingglass:v2:state'

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

function seedStorage(value: unknown) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

beforeEach(() => {
  window.localStorage.clear()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue([])
  mockExtract.mockReset()
})

afterEach(cleanup)

describe('<App /> mount-time hydration from localStorage (spec 034)', () => {
  it('hydrates resumeText, selectedRole, and selectedSeniority into their controls on mount', async () => {
    mockFetch.mockResolvedValue([makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' })])
    mockExtract.mockReturnValue(['PostgreSQL'])

    seedStorage({
      resumeText: 'I know PostgreSQL.',
      selectedRole: 'Backend',
      selectedSeniority: 'mid',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    render(<App />)

    await vi.waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Target role' })).toHaveValue('Backend')
    })
    expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue('I know PostgreSQL.')
    expect(screen.getByLabelText('Experience level (optional)')).toHaveValue('mid')
  })

  it('re-fetches the restored role\'s profile via the same path handleRoleChange uses', async () => {
    mockFetch.mockResolvedValue([makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' })])
    mockExtract.mockReturnValue([])

    seedStorage({
      resumeText: '',
      selectedRole: 'Backend',
      selectedSeniority: '',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    render(<App />)

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('Backend')
    })
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('re-triggers the gap pipeline (haveSkillKeys/topGaps) once rows arrive, when resumeText was also restored', async () => {
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

    seedStorage({
      resumeText: 'I know PostgreSQL.',
      selectedRole: 'Backend',
      selectedSeniority: '',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    render(<App />)

    // Vocabulary comes from the re-fetched rows, exactly as handleResumeSubmit builds it.
    await vi.waitFor(() => {
      expect(mockExtract).toHaveBeenCalledWith('I know PostgreSQL.', ['PostgreSQL', 'gRPC'])
    })

    // spec 038b: this seeded blob's confirmedFingerprint is absent (never confirmed pre-038b), so
    // per the SPEC's rehydration rule ("fingerprint mismatch/absent → fall back to submitResume's
    // existing (now checklist-first) behavior") mount-time hydration correctly stages the
    // confirmation checklist rather than auto-computing the gap — confirm it, exactly as a real
    // user would, before the have/gap table this test asserts on exists.
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Confirm skills' }))

    const table = await screen.findByRole('table')
    const postgresRow = within(table).getByRole('rowheader', { name: 'PostgreSQL' }).closest('tr')!
    expect(within(postgresRow).getByText('Already have')).toBeInTheDocument()
    const grpcRow = within(table).getByRole('rowheader', { name: /^gRPC/ }).closest('tr')!
    expect(within(grpcRow).getByText('Worth learning')).toBeInTheDocument()
  })

  it('rehydrates resume text alone (no role) into the textarea; the role picker stays idle', async () => {
    seedStorage({
      resumeText: 'Some resume text with no role picked yet.',
      selectedRole: '',
      selectedSeniority: '',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    render(<App />)

    await vi.waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue(
        'Some resume text with no role picked yet.',
      )
    })
    expect(screen.getByRole('combobox', { name: 'Target role' })).toHaveValue('')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does nothing when localStorage has no persisted state (identical to today\'s clean-mount behavior)', () => {
    render(<App />)

    expect(screen.getByRole('combobox', { name: 'Target role' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue('')
    expect(screen.getByLabelText('Experience level (optional)')).toHaveValue('')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('<App /> hydration discards an invalid persisted blob back to idle (spec 034)', () => {
  it('an unknown selectedRole (not a member of ROLES) discards the whole blob — idle controls, no orphaned value, no fetch', async () => {
    seedStorage({
      resumeText: 'Some resume text',
      selectedRole: 'Astronaut',
      selectedSeniority: 'mid',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    render(<App />)

    // Give any (incorrect) hydration effect a tick to run before asserting it did nothing.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByRole('combobox', { name: 'Target role' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue('')
    expect(screen.getByLabelText('Experience level (optional)')).toHaveValue('')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('an invalid selectedSeniority discards the whole blob — never rendered into #seniority-picker as an orphaned value', async () => {
    seedStorage({
      resumeText: 'Some resume text',
      selectedRole: 'Backend',
      selectedSeniority: 'junior',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    render(<App />)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByRole('combobox', { name: 'Target role' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue('')
    expect(screen.getByLabelText('Experience level (optional)')).toHaveValue('')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
