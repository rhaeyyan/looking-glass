// Spec 017 — glassmorphism visual accents on `.card.blueprint` / `.nav` chrome, light mode only.
//
// This suite is deliberately RED until Redwood implements the glass tokens + rules in
// looking-glass.css. It pins down the exact contract implied by the SPEC's own worked example
// ("a translucent background rgba(tintR, tintG, tintB, alpha) over a solid backdrop hex" with the
// alpha-composite formula `tint*alpha + backdrop*(1-alpha)` per channel), so the CSS declarations
// must be expressed in a form this test can parse deterministically without guessing at
// arbitrary color-mix/oklch syntax:
//
//   :root {
//     --glass-tint: #rrggbb;           // a literal hex (the tint color)
//     --glass-tint-rgb: R, G, B;       // the SAME color as a comma-separated decimal triple,
//                                      // matching the standard CSS custom-property pattern for
//                                      // building an rgba() from a token (rgba() cannot consume
//                                      // a hex custom property directly)
//     --glass-alpha: <number in (0, 1)>;
//     --glass-blur: <length, e.g. 12px>, > 0;
//   }
//   .card.blueprint, .nav {
//     background: rgba(var(--glass-tint-rgb), var(--glass-alpha));
//     backdrop-filter: blur(var(--glass-blur));
//   }
//
// If Redwood ships a different mechanism (e.g. color-mix), that's a legitimate implementation
// choice, but it must still (a) define tokens under the --glass-* names the SPEC names verbatim,
// (b) be resolvable to a literal tint hex + alpha fraction so contrast is computable, and (c) this
// test file is the place to extend when that's the case — the important, non-negotiable invariant
// this suite enforces is the CONTRAST MATH, not the exact CSS function chosen.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { contrastRatio, hexToRgb, resolveToHex } from './colorTokens.test'

const STYLES_DIR = path.dirname(fileURLToPath(import.meta.url))
const lookingGlassCss = readFileSync(path.join(STYLES_DIR, 'looking-glass.css'), 'utf-8')
const matrixCss = readFileSync(
  path.join(STYLES_DIR, '..', 'components', 'matrix', 'matrix.css'),
  'utf-8',
)

const AA_NORMAL_TEXT = 4.5
const AA_NON_TEXT = 3.0

/** Finds the `{ ... }` block for a selector pattern via brace-depth counting (mirrors the helper
 * in colorTokens.test.ts — duplicated locally rather than exported from there, since it is a
 * generic parsing utility rather than the "shared contrast helper" spec 017 was told to reuse). */
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

/** Parses a `--glass-tint-rgb: R, G, B;` style custom-property value into a numeric RGB triple. */
function parseRgbTriple(raw: string): [number, number, number] {
  const parts = raw.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`parseRgbTriple: expected "R, G, B", got: ${raw}`)
  }
  return [parts[0], parts[1], parts[2]]
}

/** Alpha-composites a translucent `tint` (0-255 RGB triple) at `alpha` (0-1) over an opaque
 * `backdropHex`, per the WCAG-adjacent flattening formula the SPEC specifies verbatim:
 * `tint*alpha + backdrop*(1-alpha)` per channel. Returns the flattened color as a hex string. */
