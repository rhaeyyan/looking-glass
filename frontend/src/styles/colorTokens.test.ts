// Spec 008 — unify the have/learn ("already have" vs "worth learning") color tokens.
//
// Before this spec, the same have/learn semantic was encoded twice, with two independently
// themed color systems that could (and did) desync:
//   - looking-glass.css: --color-accent (have) / --gap-tone (learn) — used only by the donut.
//   - matrix.css:        --status-good (have) / --status-critical (learn) — used by the scatter
//                         flags and the leverage table's Status column.
//
// This file locks the NEW contract: exactly one shared pair, --have-tone / --learn-tone (+ their
// -surface tints), defined once in looking-glass.css's token block (light + both dark paths), and
// referenced — never re-declared with fresh hex — by matrix.css. These are plain-CSS content
// assertions (no build step touches these files, so reading them directly is the correct
// black-box contract for a token file), not a test of any component's rendered behavior; App.tsx's
// consumption of the new tokens is covered separately in App.colorTokens.test.tsx.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const STYLES_DIR = path.dirname(fileURLToPath(import.meta.url))
const lookingGlassCss = readFileSync(path.join(STYLES_DIR, 'looking-glass.css'), 'utf-8')
const matrixCss = readFileSync(
  path.join(STYLES_DIR, '..', 'components', 'matrix', 'matrix.css'),
  'utf-8',
)

/** The canonical light/dark hex values for the shared have/learn tokens. Spec 008's invariant is
 * that looking-glass.css is the single source of truth and matrix.css never re-hardcodes these —
 * not that the hex values themselves are frozen forever. `LIGHT_HAVE` was updated by spec 015
 * (from the original #1a7f4b to #1a7a4b) to clear WCAG AA 4.5:1 against --color-bg (the old value
 * measured ~4.489:1, just under the floor); the rest are untouched by that spec. These constants
 * double as both "what --have-tone/--learn-tone must equal in looking-glass.css" and "what
 * matrix.css must stop hardcoding". */
const LIGHT_HAVE = '#1a7a4b'
const LIGHT_HAVE_SURFACE = '#e3f5ea'
const LIGHT_LEARN = '#8a3b12'
const LIGHT_LEARN_SURFACE = '#fbe9df'
const DARK_HAVE = '#63d69a'
const DARK_HAVE_SURFACE = '#123122'
const DARK_LEARN = '#e8a37e'
const DARK_LEARN_SURFACE = '#33190c'

/** Finds the `{ ... }` block whose selector text matches `selectorPattern`, using brace-depth
 * counting from the first `{` after the match (not a full CSS parser — these files are flat,
 * hand-authored token/rule lists with no nesting inside a single rule body, so this is exact for
 * this purpose while staying immune to incidental whitespace/formatting differences). */
function block(css: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css)
  if (!match) {
    throw new Error(`Selector pattern not found in stylesheet: ${selectorPattern}`)
  }
  // Some selector patterns below already include the trailing `{` themselves (e.g. ":root {" —
  // so a short pattern can't accidentally resolve to a *different* selector's opening brace); for
  // those, the brace is the last character of the match, not something to search for afterwards.
  // Others are a partial, multi-line selector-list fragment (e.g. matrix.css's ".matrix-root,")
  // whose own rule's `{` comes several lines later — for those, find the next `{` after the match.
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

// ── Spec 015 — shared WCAG 2.x contrast helper + light-mode contrast-fix tests ──────────────
//
// Every fix in spec 015 is a token-level hex change, so the correctness bar is "the resulting
// hex, parsed live out of the stylesheet (never hardcoded as an expected literal), clears 4.5:1
// against every real surface it renders over." `contrastRatio` below is intentionally exported
// as a clean, standalone, well-named utility (not a private inline helper) because specs 016/017
// are expected to reuse it rather than re-derive the WCAG relative-luminance math a second time.

