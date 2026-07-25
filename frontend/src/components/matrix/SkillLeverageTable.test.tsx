import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  roleSkillProfileFixture,
  LADDER_ORDER_DESC,
  DEMAND_ONLY_SKILL,
  HAVE_SKILL_KEYS,
  HAVE_SKILLS,
  GAP_SKILLS,
} from '../../test/fixtures/roleSkillProfile.fixture'
import { SkillLeverageTable } from './SkillLeverageTable'
import { contrastRatio, hexToRgb } from '../../styles/colorTokens.test'

// The merged "every skill, ranked by leverage" table replaces both the old standalone data table
// and the arbitrage ladder. Contract:
//   - an accessible <table> with a <caption>, `<th scope=col>` headers, one body row per fixture
//     skill (the demand-only row included, flagged, never dropped), row order descending by
//     arbitrage_score with the null-score row last.
//   - raw numeric fields render verbatim (Bounded-AI); the leverage bar is decorative.
//   - `haveSkillKeys` optional: omitted -> no Status column; provided -> a text Status column
//     (Already have / Worth learning), keyed by `skill_key ?? normalizeSkillName(skill_name_raw)`.
//   - zero axe violations.

function rowOrder(table: HTMLElement): string[] {
  const bodyRows = within(table).getAllByRole('row').slice(1) // drop the header row
  // The rowheader's own text content includes the demand-only flag as a child <span> — read only
  // the skill-name text node itself (the first child), not the flag appended after it.
  return bodyRows.map((r) => {
    const th = within(r).getByRole('rowheader')
    return th.firstChild?.textContent ?? ''
  })
}

