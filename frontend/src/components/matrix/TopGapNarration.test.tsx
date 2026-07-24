import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import type { TopMove } from '../../lib/narrate'

// `<TopGapNarration>` is a pure display of `narrateTopGaps`'s already-computed result — no LLM,
// no scoring, no reformatting. Contract it MUST honor:
//   - named export `TopGapNarration`, prop `moves: TopMove[]`.
//   - renders a `<section>` (implicit `role="region"` via `aria-labelledby`) whose accessible name
//     references `moves[0].row.skill_name_raw`.
//   - does NOT render the redundant "X ranks above Y on leverage: A vs B" comparison sentence — the
//     ranked list already shows which skill is above which (the UI dropped it; `narrateTopGaps`
//     still returns the string, its provenance suite is unchanged).
//   - renders one ranked list item per move, each surfacing the skill name + its stat chips
//     verbatim; ranks 2+ also show their `note`, rank 1 does not (its rationale is the ranking).
//   - a single-move `moves` array renders without throwing.
//   - zero axe violations.
const TOP_GAP_NARRATION_MODULE = './TopGapNarration'
async function loadTopGapNarration() {
  const mod = await import(/* @vite-ignore */ TOP_GAP_NARRATION_MODULE)
  return mod.TopGapNarration
}

function makeRow(overrides: Partial<RoleSkillRow> = {}): RoleSkillRow {
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

// The comparison sentence the UI used to render, kept here only so a regression test can assert it
// is NOT shown (ask #3 — it just restated the visible ranking).
const OLD_COMPARISON = 'Rust ranks above PostgreSQL on leverage score: 9.1 vs 4.2.'

const THREE_MOVES: TopMove[] = [
  { rank: 1, row: makeRow(), note: '', stats: ['Leverage 9.1', 'Demand 63'] },
  {
    rank: 2,
    row: makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 }),
    note: 'Wanted in 18% of Backend postings, with a leverage score of 4.2.',
    stats: ['Leverage 4.2'],
  },
  {
    rank: 3,
    row: makeRow({ skill_name_raw: 'Kafka', skill_key: 'kafka', arbitrage_score: 3.1 }),
    note: 'Wanted in 18% of Backend postings, with a leverage score of 3.1.',
    stats: ['Leverage 3.1'],
  },
]

describe('<TopGapNarration /> isolated component contract', () => {
  it('renders a labelled section whose accessible name references the lead move skill', async () => {
    const TopGapNarration = await loadTopGapNarration()
    render(<TopGapNarration moves={THREE_MOVES} />)

    expect(screen.getByRole('region', { name: /Rust/ })).toBeInTheDocument()
  })

  it('does not render the redundant "ranks above … : A vs B" comparison sentence', async () => {
    const TopGapNarration = await loadTopGapNarration()
    render(<TopGapNarration moves={THREE_MOVES} />)

    expect(screen.queryByText(OLD_COMPARISON)).not.toBeInTheDocument()
    expect(screen.queryByText(/ranks above/i)).not.toBeInTheDocument()
  })

  it('renders one ranked list item per move with the skill name and its stat chips verbatim', async () => {
    const TopGapNarration = await loadTopGapNarration()
    render(<TopGapNarration moves={THREE_MOVES} />)

    const section = screen.getByRole('region', { name: /Rust/ })
    const items = within(section).getAllByRole('listitem')
    expect(items).toHaveLength(3)

    for (const move of THREE_MOVES) {
      const item = items[move.rank - 1]
      expect(within(item).getByText(move.row.skill_name_raw)).toBeInTheDocument()
      for (const stat of move.stats) {
        expect(within(item).getByText(stat)).toBeInTheDocument()
      }
    }
  })

  it('shows notes for ranks 2+ but not for rank 1 (its rationale is the headline)', async () => {
    const TopGapNarration = await loadTopGapNarration()
    render(<TopGapNarration moves={THREE_MOVES} />)

    const section = screen.getByRole('region', { name: /Rust/ })
    const items = within(section).getAllByRole('listitem')

    expect(within(items[0]).queryByText(/Wanted in/)).not.toBeInTheDocument()
    expect(within(items[1]).getByText(THREE_MOVES[1].note)).toBeInTheDocument()
    expect(within(items[2]).getByText(THREE_MOVES[2].note)).toBeInTheDocument()
  })

  it('renders without throwing when there is only a single move', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const solo: TopMove[] = [{ rank: 1, row: makeRow(), note: '', stats: ['Leverage 9.1'] }]

    expect(() =>
      render(<TopGapNarration moves={solo} />),
    ).not.toThrow()
    expect(screen.getByRole('region', { name: /Rust/ })).toBeInTheDocument()
  })

  it('makes no network/LLM call as part of rendering (pure display of already-computed props)', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = Object.assign(
      (...args: Parameters<typeof fetch>) => {
        throw new Error(`unexpected network call during TopGapNarration render: ${String(args[0])}`)
      },
      { preconnect: () => {} },
    ) as unknown as typeof fetch
    globalThis.fetch = fetchSpy

    try {
      const TopGapNarration = await loadTopGapNarration()
      render(<TopGapNarration moves={THREE_MOVES} />)
      expect(screen.getByRole('region', { name: /Rust/ })).toBeInTheDocument()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('has zero axe violations when the ranked moves are rendered', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const { container } = render(<TopGapNarration moves={THREE_MOVES} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
