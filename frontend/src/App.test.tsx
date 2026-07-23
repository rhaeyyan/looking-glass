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

import { fetchRoleSkillProfile } from './lib/supabaseClient'

const mockFetch = vi.mocked(fetchRoleSkillProfile)

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
