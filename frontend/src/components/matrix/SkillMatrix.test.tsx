import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { contrastRatio, resolveToHex } from '../../styles/colorTokens.test'
import {
  roleSkillProfileFixture,
  SCORED_SKILLS,
  SCORED_COUNT,
  DEMAND_ONLY_SKILL,
  HAVE_SKILL_KEYS,
  GAP_SKILLS,
} from '../../test/fixtures/roleSkillProfile.fixture'

// RED phase (Task 6 of specs/003) — Magnolia's <SkillMatrix> does NOT exist yet. Each test
// dynamically imports it so a missing module fails THIS test with a real assertion/throw rather
// than aborting collection of the whole file. When Task 7 lands the component, these go green.
//
// Component contract Magnolia MUST honor (see [COMPLIANCE-REPORT]):
//   - named export `SkillMatrix`, prop `rows: RoleSkillRow[]`
//   - matrix root:            data-testid="skill-matrix"
//   - each plotted point:     data-testid="scatter-point", role="button" (or <button>),
//                             tabbable, accessible name including the skill_name_raw,
//                             a non-empty `data-shape` attribute (non-color encoding)
//   - reduced motion:         root carries data-reduced-motion="true" when
//                             (prefers-reduced-motion: reduce) matches; no inline animation/
//                             transition on points
//   - table alternative:      a real <table> with <caption> and <th scope="col">, one body row
//                             per fixture skill, exposing the raw numeric fields; the demand-only
//                             row present and flagged.
// Variable specifier + @vite-ignore so Vite does NOT statically pre-resolve the (not-yet-existing)
// module at transform time — that would abort file collection. Instead the import throws at RUNTIME
// inside each test, yielding a clean per-test RED failure until Task 7 creates the component.
const SKILL_MATRIX_MODULE = './SkillMatrix'
async function loadSkillMatrix() {
  const mod = await import(/* @vite-ignore */ SKILL_MATRIX_MODULE)
  return mod.SkillMatrix
}

const realMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
})

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('<SkillMatrix /> demand×scarcity scatter', () => {
  it('plots exactly one point per SCORED skill and excludes the null-score row', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    // Only the three rows with numeric (demand, scarcity) coordinates are plotted.
    expect(points).toHaveLength(SCORED_COUNT)

    for (const skill of SCORED_SKILLS) {
      expect(screen.getByRole('button', { name: new RegExp(skill) })).toBeInTheDocument()
    }
    // The demand-only row has no plotted coordinate and must NOT appear as a scatter point.
    expect(
      screen.queryByRole('button', { name: new RegExp(DEMAND_ONLY_SKILL) }),
    ).not.toBeInTheDocument()
  })

  it('encodes each point with position + an accessible name (not color-only)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    expect(points).toHaveLength(SCORED_COUNT)
    for (const point of points) {
      // Position (demand→x, scarcity→y) is the load-bearing, non-color channel; it survives
      // color-blindness / grayscale. Each point is placed via inline left/bottom.
      const el = point as HTMLElement
      expect(el.style.left).not.toBe('')
      expect(el.style.bottom).not.toBe('')
      // Every point is announceable — accessible name, never a bare glyph.
      expect(point).toHaveAccessibleName()
    }
  })

  it('makes every plotted point a real focusable, keyboard-operable element', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const user = userEvent.setup()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const points = screen.getAllByTestId('scatter-point')
    for (const point of points) {
      // Operable via Enter/Space requires a button role (native <button> or role="button").
      const isButtonLike =
        point.tagName === 'BUTTON' || point.getAttribute('role') === 'button'
      expect(isButtonLike).toBe(true)
    }

    // Reachable by keyboard alone: tabbing through the document lands on each point.
    const focused = new Set<Element>()
    for (let i = 0; i < points.length + 3; i++) {
      await user.tab()
      if (document.activeElement) focused.add(document.activeElement)
    }
    for (const point of points) {
      expect(focused.has(point)).toBe(true)
    }
  })

  it('does not embed its own table (the full-numbers alternative lives in the sibling <SkillLeverageTable>)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    // The full-numbers text alternative now lives in the shared <SkillLeverageTable> sibling
    // (tested in SkillLeverageTable.test.tsx) rather than being duplicated inside the scatter.
    //
    // NOTE (spec 032): this test used to also assert the presence of a "Prefer the numbers?
    // ... figures are in the ranked table below." pointer sentence here. Spec 032 deliberately
    // DROPS that sentence — once SkillMatrix and SkillLeverageTable become flush bands inside one
    // shared Evidence card (spec 033), the ranked table is visibly right there and the pointer
    // sentence is dead copy. That removal is asserted separately, below, in the spec 032 describe
    // block ("no longer renders the 'Prefer the numbers?' pointer sentence").
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('respects prefers-reduced-motion: no animation applied when reduce is set', async () => {
    mockReducedMotion(true)
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const root = screen.getByTestId('skill-matrix')
    expect(root).toHaveAttribute('data-reduced-motion', 'true')

    for (const point of screen.getAllByTestId('scatter-point')) {
      const el = point as HTMLElement
      expect(el.style.animation).toBe('')
      expect(el.style.transition).toBe('')
    }
  })

  it('has zero axe violations on the fully mounted matrix', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const { container } = render(<SkillMatrix rows={roleSkillProfileFixture} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

// RED phase (Task 5 of specs/004) — <SkillMatrix> does not accept `haveSkillKeys` yet. Task 6
// (Magnolia) threads it through the scatter points AND the wrapped <SkillDataTable>.
//
// Component contract Magnolia MUST honor (see [COMPLIANCE-REPORT]):
//   - additive optional prop `haveSkillKeys?: Set<string>` on SkillMatrix (and SkillDataTable,
//     which SkillMatrix renders internally and must forward the prop to).
//   - identifier scheme: a row's have/gap status is looked up via
//     `row.skill_key ?? normalizeSkillName(row.skill_name_raw)` against the Set — the SAME
//     identifier `computeSkillGap` (frontend/src/lib/gap.ts) produces.
//   - when `haveSkillKeys` is OMITTED (undefined): rendering is BYTE-IDENTICAL to today (no
//     `data-have` attribute, no glyph, no accessible-name suffix) — this is what keeps every test
//     above passing unmodified.
//   - when `haveSkillKeys` IS provided, each scatter point additionally carries:
//       - `data-have="true"` (skill key is in the set) or `data-have="false"` (not in the set) —
//         a non-color attribute differentiator, layered on top of the existing per-skill
//         `data-shape` encoding (never replacing it).
//       - a visible child element `data-testid="have-flag"` with text content exactly `"Have"` or
//         `"Gap"` — the "distinct glyph/label" the SPEC requires, present for BOTH states (not
//         "have" glyph vs. silent absence).
//       - an accessible name (aria-label) SUFFIXED with exactly
//         `", you already have this skill"` (have) or `", gap — you do not have this skill yet"`
//         (gap), appended after the existing demand/scarcity/market-share/arbitrage-score text.
//   - the wrapped <SkillDataTable> gets an explicit have/gap column: `<th scope="col">` text
//     `"Have or gap"`, with each `<td>` reading exactly `"Have"` or `"Gap"` (text, never
//     color-only) — see the mirrored contract note in ArbitrageLadder.test.tsx.
describe('<SkillMatrix /> have/gap rendering (haveSkillKeys prop)', () => {
  it('marks matching scatter points data-have="true" and non-matching ones data-have="false"', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    // Kubernetes (skill_key 'kubernetes') is in HAVE_SKILL_KEYS.
    const kubernetesPoint = screen.getByRole('button', { name: /^Kubernetes:/ })
    expect(kubernetesPoint).toHaveAttribute('data-have', 'true')

    // Rust and PostgreSQL are not in HAVE_SKILL_KEYS -> gap.
    for (const skill of GAP_SKILLS) {
      const point = screen.getByRole('button', { name: new RegExp(`^${skill}:`) })
      expect(point).toHaveAttribute('data-have', 'false')
    }
  })

  it('keeps the position + accessible-name channels alongside the new have/gap attribute (never color-only)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      const el = point as HTMLElement
      expect(el.style.left).not.toBe('')
      expect(el.style.bottom).not.toBe('')
      expect(point).toHaveAccessibleName()
      expect(point).toHaveAttribute('data-have')
    }
  })

  it('renders a non-color ✓/✕ glyph on every scored scatter point', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    // A symbol channel for the have/"worth learning" state — the readable wording lives in the
    // accessible name (asserted separately) and the table's Status column.
    const kubernetesPoint = screen.getByRole('button', { name: /^Kubernetes:/ })
    expect(within(kubernetesPoint).getByTestId('have-flag')).toHaveTextContent('✓')

    for (const skill of GAP_SKILLS) {
      const point = screen.getByRole('button', { name: new RegExp(`^${skill}:`) })
      expect(within(point).getByTestId('have-flag')).toHaveTextContent('✕')
    }
  })

  it('suffixes the accessible name with explicit have/gap wording (not color-only)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    expect(
      screen.getByRole('button', { name: /Kubernetes:.*you already have this skill/ }),
    ).toBeInTheDocument()

    for (const skill of GAP_SKILLS) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`^${skill}:.*worth learning — not on your resume yet`),
        }),
      ).toBeInTheDocument()
    }
  })

  it('renders every point identically to the no-prop case when haveSkillKeys is omitted (backward compatible)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      expect(point).not.toHaveAttribute('data-have')
      expect(within(point).queryByTestId('have-flag')).not.toBeInTheDocument()
    }
  })

  it('has zero axe violations on the fully mounted matrix with have/gap state populated', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const { container } = render(
      <SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------------------------
// Spec 021 — brushed-metal gradient-banded bubble fill + glass plot backdrop.
//
// RED until Magnolia (a) reshapes SkillMatrix.tsx's per-bubble `background` computation from a
// flat/`color-mix` value into a hard-stop `linear-gradient(...)`, built from the SAME tier
// selection (have -> --status-good, gap -> --status-critical, else leverage-tier accent), and
// (b) gives matrix.css's `.matrix-plot`/`.matrix-point` a token-based glass/metal treatment using
// `--plot`/`--grid`/`--metal-hi`, plus reuses spec 020's `--radius-card` (15px) on `.matrix-root`.
//
// Per the SPEC's Intellectual Control note, the flag badge / crowd-aware labels are ALREADY
// correct — these tests exist to prove the fill restyle does NOT regress them, not to add new
// features.
// ---------------------------------------------------------------------------------------------

/** Extracts every `NN%`/`NN.N%` numeric stop out of a CSS gradient string, in order. */
function extractPercentStops(css: string): number[] {
  return [...css.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]))
}