function compositeOverBackdrop(
  tint: [number, number, number],
  alpha: number,
  backdropHex: string,
): string {
  const backdrop = hexToRgb(backdropHex)
  const channel = (i: number) => Math.round(tint[i] * alpha + backdrop[i] * (1 - alpha))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(channel(0))}${toHex(channel(1))}${toHex(channel(2))}`
}

/** The only three backdrops that exist in this app, per the SPEC. */
function realBackdrops(light: Record<string, string>): string[] {
  return [light['color-bg'], light['color-surface'], light['color-neutral-100']]
}

/** Given the light token block, returns the parsed glass tint RGB + alpha, throwing a descriptive
 * error (rather than silently returning garbage) if the tokens don't exist yet — this is exactly
 * the RED failure mode expected before Redwood implements the SPEC. */
function readGlassPaint(light: Record<string, string>): { tintRgb: [number, number, number]; alpha: number } {
  if (light['glass-tint-rgb'] === undefined) {
    throw new Error(
      'Expected light :root to define --glass-tint-rgb (a comma-separated "R, G, B" decimal ' +
        'triple matching --glass-tint) — not found. This is the expected RED state before spec ' +
        '017 is implemented.',
    )
  }
  if (light['glass-alpha'] === undefined) {
    throw new Error('Expected light :root to define --glass-alpha — not found (pre-implementation RED state).')
  }
  const tintRgb = parseRgbTriple(light['glass-tint-rgb'])
  const alpha = Number(light['glass-alpha'])
  if (Number.isNaN(alpha)) {
    throw new Error(`--glass-alpha did not parse as a number: ${light['glass-alpha']}`)
  }
  return { tintRgb, alpha }
}

/** Worst-case (lowest) contrast ratio of `fgHex` against the glass surface, across all three real
 * backdrops it could be compositing over. */
function worstGlassContrast(
  fgHex: string,
  tintRgb: [number, number, number],
  alpha: number,
  backdrops: string[],
): number {
  const ratios = backdrops.map((bd) => contrastRatio(fgHex, compositeOverBackdrop(tintRgb, alpha, bd)))
  return Math.min(...ratios)
}

describe('spec 017 — glassmorphism tokens exist (light :root only)', () => {
  it('defines --glass-tint, --glass-tint-rgb (matching triple), --glass-alpha, --glass-blur in the light :root block', () => {
    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    expect(light['glass-tint']).toBeDefined()
    expect(light['glass-tint-rgb']).toBeDefined()
    expect(light['glass-alpha']).toBeDefined()
    expect(light['glass-blur']).toBeDefined()

    // --glass-tint-rgb must be the same color as --glass-tint (not an independently-drifting value).
    const tintHexRgb = hexToRgb(resolveToHex(light['glass-tint'], light))
    const tintRgbProp = parseRgbTriple(light['glass-tint-rgb'])
    expect(tintRgbProp).toEqual(tintHexRgb)
  })

  it('--glass-alpha is a translucency fraction strictly between 0 and 1 (0 = invisible, 1 = opaque = not glass)', () => {
    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const alpha = Number(light['glass-alpha'])
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(1)
  })

  it('--glass-blur is a positive CSS length (a real blur, not a no-op)', () => {
    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const match = /^([\d.]+)(px|rem|em)$/.exec(light['glass-blur'].trim())
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThan(0)
  })
})

describe('spec 017 — .card.blueprint and .nav get the glass treatment', () => {
  it('.card.blueprint declares backdrop-filter: blur(var(--glass-blur)) and a translucent background built from --glass-tint-rgb/--glass-alpha', () => {
    const body = block(lookingGlassCss, /^\.card\.blueprint\s*\{/m)
    expect(body).toMatch(/backdrop-filter\s*:\s*blur\(\s*var\(--glass-blur\)\s*\)/)
    expect(body).toMatch(
      /background\s*:\s*rgba\(\s*var\(--glass-tint-rgb\)\s*,\s*var\(--glass-alpha\)\s*\)/,
    )
  })

  it('.nav declares backdrop-filter: blur(var(--glass-blur)) and the same translucent background construction', () => {
    const body = block(lookingGlassCss, /^\.nav\s*\{/m)
    expect(body).toMatch(/backdrop-filter\s*:\s*blur\(\s*var\(--glass-blur\)\s*\)/)
    expect(body).toMatch(
      /background\s*:\s*rgba\(\s*var\(--glass-tint-rgb\)\s*,\s*var\(--glass-alpha\)\s*\)/,
    )
  })

  it('never applies the glass background/blur to bare .card (without .blueprint) or .blueprint alone — scoped to the combined selector only', () => {
    // .blueprint bare selector predates this spec (corner brackets only) and must not gain a
    // background/backdrop-filter of its own; .card bare (no .blueprint) likewise must stay
    // transparent per the existing rule.
    const blueprintOnly = block(lookingGlassCss, /^\.blueprint\s*\{/m)
    expect(blueprintOnly).not.toMatch(/backdrop-filter/)
    const cardOnly = block(lookingGlassCss, /^\.card\s*\{/m)
    expect(cardOnly).toMatch(/background:\s*transparent/)
    expect(cardOnly).not.toMatch(/backdrop-filter/)
  })
})

describe('spec 017 — composited-surface contrast (the core invariant)', () => {
  it('compositeOverBackdrop matches the SPEC formula on a hand-checked example', () => {
    // 50% white tint over black backdrop => mid-gray (127/128ish per channel).
    const result = compositeOverBackdrop([255, 255, 255], 0.5, '#000000')
    const [r, g, b] = hexToRgb(result)
    expect(r).toBeCloseTo(128, 0)
    expect(g).toBeCloseTo(128, 0)
    expect(b).toBeCloseTo(128, 0)
  })

  it('reduces to the backdrop unchanged at alpha = 0', () => {
    expect(compositeOverBackdrop([10, 20, 30], 0, '#f2f2f3')).toBe('#f2f2f3')
  })

  it('reduces to the tint unchanged at alpha = 1', () => {
    expect(compositeOverBackdrop([10, 20, 30], 1, '#f2f2f3')).toBe('#0a141e')
  })

  it('--color-text clears 4.5:1 against the glass surface over every real backdrop (worst case)', () => {
    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const { tintRgb, alpha } = readGlassPaint(light)
    const backdrops = realBackdrops(light)
    const textHex = resolveToHex(light['color-text'], light)
    expect(worstGlassContrast(textHex, tintRgb, alpha, backdrops)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })

  it('--color-accent (.card-kicker / .tag-outline text sitting directly on the glass card) clears 4.5:1 against the glass surface over every real backdrop (worst case)', () => {
    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const { tintRgb, alpha } = readGlassPaint(light)
    const backdrops = realBackdrops(light)
    const accentHex = resolveToHex(light['color-accent'], light)
    expect(worstGlassContrast(accentHex, tintRgb, alpha, backdrops)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })

  it('plain .btn text (transparent background, var(--color-text)) inside a glass .card.blueprint clears 4.5:1 against the glass surface over every real backdrop', () => {
    // Edge case called out explicitly in the SPEC: .btn has no opaque background of its own (only
    // .btn-primary does), so its text composites directly against whatever is behind it — here,
    // the glass card.
    const btnBody = block(lookingGlassCss, /^\.btn\s*\{/m)
    expect(btnBody).toMatch(/background:\s*transparent/)
    const colorMatch = /color\s*:\s*([^;]+);/.exec(btnBody)
    expect(colorMatch).not.toBeNull()

    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const { tintRgb, alpha } = readGlassPaint(light)
    const backdrops = realBackdrops(light)
    const btnTextHex = resolveToHex(colorMatch![1], light)
    expect(worstGlassContrast(btnTextHex, tintRgb, alpha, backdrops)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })

  it('the nav-brand text (var(--color-text)) clears 4.5:1 against the glass .nav surface over every real backdrop', () => {
    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const { tintRgb, alpha } = readGlassPaint(light)
    const backdrops = realBackdrops(light)
    const textHex = resolveToHex(light['color-text'], light)
    expect(worstGlassContrast(textHex, tintRgb, alpha, backdrops)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })

  it('the :focus-visible outline color (--color-accent) still clears the 3:1 non-text/UI-component floor against the glass surface over every real backdrop', () => {
    // Edge case: the nav's .seg control and :focus-visible outlines must remain legible against
    // the new translucent nav background. Focus rings are a UI-component indicator, not text, so
    // the applicable WCAG floor is 3:1 (1.4.11), not 4.5:1.
    const focusBody = block(lookingGlassCss, /^:focus-visible\s*\{/m)
    const outlineMatch = /outline\s*:\s*\S+\s+solid\s+([^;\s]+)/.exec(focusBody)
    expect(outlineMatch).not.toBeNull()

    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const { tintRgb, alpha } = readGlassPaint(light)
    const backdrops = realBackdrops(light)
    const outlineHex = resolveToHex(outlineMatch![1], light)
    expect(worstGlassContrast(outlineHex, tintRgb, alpha, backdrops)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    )
  })

  it('.seg border (visible boundary of the theme-toggle control inside/near the glass nav) clears 3:1 against the glass surface over every real backdrop', () => {
    const segBody = block(lookingGlassCss, /^\.seg\s*\{/m)
    const borderMatch = /border\s*:\s*\S+\s+solid\s+([^;\s]+)/.exec(segBody)
    expect(borderMatch).not.toBeNull()

    const light = customProps(block(lookingGlassCss, /^:root \{/m))
    const { tintRgb, alpha } = readGlassPaint(light)
    const backdrops = realBackdrops(light)
    const borderHex = resolveToHex(borderMatch![1], light)
    expect(worstGlassContrast(borderHex, tintRgb, alpha, backdrops)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    )
  })
})

describe('spec 017 — dark mode is pixel/behavior-identical to today (constraint)', () => {
  // Every key/value pair that already existed in the dark blocks before spec 017, captured from
  // the current (pre-implementation) stylesheet content. This is the same "diff-style guard"
  // pattern spec 015 established in colorTokens.test.ts, scoped to this spec's concern: dark mode
  // must not silently pick up new/changed values as a side effect of the light-mode glass work.
  const PRE_SPEC_017_DARK_ROOT = {
    'color-bg': '#16181b',
    'color-surface': '#1f2226',
    'color-text': '#eceef0',
    'color-divider': "color-mix(in srgb, #eceef0 18%, transparent)",
    'color-accent': '#7fb0e0',
    'color-neutral-100': '#26292e',
    'color-neutral-400': '#565a60',
    'color-neutral-800': '#cfd2d6',
    'color-accent-100': '#1d2d3d',
    'color-accent-400': '#4f7295',
    'color-accent-600': '#94bce3',
    'color-accent-700': '#b5d9fd',
    'color-accent-800': '#d6ebff',
    good: 'oklch(72% 0.13 152)',
    'good-tint': 'oklch(28% 0.05 152)',
    'gap-tone': 'oklch(75% 0.13 42)',
    'gap-tint': 'oklch(28% 0.05 42)',
    'have-tone': '#63d69a',
    'have-tone-surface': '#123122',
    'learn-tone': '#e8a37e',
    'learn-tone-surface': '#33190c',
  }

  function assertNoRegressionAndGlassIsInertIfPresent(dark: Record<string, string>) {
    // Every pre-existing key must be byte-identical to before.
    for (const [key, value] of Object.entries(PRE_SPEC_017_DARK_ROOT)) {
      expect(dark[key]).toBe(value)
    }
    // Any NEW key introduced by this spec must be a --glass-* token, and if present, must encode
    // "no glass" (fully opaque, no blur) so dark mode renders identically to today.
    const newKeys = Object.keys(dark).filter((k) => !(k in PRE_SPEC_017_DARK_ROOT))
    for (const key of newKeys) {
      expect(key.startsWith('glass-')).toBe(true)
      if (key === 'glass-alpha') {
        expect(Number(dark[key])).toBe(1)
      }
      if (key === 'glass-blur') {
        expect(['0', '0px', '0rem', '0em', 'none']).toContain(dark[key].trim())
      }
    }
  }

  it('the prefers-color-scheme dark override has no unexpected new/changed keys (or only inert glass tokens)', () => {
    const media = customProps(block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/))
    assertNoRegressionAndGlassIsInertIfPresent(media)
  })

  it('the explicit [data-theme="dark"] override has no unexpected new/changed keys (or only inert glass tokens)', () => {
    const explicitDark = customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
    assertNoRegressionAndGlassIsInertIfPresent(explicitDark)
  })

  it('.card.blueprint / .nav rule bodies themselves are the same in dark mode as light mode (glass is expressed purely via tokens, no [data-theme] override of these selectors)', () => {
    // Constraint: "do not add or change any [data-theme='dark']/prefers-color-scheme value" for
    // the .card.blueprint/.nav RULES either — only token values may branch by theme, never a
    // duplicated dark-specific .card.blueprint or .nav block.
    expect(lookingGlassCss).not.toMatch(/\[data-theme=['"]dark['"]\][^{]*\.card\.blueprint/)
    expect(lookingGlassCss).not.toMatch(/\[data-theme=['"]dark['"]\][^{]*\.nav\b/)
    expect(lookingGlassCss).not.toMatch(/prefers-color-scheme:\s*dark\)[^}]*\.card\.blueprint/s)
  })
})

describe('spec 017 — motion is gated behind prefers-reduced-motion (constraint)', () => {
  it('.card.blueprint has no unconditional transition on background/backdrop-filter outside a prefers-reduced-motion: no-preference guard', () => {
    const body = block(lookingGlassCss, /^\.card\.blueprint\s*\{/m)
    const transitionMatch = /transition\s*:\s*([^;]+);/.exec(body)
    if (transitionMatch) {
      expect(transitionMatch[1]).not.toMatch(/backdrop-filter|background/)
    }
  })

  it('.nav has no unconditional transition on background/backdrop-filter outside a prefers-reduced-motion: no-preference guard', () => {
    const body = block(lookingGlassCss, /^\.nav\s*\{/m)
    const transitionMatch = /transition\s*:\s*([^;]+);/.exec(body)
    if (transitionMatch) {
      expect(transitionMatch[1]).not.toMatch(/backdrop-filter|background/)
    }
  })

  it('any blur-in transition/animation for the glass surfaces that does exist lives inside an explicit @media (prefers-reduced-motion: no-preference) block', () => {
    const glassMotionRe = /transition[^;]*(?:backdrop-filter|background)[^;]*;/g
    const matches = [...lookingGlassCss.matchAll(glassMotionRe)]
    for (const m of matches) {
      const idx = m.index ?? 0
      const preceding = lookingGlassCss.slice(0, idx)
      const lastMediaOpen = preceding.lastIndexOf('@media (prefers-reduced-motion: no-preference)')
      const lastMediaCloseGuess = preceding.lastIndexOf('\n}\n')
      // The declaration must be textually inside a reduced-motion media block that opened more
      // recently than the last top-level closing brace before it.
      expect(lastMediaOpen).toBeGreaterThan(-1)
      expect(lastMediaOpen).toBeGreaterThan(lastMediaCloseGuess - 1)
    }
  })
})

describe('spec 017 — scope constraint: matrix.css is untouched', () => {
  it('matrix.css gains no glass tokens or backdrop-filter usage', () => {
    expect(matrixCss).not.toMatch(/--glass-/)
    expect(matrixCss).not.toMatch(/backdrop-filter/)
  })
})
