import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import type { RoleSkillRow } from '../../lib/supabaseClient'

// RED phase (spec 005 Task 5) — `<TopGapNarration>` does NOT exist yet. Dynamic import + a
// `/* @vite-ignore */` specifier keeps a missing module a per-test failure, not a collection
// abort — the exact convention already established in ArbitrageLadder.test.tsx (spec 003 Task 6 /
// spec 004 Task 5) for this same RED-phase situation. Do not switch to a static import: that would
// turn every test in this file into one undifferentiated "failed to resolve import" collection
// error instead of clean, individually-attributable RED failures.
//
// Component contract Magnolia MUST honor (see [COMPLIANCE-REPORT]):
//   - named export `TopGapNarration`, props:
//       `topGap: RoleSkillRow`
//       `runnerUpGap: RoleSkillRow | null`
//       `narrative: string`
//   - renders a `<section>` (implicit `role="region"`, via `aria-labelledby`/a heading) whose
//     ACCESSIBLE NAME references `topGap.skill_name_raw` (exact heading wording is Magnolia's
//     call; the skill name must appear in it).
//   - the section contains `narrative` as REAL (not `aria-hidden`), byte-identical DOM text — no
//     truncation, no re-wording, no re-derivation. Do not reformat/recompute/round narrative's
//     numbers; render the string exactly as received.
//   - `runnerUpGap: null` must render without throwing (solo-top-gap case).
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

// Deliberately "ugly" — an em dash, a colon, decimals, a percent sign — so a byte-identical
// assertion actually proves something beyond a friendly plain-English sentence.
const NARRATIVE =
  'Rust ranks above PostgreSQL on arbitrage score: 9.1 vs 4.2 — a 22.6% salary premium besides.'

describe('<TopGapNarration /> isolated component contract', () => {
  it('renders a labelled section whose accessible name references the top gap skill', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const runnerUpGap = makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 })

    render(<TopGapNarration topGap={topGap} runnerUpGap={runnerUpGap} narrative={NARRATIVE} />)

    expect(screen.getByRole('region', { name: /Rust/ })).toBeInTheDocument()
  })

  it('renders the narrative string as byte-identical, real (non aria-hidden) DOM text', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const runnerUpGap = makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 })

    render(<TopGapNarration topGap={topGap} runnerUpGap={runnerUpGap} narrative={NARRATIVE} />)

    // Exact match (no regex, no substring/partial-text fallback) — proves no truncation or
    // re-wording. getByText's default exact-match mode fails if the DOM text differs by even one
    // character.
    const textNode = screen.getByText(NARRATIVE)
    expect(textNode).toBeInTheDocument()

    // Real text, not aria-hidden: walk every ancestor and assert none hides it from AT.
    let node: HTMLElement | null = textNode
    while (node) {
      expect(node.getAttribute('aria-hidden')).not.toBe('true')
      node = node.parentElement
    }
  })

  it('does not append, prepend, or otherwise alter the narrative text', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const runnerUpGap = makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 })

    render(<TopGapNarration topGap={topGap} runnerUpGap={runnerUpGap} narrative={NARRATIVE} />)

    const textNode = screen.getByText(NARRATIVE)
    // The narrative-bearing element's own text content is exactly the narrative — not the
    // narrative plus extra decoration/prefix/suffix text baked into the same node.
    expect(textNode.textContent).toBe(NARRATIVE)
  })

  it('renders without throwing when runnerUpGap is null (solo top-gap case)', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const solo = 'Rust is your top gap to close, with an arbitrage score of 9.1.'

    expect(() =>
      render(<TopGapNarration topGap={topGap} runnerUpGap={null} narrative={solo} />),
    ).not.toThrow()
    expect(screen.getByText(solo)).toBeInTheDocument()
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
      const topGap = makeRow()
      const runnerUpGap = makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 })

      // Synchronous availability: no `findBy`/await-for-async-update needed — the section is
      // present the instant render() returns.
      render(<TopGapNarration topGap={topGap} runnerUpGap={runnerUpGap} narrative={NARRATIVE} />)
      expect(screen.getByRole('region', { name: /Rust/ })).toBeInTheDocument()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('has zero axe violations when a real top gap is narrated', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const runnerUpGap = makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 })

    const { container } = render(
      <TopGapNarration topGap={topGap} runnerUpGap={runnerUpGap} narrative={NARRATIVE} />,
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has zero axe violations in the solo top-gap (no runner-up) case', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const solo = 'Rust is your top gap to close, with an arbitrage score of 9.1.'

    const { container } = render(
      <TopGapNarration topGap={topGap} runnerUpGap={null} narrative={solo} />,
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('scopes the narrative text inside the labelled section (not floating outside it)', async () => {
    const TopGapNarration = await loadTopGapNarration()
    const topGap = makeRow()
    const runnerUpGap = makeRow({ skill_name_raw: 'PostgreSQL', skill_key: 'postgresql', arbitrage_score: 4.2 })

    render(<TopGapNarration topGap={topGap} runnerUpGap={runnerUpGap} narrative={NARRATIVE} />)

    const section = screen.getByRole('region', { name: /Rust/ })
    expect(within(section).getByText(NARRATIVE)).toBeInTheDocument()
  })
})