/** Converts a `#rgb` or `#rrggbb` hex string to an `[r, g, b]` triple (0-255 each). Throws on
 * anything else (e.g. an unresolved `var(...)`, `oklch(...)`, or `color-mix(...)` — callers must
 * resolve those to a concrete hex first via {@link resolveToHex}). */
export function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.trim()
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed)
  if (!match) {
    throw new Error(`hexToRgb: expected a #rgb or #rrggbb hex string, got: ${hex}`)
  }
  let h = match[1]
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(h, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/** WCAG 2.x relative luminance of an sRGB triple (each channel 0-255). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [R, G, B] = [r, g, b].map(channel)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** WCAG 2.x contrast ratio between two hex colors (order-independent — the lighter of the two
 * always ends up the numerator, per spec). Returns a value in `[1, 21]`; 4.5 is the AA floor for
 * normal-size text. */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(hexToRgb(fg))
  const L2 = relativeLuminance(hexToRgb(bg))
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Resolves a raw CSS declaration value to a concrete hex string: passes a literal hex straight
 * through, or looks up a single-level `var(--token-name)` reference in the supplied token map
 * (recursing up to a small hop limit in case the referenced token is itself a `var(...)`, as
 * matrix.css's `--status-good: var(--have-tone)` aliasing pattern does). Throws if the value
 * can't be resolved to a hex within the hop limit, so a test fails loudly rather than silently
 * comparing garbage. */
export function resolveToHex(raw: string, tokens: Record<string, string>, maxHops = 5): string {
  let value = raw.trim()
  for (let hop = 0; hop < maxHops; hop++) {
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
      return value
    }
    const varMatch = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)
    if (!varMatch) {
      throw new Error(`resolveToHex: could not resolve "${raw}" to a hex color (stuck at "${value}")`)
    }
    const next = tokens[varMatch[1]]
    if (next === undefined) {
      throw new Error(`resolveToHex: "${raw}" references undefined token --${varMatch[1]}`)
    }
    value = next.trim()
  }
  throw new Error(`resolveToHex: "${raw}" did not resolve to a hex within ${maxHops} hops`)
}

const AA_NORMAL_TEXT = 4.5

describe('contrastRatio (shared WCAG 2.x helper)', () => {
  it('is 21:1 for pure black on pure white (the theoretical max)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio('#5980a6', '#5980a6')).toBeCloseTo(1, 5)
  })

  it('is order-independent (fg/bg swapped gives the same ratio)', () => {
    const a = contrastRatio('#1a7a4b', '#f2f2f3')
    const b = contrastRatio('#f2f2f3', '#1a7a4b')
    expect(a).toBeCloseTo(b, 10)
  })

  it('expands 3-digit hex the same as its 6-digit equivalent', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(contrastRatio('#000000', '#ffffff'), 10)
  })
})

