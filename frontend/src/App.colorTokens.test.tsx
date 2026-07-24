// Spec 008 — App.tsx must re-point the donut gradient and legend swatches at the new shared
// --have-tone / --learn-tone tokens instead of the old --color-accent / --gap-tone pair. These are
// black-box, rendered-DOM assertions (never source-text grepping App.tsx) exercising the exact
// same walking-skeleton flow App.test.tsx already characterizes: pick a role, paste a resume,
// submit, then read the resulting inline `style` off the real elements.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { RoleSkillRow } from './lib/supabaseClient'

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
  mockExtract.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// Drives the app to the analyzed scorecard state: one "have" skill (PostgreSQL), one "gap" skill
// (Kubernetes, scored so it lands in the gap bucket, not the unscored one).
async function analyzeWithOneHaveOneGap() {
  mockFetch.mockResolvedValue([
    makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql' }),
    makeRow({ skill_name_raw: 'Kubernetes', skill_key: 'kubernetes', arbitrage_score: 9.1 }),
  ])
  mockExtract.mockReturnValue(['PostgreSQL'])

  const user = userEvent.setup()
  render(<App />)
  await user.selectOptions(screen.getByLabelText(/target role/i), 'Backend')
  await user.type(screen.getByLabelText(/resume text/i), 'PostgreSQL expert')
  await user.click(screen.getByRole('button', { name: /find my gaps/i }))
}

// Since spec 007 merged the table/ladder, "Already have" / "Worth learning" / "Not scored yet"
// text also renders in the leverage table's `.lev-status` cells, not just the donut's legend — so
// a bare `screen.getByText(...)` is ambiguous (multi-element match). Scope to the legend container
// itself (`.lg-donut-legend`) to target only the swatch these tests care about.
function getLegend(): HTMLElement {
  return document.querySelector('.lg-donut-legend') as HTMLElement
}

describe('spec 008 — App.tsx consumes the shared have/learn tokens', () => {
  it("points the donut gradient's have and learn segments at --have-tone/--learn-tone, not the old --color-accent/--gap-tone pair", async () => {
    await analyzeWithOneHaveOneGap()

    const donut = document.querySelector('.lg-donut') as HTMLElement
    expect(donut).toBeTruthy()
    expect(donut.style.background).toContain('var(--have-tone)')
    expect(donut.style.background).toContain('var(--learn-tone)')
    expect(donut.style.background).not.toContain('var(--color-accent)')
    expect(donut.style.background).not.toContain('var(--gap-tone)')
    // The third, unscored segment has no have/learn semantic and is explicitly out of scope for
    // this unification — it must keep the neutral token untouched.
    expect(donut.style.background).toContain('var(--color-neutral-400)')
  })

  it('points the "Already have" legend swatch at --have-tone', async () => {
    await analyzeWithOneHaveOneGap()

    const row = within(getLegend()).getByText(/already have/i).closest('div') as HTMLElement
    const swatch = row.querySelector('.lg-swatch') as HTMLElement
    expect(swatch.style.background).toBe('var(--have-tone)')
  })

  it('points the "Worth learning" legend swatch at --learn-tone', async () => {
    await analyzeWithOneHaveOneGap()

    const row = within(getLegend()).getByText(/worth learning/i).closest('div') as HTMLElement
    const swatch = row.querySelector('.lg-swatch') as HTMLElement
    expect(swatch.style.background).toBe('var(--learn-tone)')
  })

  it('leaves the "Not scored yet" legend swatch on the neutral token (out of scope for this unification)', async () => {
    await analyzeWithOneHaveOneGap()

    const row = within(getLegend()).getByText(/not scored yet/i).closest('div') as HTMLElement
    const swatch = row.querySelector('.lg-swatch') as HTMLElement
    expect(swatch.style.background).toBe('var(--color-neutral-400)')
  })
})