/** A "hard tonal break" gradient repeats at least one percentage value back-to-back (color A ends
 * at X%, color B begins at X%) — a smooth two-stop gradient (0%, 100%) never does this. */
function hasHardStop(stops: number[]): boolean {
  return stops.some((v, i) => stops.indexOf(v) !== i)
}

describe('<SkillMatrix /> spec 021 — brushed-metal gradient-banded bubble fill', () => {
  it('renders every scored bubble background as a CSS linear-gradient (not the old flat/color-mix value)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      const bg = (point as HTMLElement).style.background
      expect(bg).not.toBe('')
      expect(bg.trim().startsWith('linear-gradient(')).toBe(true)
    }
  })

  it('the gradient is hard-banded (a repeated percentage stop), not a soft two-stop gloss', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      const bg = (point as HTMLElement).style.background
      const stops = extractPercentStops(bg)
      expect(stops.length).toBeGreaterThanOrEqual(2)
      expect(hasHardStop(stops)).toBe(true)
    }
  })

  it('keeps the exact same have/gap tier-selection logic, only wrapped in the new gradient shape', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const kubernetesPoint = screen.getByRole('button', { name: /^Kubernetes:/ }) as HTMLElement
    expect(kubernetesPoint.style.background).toMatch(/var\(--status-good\)/)

    for (const skill of GAP_SKILLS) {
      const point = screen.getByRole('button', { name: new RegExp(`^${skill}:`) }) as HTMLElement
      expect(point.style.background).toMatch(/var\(--status-critical\)/)
    }
  })

  it('without haveSkillKeys, still selects the leverage-tier accent via the same threshold logic (Rust has the top arbitrage_score in the fixture -> top tier)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const rustPoint = screen.getByRole('button', { name: /^Rust:/ }) as HTMLElement
    expect(rustPoint.style.background).toMatch(/var\(--series-1\)/)
  })

  it('still renders a valid, non-degenerate gradient at the smallest 20px bubble floor (pct_of_role -> 0)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const tinyRows: RoleSkillRow[] = [
      {
        role_family: 'Backend',
        skill_name_raw: 'TinySkill',
        skill_key: 'tinyskill',
        pct_of_role: 0,
        postings_with_skill: 10,
        demand_score: 40,
        scarcity_index: 40,
        arbitrage_score: 2,
        scarcity_data_completeness: 'complete',
        d3_corroborated: false,
        d3_pct_of_all_postings: 0.5,
        salary_premium_pct: 3,
        median_days_open: 15,
      },
      {
        role_family: 'Backend',
        skill_name_raw: 'OtherSkill',
        skill_key: 'otherskill',
        pct_of_role: 60,
        postings_with_skill: 900,
        demand_score: 80,
        scarcity_index: 80,
        arbitrage_score: 8,
        scarcity_data_completeness: 'complete',
        d3_corroborated: true,
        d3_pct_of_all_postings: 4,
        salary_premium_pct: 12,
        median_days_open: 25,
      },
    ]
    render(<SkillMatrix rows={tinyRows} />)

    const tinyPoint = screen.getByRole('button', { name: /^TinySkill:/ }) as HTMLElement
    expect(tinyPoint.style.width).toBe('20px')
    expect(tinyPoint.style.height).toBe('20px')
    const bg = tinyPoint.style.background
    expect(bg).not.toBe('')
    expect(bg.trim().startsWith('linear-gradient(')).toBe(true)
  })

  it('leaves the non-color-only channels (glyph, aria-label suffix, position/size) fully intact alongside the new gradient fill', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />)

    const kubernetesPoint = screen.getByRole('button', { name: /^Kubernetes:/ }) as HTMLElement
    expect(within(kubernetesPoint).getByTestId('have-flag')).toHaveTextContent('✓')
    expect(kubernetesPoint).toHaveAccessibleName(/you already have this skill/)
    expect(kubernetesPoint.style.left).not.toBe('')
    expect(kubernetesPoint.style.bottom).not.toBe('')

    for (const skill of GAP_SKILLS) {
      const point = screen.getByRole('button', { name: new RegExp(`^${skill}:`) }) as HTMLElement
      expect(within(point).getByTestId('have-flag')).toHaveTextContent('✕')
      expect(point).toHaveAccessibleName(/worth learning — not on your resume yet/)
      expect(point.style.left).not.toBe('')
      expect(point.style.bottom).not.toBe('')
    }
  })

  it('leaves crowd-aware label visibility unchanged: nearby points stay hover/focus-revealed, a lone far point stays always-visible', async () => {
    const SkillMatrix = await loadSkillMatrix()
    // Two points placed close together in normalized plot space (crowded -> label hidden until
    // hover/focus/tap) and one far corner point (sparse -> label always visible). Values chosen so
    // the axis min/max span is wide, making the close pair's normalized distance well under the
    // component's CROWD_DIST threshold while the far point stays well outside it.
    const crowdRows: RoleSkillRow[] = [
      {
        role_family: 'Backend',
        skill_name_raw: 'AlphaSkill',
        skill_key: 'alphaskill',
        pct_of_role: 10,
        postings_with_skill: 100,
        demand_score: 10,
        scarcity_index: 10,
        arbitrage_score: 1,
        scarcity_data_completeness: 'complete',
        d3_corroborated: false,
        d3_pct_of_all_postings: 0.2,
        salary_premium_pct: 2,
        median_days_open: 10,
      },
      {
        role_family: 'Backend',
        skill_name_raw: 'BetaSkill',
        skill_key: 'betaskill',
        pct_of_role: 10,
        postings_with_skill: 500,
        demand_score: 90,
        scarcity_index: 90,
        arbitrage_score: 9,
        scarcity_data_completeness: 'complete',
        d3_corroborated: true,
        d3_pct_of_all_postings: 3,
        salary_premium_pct: 15,
        median_days_open: 20,
      },
      {
        role_family: 'Backend',
        skill_name_raw: 'GammaSkill',
        skill_key: 'gammaskill',
        pct_of_role: 10,
        postings_with_skill: 500,
        demand_score: 91,
        scarcity_index: 91,
        arbitrage_score: 9,
        scarcity_data_completeness: 'complete',
        d3_corroborated: true,
        d3_pct_of_all_postings: 3,
        salary_premium_pct: 15,
        median_days_open: 20,
      },
    ]
    render(<SkillMatrix rows={crowdRows} />)

    const alpha = screen.getByRole('button', { name: /^AlphaSkill:/ })
    const beta = screen.getByRole('button', { name: /^BetaSkill:/ })
    const gamma = screen.getByRole('button', { name: /^GammaSkill:/ })

    // Alpha sits alone in the low corner -> its label stays always-visible.
    expect(within(alpha).getByText('AlphaSkill')).toHaveClass('matrix-label-always')
    // Beta/Gamma sit within CROWD_DIST of each other -> their labels are hover/focus-only (never
    // carry the always-visible class).
    expect(within(beta).getByText('BetaSkill')).not.toHaveClass('matrix-label-always')
    expect(within(gamma).getByText('GammaSkill')).not.toHaveClass('matrix-label-always')
  })

  it('respects prefers-reduced-motion: still no inline animation/transition on the restyled bubbles', async () => {
    mockReducedMotion(true)
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    for (const point of screen.getAllByTestId('scatter-point')) {
      const el = point as HTMLElement
      expect(el.style.animation).toBe('')
      expect(el.style.transition).toBe('')
    }
  })

  it('has zero axe violations after the gradient-banding + glass backdrop restyle', async () => {
    const SkillMatrix = await loadSkillMatrix()
    const { container } = render(
      <SkillMatrix rows={roleSkillProfileFixture} haveSkillKeys={HAVE_SKILL_KEYS} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------------------------
// Spec 021 — matrix.css token-level assertions (CSS-text parsing, mirroring the established
// pattern in styles/glass-v2-tokens.test.ts / styles/colorTokens.test.ts, since there is no real
// CSSOM available in this Vitest/jsdom environment).
// ---------------------------------------------------------------------------------------------

const MATRIX_CSS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'matrix.css',
)
const LOOKING_GLASS_CSS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'styles',
  'looking-glass.css',
)
const matrixCssText = readFileSync(MATRIX_CSS_PATH, 'utf-8')
const lookingGlassCssText = readFileSync(LOOKING_GLASS_CSS_PATH, 'utf-8')

/** Finds the `{...}` body for every rule whose selector text contains `needle`, via brace-depth
 * counting from each match's opening brace (mirrors glass-v2-tokens.test.ts's local `block()`
 * helper, generalized to "all matches" rather than "first match", since `.matrix-root`/
 * `.matrix-plot`/`.matrix-point` each appear in more than one rule — light, dark-media, and
 * dark-explicit blocks). */
function allRuleBodiesContaining(css: string, needle: string): string[] {
  const bodies: string[] = []
  const re = new RegExp(`[^{}]*${needle}[^{]*\\{`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const openBrace = css.indexOf('{', m.index)
    let depth = 1
    let i = openBrace + 1
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    bodies.push(css.slice(openBrace + 1, i - 1))
  }
  return bodies
}

/** Parses top-level `--name: value;` custom-property declarations out of a rule body (mirrors
 * glass-v2-tokens.test.ts's local `customProps()` helper). */
function customProps(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /--([\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    out[m[1]] = m[2].trim()
  }
  return out
}

function block(css: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css)
  if (!match) {
    throw new Error(`Selector pattern not found in stylesheet: ${selectorPattern}`)
  }
  const braceInMatch = match[0].lastIndexOf('{')
  const openBrace =
    braceInMatch !== -1
      ? match.index + braceInMatch
      : css.indexOf('{', match.index + match[0].length)
  if (openBrace === -1 || css[openBrace] !== '{') {
    throw new Error(`Could not locate an opening brace for selector pattern: ${selectorPattern}`)
  }
  let depth = 1
  let i = openBrace + 1
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') depth--
    i++
  }
  return css.slice(openBrace + 1, i - 1)
}