describe('<SkillLeverageTable /> merged ranked table', () => {
  it('renders an accessible table with a caption and scoped column headers', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(table.querySelector('caption')).toBeTruthy()
    expect(within(table).getByText(/Skill profile for Backend/)).toBeInTheDocument()

    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.length).toBeGreaterThan(0)
    for (const th of columnHeaders) {
      expect(th).toHaveAttribute('scope', 'col')
    }
  })

  it('renders one row per skill, ordered by leverage descending with the demand-only row last', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(rowOrder(table)).toEqual([...LADDER_ORDER_DESC])
  })

  it('flags the demand-only (null arbitrage_score) row and never drops it', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })).toBeInTheDocument()
    expect(within(table).getByText(/demand only/i)).toBeInTheDocument()
    // Its unknown numeric fields render as an em dash, not blank/NaN.
    const grpcRow = within(table)
      .getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })
      .closest('tr')!
    expect(within(grpcRow).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('surfaces the raw numeric leverage scores verbatim', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    // Arbitrage/leverage scores are unique per row.
    expect(within(table).getByText('9.1')).toBeInTheDocument()
    expect(within(table).getByText('7.3')).toBeInTheDocument()
    expect(within(table).getByText('4.2')).toBeInTheDocument()
  })

  it('omits the Status column entirely when haveSkillKeys is not provided', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    expect(within(table).queryByText('Already have')).not.toBeInTheDocument()
    expect(within(table).queryByText('Worth learning')).not.toBeInTheDocument()
  })

  it('renders a text Status column (Already have / Worth learning) keyed to computeSkillGap identifiers', () => {
    render(
      <SkillLeverageTable
        rows={roleSkillProfileFixture}
        roleName="Backend"
        haveSkillKeys={HAVE_SKILL_KEYS}
      />,
    )

    const table = screen.getByRole('table')
    for (const skill of HAVE_SKILLS) {
      const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
      expect(within(row).getByText('Already have')).toBeInTheDocument()
    }
    for (const skill of GAP_SKILLS) {
      const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
      expect(within(row).getByText('Worth learning')).toBeInTheDocument()
    }
  })

  it('has zero axe violations (no prop)', async () => {
    const { container } = render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has zero axe violations with the Status column populated', async () => {
    const { container } = render(
      <SkillLeverageTable
        rows={roleSkillProfileFixture}
        roleName="Backend"
        haveSkillKeys={HAVE_SKILL_KEYS}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// Spec 014 — plain-language salary-premium phrasing + a persistently visible, aria-describedby
// linked footnote (no native `title` tooltip, no interactive popover; the footnote is always
// rendered in the DOM).
describe('<SkillLeverageTable /> salary premium phrase + footnote (spec 014)', () => {
  it('renders the plain-language salary-premium phrase instead of the bare ±X% in the cell', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    // Kubernetes: salary_premium_pct = 11.8 -> "11.8% above typical pay for this skill"
    expect(within(table).getByText('11.8% above typical pay for this skill')).toBeInTheDocument()
    // Rust: salary_premium_pct = 22.6 -> "22.6% above typical pay for this skill"
    expect(within(table).getByText('22.6% above typical pay for this skill')).toBeInTheDocument()
    // PostgreSQL: salary_premium_pct = 14.5 -> "14.5% above typical pay for this skill"
    expect(within(table).getByText('14.5% above typical pay for this skill')).toBeInTheDocument()

    // The bare "±X%" numeric-only rendering must be gone.
    expect(within(table).queryByText('11.8%')).not.toBeInTheDocument()
    expect(within(table).queryByText('22.6%')).not.toBeInTheDocument()
    expect(within(table).queryByText('14.5%')).not.toBeInTheDocument()
  })

  it('still renders an em dash for the demand-only row\'s null salary_premium_pct (no phrase)', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    const grpcRow = within(table)
      .getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })
      .closest('tr')!
    // Still at least one em dash on that row (multiple null fields already render '—').
    expect(within(grpcRow).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(grpcRow).queryByText(/typical pay/)).not.toBeInTheDocument()
  })

  it('gives the "Salary premium" column header a visible, aria-hidden marker glyph', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    // The header's accessible name (computed with aria-hidden content excluded) must still just
    // read "Salary premium" — the marker glyph must be aria-hidden, not part of the accessible name.
    expect(header).toHaveAccessibleName('Salary premium')
    // But a visible marker glyph must be present in the DOM, hidden from assistive tech.
    const hiddenMarker = header.querySelector('[aria-hidden="true"]')
    expect(hiddenMarker).toBeTruthy()
    expect(hiddenMarker?.textContent?.trim().length).toBeGreaterThan(0)
  })

  it('links the "Salary premium" header to a footnote via aria-describedby, and the referenced id exists exactly once in the DOM', () => {
    const { container } = render(
      <SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />,
    )

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    const describedBy = header.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()

    const referenced = container.querySelectorAll(`#${describedBy}`)
    expect(referenced.length).toBe(1)
    expect(referenced[0].tagName.toLowerCase()).toBe('p')
  })

  it('renders the footnote paragraph once (not per-row), near the ladder-hint paragraph, below the table', () => {
    const { container } = render(
      <SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />,
    )

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    const describedBy = header.getAttribute('aria-describedby')!
    const footnote = container.querySelector(`#${describedBy}`)!

    expect(footnote).toBeInTheDocument()
    // Exactly one footnote element in the whole document, regardless of row count.
    expect(container.querySelectorAll(`#${describedBy}`).length).toBe(1)

    // Honest copy: names the dataset's own "salary premium" metric and the comparison group as
    // "typical pay for that skill's job category" — must NOT invent an undocumented comparison
    // group like "postings without this skill".
    expect(footnote.textContent).toMatch(/salary premium/i)
    expect(footnote.textContent).toMatch(/typical pay/i)
    expect(footnote.textContent).not.toMatch(/postings without this skill/i)
  })

  it('does not use a native title attribute anywhere on the Salary premium header or cells (title tooltips are not WCAG-2.2-AA-sufficient)', () => {
    render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)

    const table = screen.getByRole('table')
    const header = within(table).getByRole('columnheader', { name: /Salary premium/ })
    expect(header).not.toHaveAttribute('title')

    const cells = within(table).getAllByText(/typical pay for this skill/)
    for (const cell of cells) {
      expect(cell.closest('td')).not.toHaveAttribute('title')
    }
  })

  it('has zero axe violations with the salary-premium footnote present (no dangling aria-describedby)', async () => {
    const { container } = render(
      <SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------------------------
// Spec 022 — Status column becomes a pill badge, the leverage progress-bar column is polished
// onto the token system, and the table card picks up the shared 15px --radius-card. This is a
// CSS-only restyle: SkillLeverageTable.tsx's markup, sort order, and widthPct/formatNum
// computations are UNCHANGED, so most of this section is behavioral (render-based) coverage that
// the already-correct logic keeps working, plus a small set of raw-stylesheet-text assertions for
// matrix.css (vitest.config's `test.css` is unset/false, so component-render tests never see
// applied CSS rules — this mirrors the brace-depth parsing convention already established by
// glass-v2-tokens.test.ts / scorecard-glass-restyle.test.ts / nav-sidebar-glass-restyle.test.ts).
//
// Token choice for the pill: matrix.css's OWN `--status-good`/`--status-good-surface`/
// `--status-critical`/`--status-critical-surface` aliases (which already resolve, through
// `--have-tone`/`--learn-tone`, to the shared `--have`/`--have-soft`/`--learn`/`--learn-soft`
// glass-v2 tokens) — not a fresh direct `--have`/`--learn` reference. Three independent pieces of
// evidence point at this being the correct target, not a guess:
//   1. `resolveToHex`'s own doc comment (colorTokens.test.ts) calls out matrix.css's
//      `--status-good: var(--have-tone)` chain BY NAME as its motivating multi-hop case.
//   2. matrix.css already has an identical, shipped precedent one section above `.lev-status`:
//      `.matrix-point[data-have='true'] .matrix-point-flag` colors itself with
//      `--status-good`/`--status-good-surface`, never `--have`/`--have-soft` directly.
//   3. glass-v2-tokens.test.ts's spec-018 "backward-compat aliases" suite has a still-green,
//      unmodified assertion that matrix.css must NEVER contain a literal `var(--have)` or
//      `var(--learn))` reference. Reusing `--status-good`/`--status-critical` (matrix.css's own,
//      differently-namespaced tokens) satisfies spec 022's "reuse --have/--have-soft and
//      --learn/--learn-soft ... no new unchecked color literal" constraint without regressing
//      that invariant or requiring any glass-v2-tokens.test.ts exception-list change.
describe('<SkillLeverageTable /> spec 022 — CSS-only pill/bar/radius restyle (matrix.css)', () => {
  const MATRIX_DIR = path.dirname(fileURLToPath(import.meta.url))
  const MATRIX_CSS_PATH = path.join(MATRIX_DIR, 'matrix.css')
  const matrixCss = readFileSync(MATRIX_CSS_PATH, 'utf-8')
  const LOOKING_GLASS_CSS_PATH = path.join(MATRIX_DIR, '..', '..', 'styles', 'looking-glass.css')
  const lookingGlassCss = readFileSync(LOOKING_GLASS_CSS_PATH, 'utf-8')

  const AA_NORMAL_TEXT = 4.5

  /** Finds the `{ ... }` block for a selector pattern via brace-depth counting (duplicated from
   * the sibling glass/token test files' own local copies of this generic parsing utility). */
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

  /** Parses top-level `--name: value;` custom-property declarations out of a rule body. */
  function customProps(body: string): Record<string, string> {
    const out: Record<string, string> = {}
    const re = /--([\w-]+)\s*:\s*([^;]+);/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) {
      out[m[1]] = m[2].trim()
    }
    return out
  }

  /** Follows a `var(--token)` reference chain (up to a small hop limit) in the supplied token map
   * until it lands on a non-`var()` literal — matrix.css's multi-hop alias pattern (e.g.
   * `--status-good-surface: var(--have-tone-surface)` -> `var(--have-soft)` -> an rgba() literal)
   * needs this before `parseRgba` can parse the final literal. */
  function resolveVarChain(raw: string, tokens: Record<string, string>, maxHops = 5): string {
    let value = raw.trim()
    for (let hop = 0; hop < maxHops; hop++) {
      const varMatch = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)
      if (!varMatch) return value
      const next = tokens[varMatch[1]]
      if (next === undefined) {
        throw new Error(`resolveVarChain: "${raw}" references undefined token --${varMatch[1]}`)
      }
      value = next.trim()
    }
    return value
  }

  /** Parses an `rgba(r, g, b, a)` (or `rgb(r, g, b)`) declaration into an `[r, g, b, a]` tuple. */
  function parseRgba(raw: string | undefined, tokenName: string): [number, number, number, number] {
    if (raw === undefined) {
      throw new Error(`Expected --${tokenName} to be a defined rgba()/rgb() literal — not found.`)
    }
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
      raw.trim(),
    )
    if (!m) {
      throw new Error(`--${tokenName}: expected an rgba()/rgb() literal, got: ${raw}`)
    }
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  }

  /** Alpha-composites a translucent rgba tuple over an opaque hex backdrop. */
  function compositeOverBackdrop(rgba: [number, number, number, number], backdropHex: string): string {
    const [r, g, b, a] = rgba
    const backdrop = hexToRgb(backdropHex)
    const channel = (tint: number, i: number) => Math.round(tint * a + backdrop[i] * (1 - a))
    const toHex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${toHex(channel(r, 0))}${toHex(channel(g, 1))}${toHex(channel(b, 2))}`
  }

  /** Strips every top-level `@media (...) { ... }` block out of a flat, non-nested stylesheet
   * (brace-depth aware), leaving only the top-level rules — matrix.css's `.lev-*` rules all live
   * outside any @media block, so this lets a simple non-recursive rule splitter find them without
   * getting confused by the (separately, deliberately unexamined here) theme @media blocks. */
  function stripMediaBlocks(css: string): string {
    let out = ''
    let i = 0
    while (i < css.length) {
      const nextMedia = css.indexOf('@media', i)
      if (nextMedia === -1) {
        out += css.slice(i)
        break
      }
      out += css.slice(i, nextMedia)
      const openBrace = css.indexOf('{', nextMedia)
      let depth = 1
      let j = openBrace + 1
      while (depth > 0 && j < css.length) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
        j++
      }
      i = j
    }
    return out
  }

  /** Every top-level (non-@media) rule whose comma-separated selector list contains `needle` as a
   * whole selector token (so `.lev-status` never accidentally matches `.lev-status-h`). Returns
   * the concatenated bodies of every matching rule, since a real stylesheet may split `.lev-status`
   * and `.lev-status[data-have='true']` (etc.) into separate rules. */
  function declarationsFor(css: string, needle: string): string {
    const flat = stripMediaBlocks(css)
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g
    let m: RegExpExecArray | null
    let combined = ''
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const selectorTokenRe = new RegExp(`(^|[\\s,])${escaped}($|[\\s,[:])`)
    while ((m = ruleRe.exec(flat))) {
      const selectors = m[1].trim()
      if (selectorTokenRe.test(selectors)) {
        combined += m[2] + '\n'
      }
    }
    return combined
  }

  function matrixLightTokens(): Record<string, string> {
    return customProps(block(matrixCss, /^\.matrix-root,/m))
  }
  function matrixDarkMediaTokens(): Record<string, string> {
    return customProps(
      block(matrixCss, /:root:not\(\[data-theme='light'\]\) \.matrix-root,/),
    )
  }
  function matrixDarkExplicitTokens(): Record<string, string> {
    return customProps(block(matrixCss, /^:root\[data-theme='dark'\] \.matrix-root,/m))
  }
  function lgLightTokens(): Record<string, string> {
    return customProps(block(lookingGlassCss, /^:root \{/m))
  }
  function lgDarkMediaTokens(): Record<string, string> {
    return customProps(block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/))
  }
  function lgDarkExplicitTokens(): Record<string, string> {
    return customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
  }

  describe('the table card wrapper (`.leverage-root`) reuses the shared 15px --radius-card', () => {
    it('`.leverage-root` declares `border-radius: var(--radius-card)` (not a bespoke pixel value)', () => {
      const body = declarationsFor(matrixCss, '.leverage-root')
      const radiusDecl = /border-radius\s*:\s*([^;]+);/.exec(body)
      expect(radiusDecl).not.toBeNull()
      expect(radiusDecl![1].trim()).toBe('var(--radius-card)')
    })
  })

  describe('`.lev-status` pill shape (padding + fully-rounded radius), reusing the existing 99px pill idiom already used by `.lev-bar-track`/`.lev-bar` in this same file', () => {
    it('declares a `border-radius` of the same fully-rounded value already used by `.lev-bar-track`/`.lev-bar` (99px)', () => {
      const body = declarationsFor(matrixCss, '.lev-status')
      const radiusDecl = /border-radius\s*:\s*([^;]+);/.exec(body)
      expect(radiusDecl).not.toBeNull()
      expect(radiusDecl![1].trim()).toBe('99px')
    })

    it('declares a non-zero `padding` (both a horizontal and a vertical component) so the pill has visible inset — a bare text color swap is not sufficient', () => {
      const body = declarationsFor(matrixCss, '.lev-status')
      const paddingDecl = /padding\s*:\s*([^;]+);/.exec(body)
      expect(paddingDecl).not.toBeNull()
      const values = paddingDecl![1]
        .trim()
        .split(/\s+/)
        .map((v) => parseFloat(v))
      expect(values.length).toBeGreaterThanOrEqual(1)
      for (const v of values) {
        expect(v).toBeGreaterThan(0)
      }
    })

    it('the sticky positioning (`position: sticky`) is preserved — the pill restyle does not regress the horizontal-scroll pinned-column behavior', () => {
      const body = declarationsFor(matrixCss, '.lev-status')
      expect(body).toMatch(/position\s*:\s*sticky/)
    })

    it('the base (unmodified-by-state) sticky background stays `var(--surface-1)` — matches `.lev-num`/`.lev-skill` so the pinned-column seam does not look like a rendering glitch when scrolling horizontally', () => {
      const body = declarationsFor(matrixCss, '.lev-status')
      expect(body).toMatch(/background\s*:\s*var\(--surface-1\)/)
    })
  })

  // The SPEC doesn't mandate WHICH member of the --status-good/--status-good-surface family fills
  // the text vs. the background (a translucent-chip design and a solid-badge design are both
  // legitimate "pill" treatments) — only that (a) no fresh hex/rgba color literal is introduced,
  // (b) only that family's tokens are referenced, and (c) whatever combination is chosen actually
  // clears AA 4.5:1 once resolved against the table's own --surface-1 sticky backdrop (the next
  // describe block). Pinning an exact token-per-property pairing here would be over-specified
  // (testing implementation detail, not contract) AND would have ruled out the light
  // --status-good/--status-good-surface pairing entirely while `--have` was still #1a7a4b (that
  // combination measured 4.30:1, just under the floor, and contrastRatio is symmetric so no
  // property-assignment swap within the family could have fixed it) — hence the deliberately
  // generic "clears AA, whichever pairing is chosen" contract below rather than a rigid one. Spec
  // 022 subsequently nudged --have to #167647 (see colorTokens.test.ts / glass-v2-tokens.test.ts),
  // which clears that same pairing at ~4.548:1, but this describe block stays generic on purpose —
  // it never hardcoded the failing 4.30:1 figure as an assertion, only as this historical note.
  describe('`.lev-status[data-have]` reuses matrix.css\'s own --status-good/--status-critical alias chain (which already resolves to the shared --have/--have-soft/--learn/--learn-soft glass-v2 tokens) for the pill fill — mirrors the existing `.matrix-point-flag` convention — no unrelated token, no fresh color literal', () => {
    const familyBySelector: Record<string, RegExp> = {
      "[data-have='true']": /^var\(--status-good(-surface)?\)$/,
      "[data-have='false']": /^var\(--status-critical(-surface)?\)$/,
    }

    for (const [attr, allowed] of Object.entries(familyBySelector)) {
      const selector = `.lev-status${attr}`
      it(`\`${selector}\` declares both a color and a background`, () => {
        const body = declarationsFor(matrixCss, selector)
        expect(body).toMatch(/color\s*:\s*[^;]+;/)
        expect(body).toMatch(/background(?:-color)?\s*:\s*[^;]+;/)
      })

      it(`\`${selector}\`'s color and background only reference its own --status-good(-surface)/--status-critical(-surface) family — never the other polarity, never an unrelated token, never a fresh hex/rgba literal`, () => {
        const body = declarationsFor(matrixCss, selector)
        const colorM = /color\s*:\s*([^;]+);/.exec(body)
        const bgM = /background(?:-color)?\s*:\s*([^;]+);/.exec(body)
        expect(colorM).not.toBeNull()
        expect(bgM).not.toBeNull()
        expect(colorM![1].trim()).toMatch(allowed)
        // The background may now be a multi-layer composite (translucent tint layer over an
        // opaque `--surface-1` backdrop layer, one `background` declaration) rather than a single
        // exact token — so the family check here is a *contains* match on the tint layer, not a
        // whole-value equality match. Drop the `^...$` anchors from `allowed` for this assertion.
        const tintLayerPresent = new RegExp(allowed.source.replace(/^\^/, '').replace(/\$$/, ''))
        expect(bgM![1]).toMatch(tintLayerPresent)
        // And actively verify the ghosting-fix mechanism: an opaque `--surface-1` backdrop layer
        // must also be present underneath the tint, so the pinned column can never let non-sticky
        // columns show through while scrolling.
        expect(bgM![1]).toMatch(/var\(--surface-1\)/)
      })
    }

    it('neither modifier introduces a fresh hex/rgba color literal anywhere in its declaration block (Bounded-AI / "no new unchecked color literal" constraint)', () => {
      for (const selector of [".lev-status[data-have='true']", ".lev-status[data-have='false']"]) {
        const body = declarationsFor(matrixCss, selector)
        expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
        expect(body).not.toMatch(/rgba?\(/)
      }
    })
  })

  describe('whichever --status-good(-surface)/--status-critical(-surface) fg/bg pairing `.lev-status[data-have]` actually declares, the resolved contrast clears AA 4.5:1 against the table\'s own --surface-1 sticky backdrop, in both themes', () => {
    /** Resolves a declared `color`/`background` value (already known to be `var(--status-good)`,
     * `var(--status-good-surface)`, or the critical equivalents) all the way to a concrete
     * opaque hex: chases the var() chain to either a hex literal (the *-good/-critical solid
     * tokens) or an rgba() literal (the *-surface soft tokens), alpha-compositing the latter over
     * the supplied opaque backdrop. */
    function resolveDeclaredColorToHex(
      raw: string,
      tokens: Record<string, string>,
      backdropHex: string,
    ): string {
      const chained = resolveVarChain(raw, tokens)
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(chained)) {
        return chained
      }
      const rgba = parseRgba(chained, raw)
      if (rgba[3] >= 1) {
        const toHex = (n: number) => n.toString(16).padStart(2, '0')
        return `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`
      }
      return compositeOverBackdrop(rgba, backdropHex)
    }

    function assertPillContrastClearsAA(
      selector: string,
      tokens: Record<string, string>,
      surfaceHex: string,
    ) {
      const body = declarationsFor(matrixCss, selector)
      const colorM = /color\s*:\s*([^;]+);/.exec(body)
      const bgM = /background(?:-color)?\s*:\s*([^;]+);/.exec(body)
      expect(colorM).not.toBeNull()
      expect(bgM).not.toBeNull()
      const fgHex = resolveDeclaredColorToHex(colorM![1].trim(), tokens, surfaceHex)
      // The background value may now be a multi-layer composite (translucent tint layer over an
      // opaque `--surface-1` backdrop layer). `resolveDeclaredColorToHex` still expects a single
      // token/var chain, so pull out just the translucent-tint layer (the one matching the
      // --status-good(-surface)/--status-critical(-surface) family) before resolving it — the
      // composite-over-backdrop math itself is unchanged, only what's fed into it.
      const tintLayerMatch = /var\(--status-(?:good|critical)(?:-surface)?\)/.exec(
        bgM![1].trim(),
      )
      expect(tintLayerMatch).not.toBeNull()
      const bgHex = resolveDeclaredColorToHex(tintLayerMatch![0], tokens, surfaceHex)
      expect(contrastRatio(fgHex, bgHex)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }

    it("light: [data-have='true']", () => {
      const tokens = { ...lgLightTokens(), ...matrixLightTokens() }
      expect(tokens['surface-1']).toBeDefined()
      assertPillContrastClearsAA(".lev-status[data-have='true']", tokens, tokens['surface-1'])
    })
    it("light: [data-have='false']", () => {
      const tokens = { ...lgLightTokens(), ...matrixLightTokens() }
      expect(tokens['surface-1']).toBeDefined()
      assertPillContrastClearsAA(".lev-status[data-have='false']", tokens, tokens['surface-1'])
    })
    it("dark (media block): [data-have='true']", () => {
      const tokens = { ...lgDarkMediaTokens(), ...matrixDarkMediaTokens() }
      expect(tokens['surface-1']).toBeDefined()
      assertPillContrastClearsAA(".lev-status[data-have='true']", tokens, tokens['surface-1'])
    })
    it("dark (media block): [data-have='false']", () => {
      const tokens = { ...lgDarkMediaTokens(), ...matrixDarkMediaTokens() }
      expect(tokens['surface-1']).toBeDefined()
      assertPillContrastClearsAA(".lev-status[data-have='false']", tokens, tokens['surface-1'])
    })
    it("dark (explicit [data-theme='dark'] block): [data-have='true']", () => {
      const tokens = { ...lgDarkExplicitTokens(), ...matrixDarkExplicitTokens() }
      expect(tokens['surface-1']).toBeDefined()
      assertPillContrastClearsAA(".lev-status[data-have='true']", tokens, tokens['surface-1'])
    })
    it("dark (explicit [data-theme='dark'] block): [data-have='false']", () => {
      const tokens = { ...lgDarkExplicitTokens(), ...matrixDarkExplicitTokens() }
      expect(tokens['surface-1']).toBeDefined()
      assertPillContrastClearsAA(".lev-status[data-have='false']", tokens, tokens['surface-1'])
    })
  })

  describe('the leverage progress-bar (`.lev-bar-track`/`.lev-bar`/`.lev-bar-val`) is polished onto the token system — no ad hoc hex/rgba color literal', () => {
    it('`.lev-bar-track` declares no ad hoc hex/rgba color literal — every color traces to a var() token', () => {
      const body = declarationsFor(matrixCss, '.lev-bar-track')
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(body).not.toMatch(/rgba?\(/)
    })
    it('`.lev-bar` declares no ad hoc hex/rgba color literal — every color traces to a var() token', () => {
      const body = declarationsFor(matrixCss, '.lev-bar')
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(body).not.toMatch(/rgba?\(/)
    })
    it('`.lev-bar-val` declares no ad hoc hex/rgba color literal — every color traces to a var() token', () => {
      const body = declarationsFor(matrixCss, '.lev-bar-val')
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(body).not.toMatch(/rgba?\(/)
    })

    it('`.lev-bar-track` and `.lev-bar` keep the fully-rounded 99px pill radius (unchanged idiom, still a track/fill pair)', () => {
      for (const selector of ['.lev-bar-track', '.lev-bar']) {
        const body = declarationsFor(matrixCss, selector)
        const radiusDecl = /border-radius\s*:\s*([^;]+);/.exec(body)
        expect(radiusDecl).not.toBeNull()
        expect(radiusDecl![1].trim()).toBe('99px')
      }
    })
  })

  describe('behavioral regression guard — the ALREADY-CORRECT bar width formula (score / topScore) and demand-only "—" fallback are unaffected by this CSS-only restyle', () => {
    it('renders each scored row\'s `.lev-bar` inline width as exactly `(arbitrage_score / topScore) * 100`, topScore = the max arbitrage_score across all rows (9.1, Rust)', () => {
      render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      const table = screen.getByRole('table')
      const topScore = 9.1

      const expectations: Array<[string, number]> = [
        ['Rust', 9.1],
        ['Kubernetes', 7.3],
        ['PostgreSQL', 4.2],
      ]
      for (const [skill, score] of expectations) {
        const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
        const bar = row.querySelector('.lev-bar') as HTMLElement
        expect(bar).toBeTruthy()
        const expectedPct = (score / topScore) * 100
        expect(bar.style.width).toBe(`${expectedPct}%`)
      }
    })

    it('renders no `.lev-bar-track`/`.lev-bar` at all for the demand-only row (gRPC) — only the em-dash fallback, decorative and hidden from assistive tech', () => {
      render(<SkillLeverageTable rows={roleSkillProfileFixture} roleName="Backend" />)
      const table = screen.getByRole('table')
      const grpcRow = within(table)
        .getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })
        .closest('tr')!

      expect(grpcRow.querySelector('.lev-bar-track')).toBeNull()
      expect(grpcRow.querySelector('.lev-bar')).toBeNull()

      const dash = within(grpcRow).getAllByText('—')[0]
      expect(dash).toHaveClass('lev-bar-val')
      expect(dash).toHaveAttribute('aria-hidden', 'true')
    })

    it('the demand-only row (gRPC), which is ALSO a "have" skill in the fixture, still renders the "Already have" pill text alongside its em-dash leverage fallback — the pill restyle and the demand-only fallback are independent and both survive together', () => {
      render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      const table = screen.getByRole('table')
      const grpcRow = within(table)
        .getByRole('rowheader', { name: new RegExp(DEMAND_ONLY_SKILL) })
        .closest('tr')!

      expect(within(grpcRow).getByText('Already have')).toBeInTheDocument()
      const statusCell = grpcRow.querySelector('.lev-status')
      expect(statusCell).toHaveAttribute('data-have', 'true')
      expect(within(grpcRow).getAllByText('—').length).toBeGreaterThan(0)
    })

    it('every gap/have skill in the fixture still renders its Status pill text, keyed by data-have (behavioral contract unchanged by the CSS-only restyle)', () => {
      render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      const table = screen.getByRole('table')
      for (const skill of HAVE_SKILLS) {
        const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
        expect(within(row).getByText('Already have')).toBeInTheDocument()
        expect(row.querySelector('.lev-status')).toHaveAttribute('data-have', 'true')
      }
      for (const skill of GAP_SKILLS) {
        const row = within(table).getByRole('rowheader', { name: new RegExp(skill) }).closest('tr')!
        expect(within(row).getByText('Worth learning')).toBeInTheDocument()
        expect(row.querySelector('.lev-status')).toHaveAttribute('data-have', 'false')
      }
    })

    it('has zero axe violations with the pill-restyled Status column populated (regression guard — text still carries the have/gap meaning, never color alone)', async () => {
      const { container } = render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})

// ---------------------------------------------------------------------------------------------
// Spec 024 — mobile-friendly leverage table: shrink the pinned-column footprint at ≤480px so
// metric data (Leverage, Demand, ...) is actually visible on a real phone viewport, while keeping
// every number (including Status) genuinely accessible.
//
// This test suite reads matrix.css as raw text and asserts on rule bodies (same convention as the
// spec-022 describe block above) rather than mounting a real browser at a given viewport width —
// vitest.config's `test.css` is unset/false, so component-render tests never see applied CSS rules,
// and jsdom does not evaluate `@media` queries against a simulated viewport at all. That means:
//   - assertions (a)/(b) below are CSS-text assertions against a new `@media (max-width: 480px)`
//     block in matrix.css — they are honest about testing declared rules, not rendered/computed
//     styles in a real viewport.
//   - assertion (c) is a genuine behavioral (RTL) test: it renders the real component and queries
//     the DOM, so it actually proves the label text is present in the accessibility tree — this one
//     IS a real assertion about rendered output, not just CSS text.
//   - assertion (d) (axe) mounts the real component and runs the real axe-core engine against the
//     real rendered DOM/CSSOM in jsdom's default viewport size. It genuinely exercises axe's rule
//     engine, but it does NOT — and cannot, in jsdom — prove that a real browser reflows this table
//     at 480px width the way a phone would. It is included as a structural regression guard (no
//     a11y violations in the markup this SPEC touches), not as proof of correct 480px rendering.
describe('<SkillLeverageTable /> spec 024 — mobile ≤480px: unpin Status, shrink Skill, keep Status text in the DOM', () => {
  const MATRIX_DIR = path.dirname(fileURLToPath(import.meta.url))
  const MATRIX_CSS_PATH = path.join(MATRIX_DIR, 'matrix.css')
  const matrixCss = readFileSync(MATRIX_CSS_PATH, 'utf-8')

  /** Finds the `{ ... }` block for a pattern via brace-depth counting (duplicated from the sibling
   * spec-022 describe block's own local copy of this generic parsing utility — kept local to this
   * describe block on purpose, per this suite's established "each section owns its own copy"
   * convention, rather than hoisting a shared helper module for a two-line function). */
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

  /** Every rule (inside an already-extracted, flat block of CSS text — e.g. the interior of one
   * `@media` block) whose comma-separated selector list contains `needle` as a whole selector
   * token (so `.lev-status` never accidentally matches `.lev-status-h`). Returns the concatenated
   * bodies of every matching rule. */
  function declarationsForIn(cssBlock: string, needle: string): string {
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g
    let m: RegExpExecArray | null
    let combined = ''
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const selectorTokenRe = new RegExp(`(^|[\\s,])${escaped}($|[\\s,[:])`)
    while ((m = ruleRe.exec(cssBlock))) {
      const selectors = m[1].trim()
      if (selectorTokenRe.test(selectors)) {
        combined += m[2] + '\n'
      }
    }
    return combined
  }

  /** Extracts the interior of the `@media (max-width: 480px) { ... }` block. Deliberately does NOT
   * fall back to the existing 560px/520px blocks — per the SPEC, 480px must be its own distinct
   * block, not merged into the scatter-sizing 560px block or the topmoves-grid 520px block. */
  function mobile480Block(): string {
    return block(matrixCss, /@media\s*\(max-width:\s*480px\)\s*\{/)
  }

  describe('(a) `.lev-status`/`.lev-status-h` are no longer sticky at ≤480px', () => {
    it('a `@media (max-width: 480px)` block exists in matrix.css, distinct from the existing 560px/520px blocks', () => {
      expect(() => mobile480Block()).not.toThrow()
    })

    it('`.lev-status`\'s `position` inside the 480px block is overridden away from `sticky`', () => {
      const mediaBody = mobile480Block()
      const body = declarationsForIn(mediaBody, '.lev-status')
      const positionDecl = /position\s*:\s*([^;]+);/.exec(body)
      expect(positionDecl).not.toBeNull()
      expect(positionDecl![1].trim()).not.toBe('sticky')
    })

    it('`.lev-status-h`\'s `position` inside the 480px block is overridden away from `sticky`', () => {
      const mediaBody = mobile480Block()
      const body = declarationsForIn(mediaBody, '.lev-status-h')
      const positionDecl = /position\s*:\s*([^;]+);/.exec(body)
      expect(positionDecl).not.toBeNull()
      expect(positionDecl![1].trim()).not.toBe('sticky')
    })
  })

  describe('(b) `.lev-skill`/`.lev-skill-h` shrink from 9rem to 6rem at ≤480px', () => {
    it('`.lev-skill`\'s `width` inside the 480px block is `6rem`', () => {
      const mediaBody = mobile480Block()
      const body = declarationsForIn(mediaBody, '.lev-skill')
      const widthDecl = /width\s*:\s*([^;]+);/.exec(body)
      expect(widthDecl).not.toBeNull()
      expect(widthDecl![1].trim()).toBe('6rem')
    })

    it('`.lev-skill-h`\'s `width` inside the 480px block is `6rem`', () => {
      const mediaBody = mobile480Block()
      const body = declarationsForIn(mediaBody, '.lev-skill-h')
      const widthDecl = /width\s*:\s*([^;]+);/.exec(body)
      expect(widthDecl).not.toBeNull()
      expect(widthDecl![1].trim()).toBe('6rem')
    })
  })

  describe('unchanged invariants the 480px block must NOT touch', () => {
    it('`.lev-num`\'s width (2.25rem) and sticky `left: 0` are unchanged at the top level (this SPEC does not touch `.lev-num`)', () => {
      const body = block(matrixCss, /^\.lev-num \{/m)
      expect(/width\s*:\s*2\.25rem;/.test(body)).toBe(true)
      expect(/position\s*:\s*sticky;/.test(body)).toBe(true)
      expect(/left\s*:\s*0;/.test(body)).toBe(true)
    })

    it('the base (top-level, non-media) `.lev-skill`/`.lev-skill-h` width is still `9rem` — only the 480px override changes it, the base rule is untouched', () => {
      const body = block(matrixCss, /^\.lev-skill,\s*\n\.lev-skill-h \{/m)
      expect(/width\s*:\s*9rem;/.test(body)).toBe(true)
    })
  })

  describe('(c) the Status label text remains present/query-able in the DOM regardless of viewport (RTL cannot evaluate CSS visual clipping, so this is the correct behavioral guard)', () => {
    it('renders "Already have" and "Worth learning" as query-able text nodes, still findable by RTL\'s getByText', () => {
      render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      const table = screen.getByRole('table')
      expect(within(table).getAllByText('Already have').length).toBeGreaterThan(0)
      expect(within(table).getAllByText('Worth learning').length).toBeGreaterThan(0)
    })

    it('the label span is not removed even once the (future) `.lev-status-label` visual-hiding class is applied — this locks in "present in the DOM", not "display:none"', () => {
      render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      const table = screen.getByRole('table')
      const label = within(table).getAllByText(/Already have|Worth learning/)[0]
      // getByText already guarantees this element is attached to the document and has visible
      // text content in RTL's default (non-`hidden`) query mode — asserting again here documents
      // the intent: this must stay true even after Magnolia's CSS clips it visually.
      expect(label).toBeInTheDocument()
    })
  })

  describe('(d) axe-core reports no violations with the Status column populated (structural regression guard — see the file-level note above on what jsdom can and cannot verify about 480px reflow)', () => {
    it('has zero axe violations with the Status column populated (does not prove 480px reflow correctness — jsdom does not evaluate @media viewport queries)', async () => {
      const { container } = render(
        <SkillLeverageTable
          rows={roleSkillProfileFixture}
          roleName="Backend"
          haveSkillKeys={HAVE_SKILL_KEYS}
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
