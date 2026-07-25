// Spec 020 — restyle the scorecard section (donut + `TopGapNarration`) to the glass v2 design
// language: `.lg-scorecard` becomes a `--glass-2` glass panel with the new `--radius-card: 15px`
// token, the donut hole stops using the old flat `--color-bg` cutout in favor of the
// `--page`/`--glass-2` combination, and the "next moves" ranked list (`.topmoves-list`/
// `.topmove*` in matrix.css) becomes a CSS-grid mini-grid with card-style chrome per item and
// `--chip-bg`/`--chip-fg` stat chips.
//
// This suite is deliberately RED until Magnolia lands those CSS rules — `.lg-scorecard` still
// uses the old `--color-bg`/flex layout and `.topmoves-list`/`.topmove-stat` still reference
// matrix.css's own token layer (`--page-plane`/`--text-secondary`), not the shared glass-v2 chip
// tokens. Follows the same brace-depth CSS-text-parsing convention as glass-v2-tokens.test.ts /
// nav-sidebar-glass-restyle.test.ts (no real DOM/CSSOM available in this Vitest environment;
// `test.css: false` by default means component-render tests never see applied stylesheet rules,
// so any assertion about actual CSS declarations has to read the stylesheet text directly — see
// vitest.config.ts).
//
// App.tsx's inline-style migration off `--have-tone`/`--learn-tone` onto `--have`/`--learn`
// directly is a *rendered-DOM* concern instead, and lives in App.colorTokens.test.tsx (extended
// for spec 020) rather than here.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { contrastRatio, hexToRgb, resolveToHex } from './colorTokens.test'

const STYLES_DIR = path.dirname(fileURLToPath(import.meta.url))
const LOOKING_GLASS_CSS_PATH = path.join(STYLES_DIR, 'looking-glass.css')
const MATRIX_CSS_PATH = path.join(STYLES_DIR, '..', 'components', 'matrix', 'matrix.css')
const lookingGlassCss = readFileSync(LOOKING_GLASS_CSS_PATH, 'utf-8')
const matrixCss = readFileSync(MATRIX_CSS_PATH, 'utf-8')

const AA_NORMAL_TEXT = 4.5

/** Finds the `{ ... }` block for a selector pattern via brace-depth counting (duplicated from the
 * sibling token/glass test files — these are flat, hand-authored stylesheets with no nesting
 * inside a single rule body, so this is exact for this purpose). */
function block(css: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css)
  if (!match) {
    throw new Error(`Selector pattern not found in stylesheet: ${selectorPattern}`)
  }
  const braceInMatch = match[0].lastIndexOf('{')
  const openBrace =
    braceInMatch !== -1 ? match.index + braceInMatch : css.indexOf('{', match.index + match[0].length)
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