/** Follows `var(--x)` hops until landing on a literal `#hex` or `rgba()/rgb()` value (mirrors
 * glass-v2-tokens.test.ts's `resolveToHex`, but stops at either literal shape instead of requiring
 * hex — several spec-018 tokens, e.g. `--plot`/`--have-soft`, are translucent rgba()). */
function chaseToLiteral(
  raw: string,
  tokens: Record<string, string>,
  maxHops = 6,
): { kind: 'hex' | 'rgba'; value: string } {
  let value = raw.trim()
  for (let hop = 0; hop < maxHops; hop++) {
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return { kind: 'hex', value }
    if (/^rgba?\(/.test(value)) return { kind: 'rgba', value }
    const varMatch = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)
    if (!varMatch) {
      throw new Error(`chaseToLiteral: stuck at "${value}" (from "${raw}")`)
    }
    const next = tokens[varMatch[1]]
    if (next === undefined) {
      throw new Error(`chaseToLiteral: "${raw}" references undefined token --${varMatch[1]}`)
    }
    value = next.trim()
  }
  throw new Error(`chaseToLiteral: "${raw}" did not resolve within ${maxHops} hops`)
}

function parseRgba(raw: string): [number, number, number, number] {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    raw.trim(),
  )
  if (!m) throw new Error(`parseRgba: expected an rgba()/rgb() literal, got: ${raw}`)
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
}