describe('spec 015 — light-mode contrast fixes (all below are RED until Redwood/Magnolia edit the CSS)', () => {
  describe('fix 1 — --color-accent (looking-glass.css, light :root) vs --color-bg', () => {
    it('clears 4.5:1 (currently ~3.71:1 at #5980a6 vs #f2f2f3)', () => {
      const light = customProps(block(lookingGlassCss, /^:root \{/m))
      expect(contrastRatio(light['color-accent'], light['color-bg'])).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      )
    })
  })

  describe('fix 2 — --have-tone (looking-glass.css, light :root ONLY) vs --color-bg', () => {
    it('clears 4.5:1 (fixed at #1a7a4b vs #f2f2f3, ~4.777:1 — the old #1a7f4b measured ~4.489:1, just under the floor)', () => {
      const light = customProps(block(lookingGlassCss, /^:root \{/m))
      expect(contrastRatio(light['have-tone'], light['color-bg'])).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      )
    })

    it('does NOT touch the dark --have-tone value (constraint: dark tokens are off-limits)', () => {
      const media = customProps(block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/))
      const explicitDark = customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
      expect(media['have-tone']).toBe('#63d69a')
      expect(explicitDark['have-tone']).toBe('#63d69a')
    })
  })

  describe('fix 3 — .lg-donut-label loses its opacity dimming for a token-driven color', () => {
    it('no longer sets an opacity property', () => {
      const body = block(lookingGlassCss, /\.lg-donut-label \{/)
      expect(body).not.toMatch(/opacity\s*:/)
    })

    it('sets an explicit color (literal hex or var(...)) that clears 4.5:1 against --color-bg', () => {
      const body = block(lookingGlassCss, /\.lg-donut-label \{/)
      const colorMatch = /color\s*:\s*([^;]+);/.exec(body)
      expect(colorMatch).not.toBeNull()
      const light = customProps(block(lookingGlassCss, /^:root \{/m))
      const resolved = resolveToHex(colorMatch![1], light)
      expect(contrastRatio(resolved, light['color-bg'])).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })

    it('does not touch the unrelated .lg-header p opacity (regression guard against overcorrection)', () => {
      const body = block(lookingGlassCss, /^\.lg-header p \{/m)
      expect(body).toMatch(/opacity:\s*0\.75/)
    })
  })

  describe('fix 4 — --text-muted (matrix.css, light rule only) vs all three real surfaces it renders over', () => {
    // The plot itself (.matrix-canvas/.matrix-plot/.matrix-root) sets no solid background-color
    // of its own (.matrix-root's background is `transparent`, and it sits inside App.tsx's
    // `.card.blueprint`, whose background is also `transparent` per looking-glass.css) — so the
    // backdrop that actually shows through behind plot-area text (e.g. `.matrix-zone-lo`) is the
    // page body's `--color-bg`. That is the third surface the SPEC calls "the plot background",
    // distinct from matrix.css's own `--page-plane` and `--surface-1` tokens.
    it('clears 4.5:1 against --page-plane, --surface-1, and the plot backdrop (--color-bg)', () => {
      const matrixLight = customProps(block(matrixCss, /^\.matrix-root,/m))
      const lgLight = customProps(block(lookingGlassCss, /^:root \{/m))
      const textMuted = matrixLight['text-muted']
      expect(contrastRatio(textMuted, matrixLight['page-plane'])).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      )
      expect(contrastRatio(textMuted, matrixLight['surface-1'])).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      )
      expect(contrastRatio(textMuted, lgLight['color-bg'])).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })

    it('does NOT touch the dark --text-muted value (constraint: dark tokens are off-limits)', () => {
      const media = customProps(
        block(matrixCss, /:not\(\[data-theme='light'\]\) \.matrix-root,/),
      )
      const explicitDark = customProps(block(matrixCss, /:root\[data-theme='dark'\] \.matrix-root,/))
      expect(media['text-muted']).toBe('#898781')
      expect(explicitDark['text-muted']).toBe('#898781')
    })
  })

  describe('fix 5 — .matrix-zone-hi repoints color from --series-1 to --text-secondary', () => {
    it('no longer colors itself with var(--series-1)', () => {
      const body = block(matrixCss, /^\.matrix-zone-hi \{/m)
      expect(body).not.toMatch(/color:\s*var\(--series-1\)/)
    })

    it('uses var(--text-secondary) instead', () => {
      const body = block(matrixCss, /^\.matrix-zone-hi \{/m)
      expect(body).toMatch(/color:\s*var\(--text-secondary\)/)
    })

    it('the resulting light color clears 4.5:1 against the plot backdrop (--series-1 currently fails at ~3.5-3.9:1; --text-secondary already clears it)', () => {
      const matrixLight = customProps(block(matrixCss, /^\.matrix-root,/m))
      const lgLight = customProps(block(lookingGlassCss, /^:root \{/m))
      expect(
        contrastRatio(matrixLight['text-secondary'], matrixLight['page-plane']),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      expect(
        contrastRatio(matrixLight['text-secondary'], matrixLight['surface-1']),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      expect(
        contrastRatio(matrixLight['text-secondary'], lgLight['color-bg']),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })
  })

  describe('constraints — nothing else in the token system moves', () => {
    it('--learn-tone is unchanged in both light and dark', () => {
      const light = customProps(block(lookingGlassCss, /^:root \{/m))
      const dark = customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
      expect(light['learn-tone']).toBe('#8a3b12')
      expect(dark['learn-tone']).toBe('#e8a37e')
    })

    it('matrix.css --text-secondary is unchanged in both light and dark', () => {
      const light = customProps(block(matrixCss, /^\.matrix-root,/m))
      const dark = customProps(block(matrixCss, /:root\[data-theme='dark'\] \.matrix-root,/))
      expect(light['text-secondary']).toBe('#52514e')
      expect(dark['text-secondary']).toBe('#c3c2b7')
    })

    it('the whole looking-glass.css dark :root block (media + explicit) is byte-identical to the pre-spec-015 snapshot — a diff-style guard against any dark-token drift, not just have-tone', () => {
      const expectedDarkRoot = {
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
      const media = customProps(block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/))
      const explicitDark = customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
      expect(media).toEqual(expectedDarkRoot)
      expect(explicitDark).toEqual(expectedDarkRoot)
    })

    it('the whole matrix.css dark block (media + explicit) is byte-identical to the pre-spec-015 snapshot — a diff-style guard against any dark-token drift, not just text-muted', () => {
      const expectedMatrixDark = {
        'surface-1': '#1a1a19',
        'page-plane': '#0d0d0d',
        'text-primary': '#ffffff',
        'text-secondary': '#c3c2b7',
        'text-muted': '#898781',
        gridline: '#2c2c2a',
        baseline: '#383835',
        border: 'rgba(255, 255, 255, 0.1)',
        'series-1': '#3987e5',
        'series-2': '#d95926',
        'series-3': '#199e70',
        'series-4': '#c98500',
        'status-good': 'var(--have-tone)',
        'status-good-surface': 'var(--have-tone-surface)',
        'status-critical': 'var(--learn-tone)',
        'status-critical-surface': 'var(--learn-tone-surface)',
      }
      const media = customProps(
        block(matrixCss, /:not\(\[data-theme='light'\]\) \.matrix-root,/),
      )
      const explicitDark = customProps(block(matrixCss, /:root\[data-theme='dark'\] \.matrix-root,/))
      expect(media).toEqual(expectedMatrixDark)
      expect(explicitDark).toEqual(expectedMatrixDark)
    })
  })
})

describe('spec 008 — shared --have-tone / --learn-tone tokens', () => {
  describe('looking-glass.css is the single source of truth', () => {
    it("light :root defines --have-tone/--learn-tone (+ -surface) reusing matrix.css's tuned light values", () => {
      const props = customProps(block(lookingGlassCss, /^:root \{/m))
      expect(props['have-tone']).toBe(LIGHT_HAVE)
      expect(props['have-tone-surface']).toBe(LIGHT_HAVE_SURFACE)
      expect(props['learn-tone']).toBe(LIGHT_LEARN)
      expect(props['learn-tone-surface']).toBe(LIGHT_LEARN_SURFACE)
    })

    it('the prefers-color-scheme dark override defines the dark have/learn values', () => {
      const props = customProps(
        block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/),
      )
      expect(props['have-tone']).toBe(DARK_HAVE)
      expect(props['have-tone-surface']).toBe(DARK_HAVE_SURFACE)
      expect(props['learn-tone']).toBe(DARK_LEARN)
      expect(props['learn-tone-surface']).toBe(DARK_LEARN_SURFACE)
    })

    it('the unconditional [data-theme="dark"] override stays byte-identical to the prefers-color-scheme override — the exact desync spec 007 already caught once, now guarded for a different token pair', () => {
      const media = customProps(
        block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/),
      )
      const explicitDark = customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
      for (const key of ['have-tone', 'have-tone-surface', 'learn-tone', 'learn-tone-surface']) {
        expect(explicitDark[key]).toBe(media[key])
      }
    })

    it('never introduces a third naming scheme beyond have-tone/learn-tone (+ -surface)', () => {
      const lightProps = Object.keys(customProps(block(lookingGlassCss, /^:root \{/m)))
      const haveLearnKeys = lightProps.filter((k) => /have|learn/.test(k))
      expect(new Set(haveLearnKeys)).toEqual(
        new Set(['have-tone', 'have-tone-surface', 'learn-tone', 'learn-tone-surface']),
      )
    })

    it('leaves the neutral "not scored yet" token untouched (it has no have/learn semantic)', () => {
      const light = customProps(block(lookingGlassCss, /^:root \{/m))
      const dark = customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
      expect(light['color-neutral-400']).toBe('#b7b7ba')
      expect(dark['color-neutral-400']).toBe('#565a60')
    })
  })

  describe('matrix.css stops redeclaring its own have/critical color values', () => {
    const oldHardcodedHexValues = [
      LIGHT_HAVE,
      LIGHT_HAVE_SURFACE,
      LIGHT_LEARN,
      LIGHT_LEARN_SURFACE,
      DARK_HAVE,
      DARK_HAVE_SURFACE,
      DARK_LEARN,
      DARK_LEARN_SURFACE,
    ]

    it('no longer hardcodes any of the old status-good/status-critical hex literals in any theme block', () => {
      for (const hex of oldHardcodedHexValues) {
        expect(matrixCss).not.toContain(hex)
      }
    })

    it("the light rule's have/critical declarations resolve through the shared tokens", () => {
      const body = block(matrixCss, /^\.matrix-root,/m)
      expect(body).toMatch(/var\(--have-tone\)/)
      expect(body).toMatch(/var\(--have-tone-surface\)/)
      expect(body).toMatch(/var\(--learn-tone\)/)
      expect(body).toMatch(/var\(--learn-tone-surface\)/)
    })

    it('the prefers-color-scheme dark rule resolves through the shared tokens, not fresh hex', () => {
      const body = block(matrixCss, /:not\(\[data-theme='light'\]\) \.matrix-root,/)
      expect(body).toMatch(/var\(--have-tone\)/)
      expect(body).toMatch(/var\(--have-tone-surface\)/)
      expect(body).toMatch(/var\(--learn-tone\)/)
      expect(body).toMatch(/var\(--learn-tone-surface\)/)
    })

    it('the unconditional [data-theme="dark"] rule resolves through the shared tokens, not fresh hex', () => {
      const body = block(matrixCss, /:root\[data-theme='dark'\] \.matrix-root,/)
      expect(body).toMatch(/var\(--have-tone\)/)
      expect(body).toMatch(/var\(--have-tone-surface\)/)
      expect(body).toMatch(/var\(--learn-tone\)/)
      expect(body).toMatch(/var\(--learn-tone-surface\)/)
    })

    it('the have/gap flag and Status column usage sites resolve to the shared tokens, directly or via an alias — never a hardcoded color', () => {
      // These are the exact rules the SPEC's "reinforcement only" a11y notes describe: the
      // colour is never the only channel, but it still must trace to one shared source.
      const haveFlag = /\.matrix-point\[data-have='true'\] \.matrix-point-flag \{([^}]*)\}/.exec(
        matrixCss,
      )?.[1]
      const learnFlag = /\.matrix-point\[data-have='false'\] \.matrix-point-flag \{([^}]*)\}/.exec(
        matrixCss,
      )?.[1]
      const haveStatus = /\.lev-status\[data-have='true'\] \{([^}]*)\}/.exec(matrixCss)?.[1]
      const learnStatus = /\.lev-status\[data-have='false'\] \{([^}]*)\}/.exec(matrixCss)?.[1]

      expect(haveFlag).toBeDefined()
      expect(learnFlag).toBeDefined()
      expect(haveStatus).toBeDefined()
      expect(learnStatus).toBeDefined()

      for (const hex of oldHardcodedHexValues) {
        expect(haveFlag).not.toContain(hex)
        expect(learnFlag).not.toContain(hex)
        expect(haveStatus).not.toContain(hex)
        expect(learnStatus).not.toContain(hex)
      }
    })
  })
})