function customProps(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /--([\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    out[m[1]] = m[2].trim()
  }
  return out
}

function lightRoot(): Record<string, string> {
  return customProps(block(lookingGlassCss, /^:root \{/m))
}

function darkRoot(): Record<string, string> {
  return customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
}

/** Parses an `rgba(r, g, b, a)` (or `rgb(r, g, b)`) declaration into a `[r, g, b, a]` tuple. */
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

/** Extracts the full body of a top-level `@media (...) { ... }` block by brace-depth counting
 * from the `{` right after the media-query prelude match (not any nested rule's brace). */
function mediaBlock(css: string, mediaPattern: RegExp): string {
  const match = mediaPattern.exec(css)
  if (!match) {
    throw new Error(`Media query pattern not found: ${mediaPattern}`)
  }
  const openBrace = css.indexOf('{', match.index)
  if (openBrace === -1) {
    throw new Error(`Could not locate an opening brace for media pattern: ${mediaPattern}`)
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

describe('spec 020 — new --radius-card token (15px), scoped for reuse by the scorecard/matrix/table cards', () => {
  it('--radius-card is defined at 15px in the light :root block', () => {
    const light = lightRoot()
    expect(light['radius-card']).toBe('15px')
  })

  it('--radius-md (4px) is left untouched — --radius-card is a new, separate token, not a redefinition', () => {
    const light = lightRoot()
    expect(light['radius-md']).toBe('4px')
  })
})

describe('spec 020 — `.lg-scorecard` becomes a `--glass-2` glass panel using `--radius-card`', () => {
  it('`.lg-scorecard` background references `var(--glass-2)`', () => {
    const body = block(lookingGlassCss, /^\.lg-scorecard\s*\{/m)
    expect(body).toMatch(/background(-color)?\s*:\s*var\(--glass-2\)/)
  })

  it('`.lg-scorecard` border-radius resolves through `var(--radius-card)` (the token this task introduces, not a hardcoded 15px)', () => {
    const body = block(lookingGlassCss, /^\.lg-scorecard\s*\{/m)
    const radiusDecl = /border-radius\s*:\s*([^;]+);/.exec(body)
    expect(radiusDecl).not.toBeNull()
    expect(radiusDecl![1].trim()).toBe('var(--radius-card)')
  })

  it('`.lg-scorecard` declares no ad hoc rgba()/hex literal for its background — must trace to a token', () => {
    const body = block(lookingGlassCss, /^\.lg-scorecard\s*\{/m)
    const backgroundDecl = /background(-color)?\s*:\s*([^;]+);/.exec(body)
    expect(backgroundDecl).not.toBeNull()
    expect(backgroundDecl![2]).not.toMatch(/rgba?\(/)
  })
})

describe('spec 020 — donut hole no longer a flat `--color-bg` cutout against the new glass card', () => {
  it('`.lg-donut-hole` background no longer references the old `--color-bg` token', () => {
    const body = block(lookingGlassCss, /^\.lg-donut-hole\s*\{/m)
    expect(body).not.toMatch(/var\(--color-bg\)/)
  })

  it('`.lg-donut-hole` background references the `--page`/`--glass-2` combination (at least one, per the SPEC constraint)', () => {
    const body = block(lookingGlassCss, /^\.lg-donut-hole\s*\{/m)
    expect(body).toMatch(/var\(--page\)|var\(--glass-2\)/)
  })

  it('the "non-color-only" donut rationale comment survives the restyle verbatim (percentage + legend text still carry the meaning, ring is reinforcement)', () => {
    expect(lookingGlassCss).toMatch(
      /Non-color-only: the % and legend\s+\*\s*text carry the meaning; the ring is reinforcement\./,
    )
  })
})

describe('spec 020 — "next moves" mini-grid: `.topmoves-list` becomes a CSS grid, not a flex column', () => {
  it('`.topmoves-list` declares `display: grid`, not `display: flex`', () => {
    const body = block(matrixCss, /^\.topmoves-list\s*\{/m)
    expect(body).toMatch(/display\s*:\s*grid/)
    expect(body).not.toMatch(/display\s*:\s*flex/)
  })

  it('`.topmoves-list` declares a `grid-template-columns`', () => {
    const body = block(matrixCss, /^\.topmoves-list\s*\{/m)
    expect(body).toMatch(/grid-template-columns\s*:/)
  })

  it('at the 520px mobile breakpoint, `.topmoves-list` collapses its grid to a single (or fewer) column(s) so it cannot overflow on small phones — the override may live in either matrix.css or looking-glass.css\'s existing `.lg-scorecard` mobile query', () => {
    // The SPEC doesn't mandate which file houses the override (looking-glass.css already has a
    // `@media (max-width: 520px)` block that collapses `.lg-scorecard` to one column; matrix.css
    // has no 520px query yet, only its own 560px one) — so scan both for a `.topmoves-list` rule
    // nested inside *any* `@media (max-width: 520px)` block.
    const mediaPattern = /@media\s*\(max-width:\s*520px\)/g
    const foundOverride = [matrixCss, lookingGlassCss].some((css) => {
      let match: RegExpExecArray | null
      mediaPattern.lastIndex = 0
      while ((match = mediaPattern.exec(css))) {
        const media = mediaBlock(css, new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        const topmovesRuleMatch = /\.topmoves-list\s*\{([^}]*)\}/.exec(media)
        if (!topmovesRuleMatch) continue
        const columnsDecl = /grid-template-columns\s*:\s*([^;]+);/.exec(topmovesRuleMatch[1])
        if (columnsDecl && /^(1fr|none|repeat\(\s*1\s*,[^)]+\))$/.test(columnsDecl[1].trim())) {
          return true
        }
      }
      return false
    })
    expect(foundOverride).toBe(true)
  })
})

describe('spec 020 — each `.topmove` item gets card-style chrome (background/border/radius per item)', () => {
  it('`.topmove` declares its own background, border, and border-radius', () => {
    const body = block(matrixCss, /^\.topmove\s*\{/m)
    expect(body).toMatch(/background(-color)?\s*:/)
    expect(body).toMatch(/border(-color|-width|-style)?\s*:/)
    expect(body).toMatch(/border-radius\s*:/)
  })
})

describe('spec 020 — stat chips (`.topmove-stat`) restyle onto `--chip-bg`/`--chip-fg`', () => {
  it('`.topmove-stat` background references `var(--chip-bg)`, not matrix.css\'s old `--page-plane`', () => {
    const body = block(matrixCss, /^\.topmove-stat\s*\{/m)
    expect(body).toMatch(/background(-color)?\s*:\s*var\(--chip-bg\)/)
    expect(body).not.toMatch(/var\(--page-plane\)/)
  })

  it('`.topmove-stat` text color references `var(--chip-fg)`, not matrix.css\'s old `--text-secondary`', () => {
    const body = block(matrixCss, /^\.topmove-stat\s*\{/m)
    expect(body).toMatch(/color\s*:\s*var\(--chip-fg\)/)
    expect(body).not.toMatch(/color\s*:\s*var\(--text-secondary\)/)
  })

  it('`--chip-fg` on `--chip-bg` clears AA 4.5:1 in light mode, composited over `--page`', () => {
    const light = lightRoot()
    const chipBgRgba = parseRgba(light['chip-bg'], 'chip-bg')
    const composited = compositeOverBackdrop(chipBgRgba, light['page'])
    const chipFgHex = resolveToHex(light['chip-fg'], light)
    expect(contrastRatio(chipFgHex, composited)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('`--chip-fg` on `--chip-bg` clears AA 4.5:1 in dark mode, composited over `--page`', () => {
    const dark = darkRoot()
    const chipBgRgba = parseRgba(dark['chip-bg'], 'chip-bg')
    const composited = compositeOverBackdrop(chipBgRgba, dark['page'])
    const chipFgHex = resolveToHex(dark['chip-fg'], dark)
    expect(contrastRatio(chipFgHex, composited)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

describe('spec 020 — "No gaps" message stays AA-legible inside the new `--glass-2` scorecard panel', () => {
  it('the body text token (`--ink`, the scorecard\'s inherited text color) clears 4.5:1 against `--glass-2` composited over `--page`, in both themes', () => {
    for (const tokens of [lightRoot(), darkRoot()]) {
      const glass2Rgba = parseRgba(tokens['glass-2'], 'glass-2')
      const composited = compositeOverBackdrop(glass2Rgba, tokens['page'])
      const inkHex = resolveToHex(tokens['ink'], tokens)
      expect(contrastRatio(inkHex, composited)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })
})

describe('spec 020 — Bounded-AI / scope boundary: no lib/ file references this task\'s new tokens', () => {
  it('no frontend/src/lib source file references `--radius-card` (a presentation-only token)', () => {
    const libDir = path.join(STYLES_DIR, '..', 'lib')
    const entries = readdirSync(libDir, { recursive: true }) as string[]
    const sourceFiles = entries.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|\.spec\./.test(f))
    expect(sourceFiles.length).toBeGreaterThan(0)
    for (const file of sourceFiles) {
      const contents = readFileSync(path.join(libDir, file), 'utf-8')
      expect(contents).not.toMatch(/--radius-card\b/)
    }
  })
})