function hexToRgbLocal(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function compositeOverBackdrop(rgba: [number, number, number, number], backdropHex: string): string {
  const [r, g, b, a] = rgba
  const backdrop = hexToRgbLocal(backdropHex)
  const channel = (tint: number, i: number) => Math.round(tint * a + backdrop[i] * (1 - a))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(channel(r, 0))}${toHex(channel(g, 1))}${toHex(channel(b, 2))}`
}

const AA_NORMAL_TEXT = 4.5

describe('matrix.css spec 021 — token-based glass/metal plot + point treatment', () => {
  it('references --plot, --grid, and --metal-hi somewhere in the stylesheet (the three tokens the SPEC names for the bubble/plot restyle)', () => {
    expect(matrixCssText).toMatch(/var\(--plot\)/)
    expect(matrixCssText).toMatch(/var\(--grid\)/)
    expect(matrixCssText).toMatch(/var\(--metal-hi\)/)
  })

  it('.matrix-plot gains a --plot-based glass backdrop', () => {
    const bodies = allRuleBodiesContaining(matrixCssText, '\\.matrix-plot')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /var\(--plot\)/.test(b))).toBe(true)
  })

  it('.matrix-point (or a related pseudo-element scoped to it) picks up a --metal-hi or --grid based treatment', () => {
    const bodies = allRuleBodiesContaining(matrixCssText, '\\.matrix-point')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /var\(--metal-hi\)|var\(--grid\)/.test(b))).toBe(true)
  })

  it('.matrix-root reuses spec 020\'s --radius-card (15px) rather than a bespoke radius value', () => {
    const bodies = allRuleBodiesContaining(matrixCssText, '\\.matrix-root')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /border-radius\s*:\s*var\(--radius-card\)/.test(b))).toBe(true)
  })

  it('--radius-card itself is still exactly 15px in looking-glass.css (regression guard — this task only reuses it, never redefines it)', () => {
    const light = customProps(block(lookingGlassCssText, /^:root \{/m))
    expect(light['radius-card'].trim()).toBe('15px')
  })

  it('dark mode: the have/gap flag badge foreground still clears 4.5:1 against its own (now-composited-over---plot) surface color', () => {
    const lgDark = customProps(
      block(lookingGlassCssText, /:root:not\(\[data-theme='light'\]\) \{/),
    )
    const matrixDark = customProps(
      block(matrixCssText, /:not\(\[data-theme='light'\]\) \.matrix-root,/),
    )
    const merged: Record<string, string> = { ...lgDark, ...matrixDark }

    const pageHex = lgDark['page']
    expect(pageHex).toBeDefined()
    const plotLiteral = chaseToLiteral(merged['plot'], merged)
    const plotOverPage =
      plotLiteral.kind === 'rgba'
        ? compositeOverBackdrop(parseRgba(plotLiteral.value), pageHex)
        : plotLiteral.value

    for (const [fgToken, bgToken] of [
      ['status-good', 'status-good-surface'],
      ['status-critical', 'status-critical-surface'],
    ] as const) {
      const fgHex = resolveToHex(merged[fgToken], merged)
      const bgLiteral = chaseToLiteral(merged[bgToken], merged)
      const finalBg =
        bgLiteral.kind === 'rgba'
          ? compositeOverBackdrop(parseRgba(bgLiteral.value), plotOverPage)
          : bgLiteral.value
      expect(contrastRatio(fgHex, finalBg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Spec 032 — SkillMatrix drops its own card chrome (`card blueprint elev-md`) so it becomes a
// flush "band" inside a shared Evidence-card wrapper assembled later in spec 033, and drops the
// now-dead "Prefer the numbers? Every skill's figures are in the ranked table below." closing
// sentence (dead once the table is visibly in the same card). Bubble scaling, banding, legend,
// axis labels, and click-to-reveal are all UNCHANGED by this task — covered by the describe
// blocks above, which must keep passing unmodified.
// ---------------------------------------------------------------------------------------------
describe('<SkillMatrix /> spec 032 — evidence-band chrome trim', () => {
  it('does not carry its own card chrome classes on the root section (becomes a flush band inside the shared Evidence card)', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    const root = screen.getByTestId('skill-matrix')
    const classes = root.className.split(/\s+/)
    expect(classes).not.toContain('card')
    expect(classes).not.toContain('blueprint')
    expect(classes).not.toContain('elev-md')
  })

  it('no longer renders the "Prefer the numbers?" pointer sentence anywhere in the rendered output', async () => {
    const SkillMatrix = await loadSkillMatrix()
    render(<SkillMatrix rows={roleSkillProfileFixture} />)

    expect(screen.queryByText(/Prefer the numbers/i)).not.toBeInTheDocument()
  })
})
