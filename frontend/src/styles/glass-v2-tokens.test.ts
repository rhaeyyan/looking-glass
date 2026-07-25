// Spec 018 — the "glass v2" token-layer overhaul: --ink/--ink-2/--ink-3 text hierarchy,
// --accent/--accent-soft/--series, --have/--have-soft/--learn/--learn-soft, two translucency
// levels (--glass/--glass-2, replacing spec 017's single --glass-tint/--glass-alpha/--glass-blur),
// --brd/--brd-2, --hi, --shadow/--shadow-lg, --plot, --grid, --page, --on-accent, --chip-bg/
// --chip-fg, --edge/--edge-b, --sheen-a/--sheen-b, --metal-hi — landed with REAL (non-inert)
// values in BOTH light and dark theme blocks, plus two decorative drifting "orb" pseudo-elements
// behind the page background.
//
// This suite is deliberately RED until Redwood/Magnolia implement the SPEC in
// looking-glass.css: none of the new custom properties exist in the current stylesheet, so every
// `customProps(...)` lookup below resolves to `undefined` and the assertions fail. It reuses the
// exact `contrastRatio` / `hexToRgb` / `resolveToHex` helpers from colorTokens.test.ts (spec 015)
// per the SPEC's Forces ("Deterministic, testable contrast guarantee ... > visual-judgment-call
// glass tuning"), and mirrors glassmorphism.test.ts's (spec 017) local `block`/`customProps`
// CSS-text-parsing approach, since there is no real DOM/CSSOM available in this Vitest
// environment.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { contrastRatio, hexToRgb, resolveToHex } from './colorTokens.test'

const STYLES_DIR = path.dirname(fileURLToPath(import.meta.url))
const CSS_PATH = path.join(STYLES_DIR, 'looking-glass.css')
const lookingGlassCss = readFileSync(CSS_PATH, 'utf-8')
const matrixCss = readFileSync(
  path.join(STYLES_DIR, '..', 'components', 'matrix', 'matrix.css'),
  'utf-8',
)

const AA_NORMAL_TEXT = 4.5

/** Finds the `{ ... }` block for a selector pattern via brace-depth counting (mirrors the helper
 * duplicated in colorTokens.test.ts / glassmorphism.test.ts — kept local here for the same reason
 * those two keep their own copies: it's a generic parsing utility, not "the shared contrast
 * helper" the SPEC calls out for reuse). */
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

function lightRoot(): Record<string, string> {
  return customProps(block(lookingGlassCss, /^:root \{/m))
}
function darkMediaRoot(): Record<string, string> {
  return customProps(block(lookingGlassCss, /:root:not\(\[data-theme='light'\]\) \{/))
}
function darkExplicitRoot(): Record<string, string> {
  return customProps(block(lookingGlassCss, /^:root\[data-theme='dark'\] \{/m))
}

/** Parses an `rgba(r, g, b, a)` (or `rgb(r, g, b)`, alpha defaulting to 1) declaration value into
 * a `[r, g, b, a]` tuple. Throws a descriptive error — rather than returning garbage — if the
 * token doesn't exist yet or isn't in this literal form, matching the "RED for the right reason"
 * failure mode expected before implementation. */
function parseRgba(raw: string | undefined, tokenName: string): [number, number, number, number] {
  if (raw === undefined) {
    throw new Error(
      `Expected token --${tokenName} to be defined as an rgba()/rgb() literal — not found. ` +
        'This is the expected RED state before spec 018 is implemented.',
    )
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    raw.trim(),
  )
  if (!m) {
    throw new Error(`--${tokenName}: expected an rgba()/rgb() literal, got: ${raw}`)
  }
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
}

/** Alpha-composites a translucent rgba tuple over an opaque hex backdrop, per the same
 * `tint*alpha + backdrop*(1-alpha)` formula spec 017's glassmorphism.test.ts established. */
function compositeOverBackdrop(rgba: [number, number, number, number], backdropHex: string): string {
  const [r, g, b, a] = rgba
  const backdrop = hexToRgb(backdropHex)
  const channel = (tint: number, i: number) => Math.round(tint * a + backdrop[i] * (1 - a))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(channel(r, 0))}${toHex(channel(g, 1))}${toHex(channel(b, 2))}`
}

// ── Canonical token values, transcribed verbatim from the SPEC ──────────────────────────────

// --ink-3's SPEC hex (#6b7784 light / #8b96a3 dark) falls just short of 4.5:1 in 3 of the 12
// composited cases below (light on --glass: 4.33:1, light on --glass-2: 4.41:1, dark on
// --glass-2: 4.38:1). Per explicit human decision, this is resolved by nudging the hex — darker
// in light mode, lighter in dark mode — by the smallest per-channel step that clears AA in every
// composited case, rather than keeping the exact (slightly-failing) mockup value or jumping to an
// arbitrary "safe" gray. Found by incrementally stepping all three RGB channels by 1 (light:
// darken; dark: lighten) and re-checking `contrastRatio` against every composited backdrop until
// all 12 cases clear 4.5:1 — 3 steps in each direction was sufficient:
//   light #6b7784 -> #687481 (vs --glass: 4.52:1, vs --glass-2: 4.60:1)
//   dark  #8b96a3 -> #8e99a6 (vs --glass: 4.83:1, vs --glass-2: 4.55:1)
// --have's SPEC hex (#1a7a4b, spec 018's original value) later got a second, independent nudge
// under spec 022: the leverage table's "Already have" pill pairs solid --have against --have-soft
// (rgba(26,122,75,0.14), left untouched) composited over --surface-1/--color-bg — that specific
// pairing measured exactly 4.3017:1, just under the 4.5:1 AA floor, and contrastRatio is symmetric
// so no property-assignment swap within the --status-good family could fix it. Same minimal-nudge
// methodology as --ink-3 above: darkening --have by 1-unit-per-channel steps until the pairing
// clears AA. 3 steps (#177748) still measured 4.485:1 (just short); 4 steps was sufficient:
//   light #1a7a4b -> #167647 (26,122,75 -> 22,118,71; vs composited --have-soft: 4.548:1)
// --have-soft, and both dark-mode --have/--have-soft, are untouched by spec 022.
const LIGHT_TOKENS: Record<string, string> = {
  ink: '#16202b',
  'ink-2': '#4a5765',
  'ink-3': '#687481',
  accent: '#2f5a86',
  'accent-soft': '#416180',
  series: '#2a78d6',
  have: '#167647',
  'have-soft': 'rgba(26,122,75,0.14)',
  learn: '#8a3b12',
  'learn-soft': 'rgba(138,59,18,0.14)',
  glass: 'rgba(255,255,255,0.55)',
  'glass-2': 'rgba(255,255,255,0.72)',
  brd: 'rgba(255,255,255,0.8)',
  'brd-2': 'rgba(22,32,43,0.09)',
  hi: 'rgba(255,255,255,0.9)',
  shadow: '0 10px 34px rgba(21,38,58,0.13)',
  'shadow-lg': '0 22px 60px rgba(21,38,58,0.18)',
  plot: 'rgba(255,255,255,0.62)',
  grid: 'rgba(22,32,43,0.08)',
  page: '#eef1f6',
  'on-accent': '#ffffff',
  'chip-bg': 'rgba(47,90,134,0.10)',
  'chip-fg': '#2f5a86',
  edge: 'rgba(255,255,255,0.95)',
  'edge-b': 'rgba(22,32,43,0.12)',
  'sheen-a': 'rgba(255,255,255,0.5)',
  'sheen-b': 'rgba(255,255,255,0.14)',
  'metal-hi': 'rgba(255,255,255,0.55)',
}

const DARK_TOKENS: Record<string, string> = {
  ink: '#eef1f4',
  'ink-2': '#aeb8c4',
  'ink-3': '#8e99a6',
  accent: '#8fbcea',
  'accent-soft': '#7fb0e0',
  series: '#5c9dea',
  have: '#63d69a',
  'have-soft': 'rgba(99,214,154,0.16)',
  learn: '#e8a37e',
  'learn-soft': 'rgba(232,163,126,0.16)',
  glass: 'rgba(126,152,184,0.187)',
  'glass-2': 'rgba(126,152,184,0.22)',
  brd: 'rgba(255,255,255,0.16)',
  'brd-2': 'rgba(255,255,255,0.1)',
  hi: 'rgba(255,255,255,0.34)',
  shadow: '0 12px 38px rgba(0,0,0,0.4)',
  'shadow-lg': '0 26px 70px rgba(0,0,0,0.5)',
  plot: 'rgba(16,22,30,0.42)',
  grid: 'rgba(255,255,255,0.07)',
  page: '#0e141b',
  'on-accent': '#ffffff',
  'chip-bg': 'rgba(143,188,234,0.16)',
  'chip-fg': '#cfe4fb',
  edge: 'rgba(255,255,255,0.34)',
  'edge-b': 'rgba(0,0,0,0.45)',
  'sheen-a': 'rgba(255,255,255,0.16)',
  'sheen-b': 'rgba(255,255,255,0.04)',
  'metal-hi': 'rgba(255,255,255,0.22)',
}

/** Normalizes a declaration value for equality comparison — collapses internal whitespace so
 * `rgba(255, 255, 255, .55)`-style formatting differences from the spec's compact
 * `rgba(255,255,255,0.55)` literal don't produce false negatives. Numeric formatting quirks
 * (`.5` vs `0.5`, trailing zeros) are normalized by round-tripping any bare numbers through
 * `Number(...)`. */
function normalizeValue(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/-?\d*\.?\d+/g, (n) => String(Number(n)))
    .toLowerCase()
}

describe('spec 018 — glass v2 token layer (RED until looking-glass.css is rewritten)', () => {
  describe('light :root defines every new token at its exact spec value', () => {
    for (const [name, expected] of Object.entries(LIGHT_TOKENS)) {
      it(`--${name}`, () => {
        const light = lightRoot()
        expect(light[name]).toBeDefined()
        expect(normalizeValue(light[name])).toBe(normalizeValue(expected))
      })
    }
  })

  describe('dark theme (BOTH the prefers-color-scheme media block AND the explicit [data-theme="dark"] block) defines every new token at its exact spec value — this supersedes spec 017\'s dark-mode-inert constraint', () => {
    for (const [name, expected] of Object.entries(DARK_TOKENS)) {
      it(`--${name} (media block)`, () => {
        const dark = darkMediaRoot()
        expect(dark[name]).toBeDefined()
        expect(normalizeValue(dark[name])).toBe(normalizeValue(expected))
      })
      it(`--${name} (explicit [data-theme='dark'] block)`, () => {
        const dark = darkExplicitRoot()
        expect(dark[name]).toBeDefined()
        expect(normalizeValue(dark[name])).toBe(normalizeValue(expected))
      })
    }

    it('the media block and the explicit block never desync for any new token (the exact spec 007 class of bug, guarded here for the new token family)', () => {
      const media = darkMediaRoot()
      const explicitDark = darkExplicitRoot()
      for (const name of Object.keys(DARK_TOKENS)) {
        expect(normalizeValue(media[name] ?? '')).toBe(normalizeValue(explicitDark[name] ?? ''))
      }
    })

    it('dark --glass/--glass-2 are NOT inert (non-zero alpha) — explicitly supersedes spec 017\'s --glass-alpha: 0 / --glass-blur: 0 dark constraint, per the SPEC\'s explicit human approval', () => {
      const media = darkMediaRoot()
      const [, , , glassAlpha] = parseRgba(media['glass'], 'glass')
      const [, , , glass2Alpha] = parseRgba(media['glass-2'], 'glass-2')
      expect(glassAlpha).toBeGreaterThan(0)
      expect(glass2Alpha).toBeGreaterThan(0)
    })
  })

  describe('backward-compat aliases — --have-tone/--learn-tone/-surface point at the new tokens instead of being deleted', () => {
    const aliasMap: Record<string, string> = {
      'have-tone': 'have',
      'have-tone-surface': 'have-soft',
      'learn-tone': 'learn',
      'learn-tone-surface': 'learn-soft',
    }

    describe('light :root', () => {
      for (const [alias, target] of Object.entries(aliasMap)) {
        it(`--${alias} is declared as var(--${target})`, () => {
          const light = lightRoot()
          expect(light[alias]).toBeDefined()
          expect(light[alias].replace(/\s+/g, '')).toBe(`var(--${target})`)
        })
      }

      it('--have-tone / --learn-tone resolve (through the alias) to the same hex as the new --have / --learn tokens', () => {
        const light = lightRoot()
        expect(resolveToHex(light['have-tone'], light)).toBe(LIGHT_TOKENS.have)
        expect(resolveToHex(light['learn-tone'], light)).toBe(LIGHT_TOKENS.learn)
      })
    })

    for (const [label, getRoot, expectedTokens] of [
      ['dark media block', darkMediaRoot, DARK_TOKENS],
      ['dark explicit block', darkExplicitRoot, DARK_TOKENS],
    ] as const) {
      describe(label, () => {
        for (const [alias, target] of Object.entries(aliasMap)) {
          it(`--${alias} is declared as var(--${target})`, () => {
            const dark = getRoot()
            expect(dark[alias]).toBeDefined()
            expect(dark[alias].replace(/\s+/g, '')).toBe(`var(--${target})`)
          })
        }

        it('--have-tone / --learn-tone resolve (through the alias) to the same hex as the new dark --have / --learn tokens', () => {
          const dark = getRoot()
          expect(resolveToHex(dark['have-tone'], dark)).toBe(expectedTokens.have)
          expect(resolveToHex(dark['learn-tone'], dark)).toBe(expectedTokens.learn)
        })
      })
    }

    it('matrix.css is untouched by this task (still consumes --have-tone/--learn-tone, never a fresh --have/--learn reference of its own)', () => {
      expect(matrixCss).toMatch(/var\(--have-tone\)/)
      expect(matrixCss).toMatch(/var\(--learn-tone\)/)
      expect(matrixCss).not.toMatch(/var\(--have\)/)
      expect(matrixCss).not.toMatch(/var\(--learn\)/)
    })
  })

  describe('composited-surface contrast — every --ink* text token vs --glass/--glass-2 alpha-composited over --page (the core invariant; NOT assumed to carry over from light to dark)', () => {
    const cases = [
      ['light', lightRoot, LIGHT_TOKENS] as const,
      ['dark', darkMediaRoot, DARK_TOKENS] as const,
    ]
    const inkNames = ['ink', 'ink-2', 'ink-3']
    const glassNames = ['glass', 'glass-2']

    for (const [themeName, getRoot] of cases) {
      for (const glassName of glassNames) {
        for (const inkName of inkNames) {
          it(`${themeName}: --${inkName} on --${glassName} composited over --page clears 4.5:1`, () => {
            const tokens = getRoot()
            const pageHex = tokens['page']
            expect(pageHex).toBeDefined()
            const glassRgba = parseRgba(tokens[glassName], glassName)
            const compositedBg = compositeOverBackdrop(glassRgba, pageHex)
            const inkHex = resolveToHex(tokens[inkName], tokens)
            expect(contrastRatio(inkHex, compositedBg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
          })
        }
      }
    }
  })

  describe('page background + decorative orbs', () => {
    it('body background is repointed at --page (not the old flat --color-bg)', () => {
      const body = block(lookingGlassCss, /^body \{/m)
      expect(body).toMatch(/background(-color)?\s*:\s*var\(--page\)/)
    })

    it('h1/h2 (and body text color) are repointed at the new --ink hierarchy, not --color-text', () => {
      const bodyRule = block(lookingGlassCss, /^body \{/m)
      expect(bodyRule).toMatch(/color\s*:\s*var\(--ink\)/)
    })

    it('defines two decorative "orb" layers (body::before/::after, or a single fixed decorative container) using radial-gradient, positioned fixed so they sit behind real content', () => {
      const orbBefore = /body::before\s*\{([^}]*)\}/.exec(lookingGlassCss)
      const orbAfter = /body::after\s*\{([^}]*)\}/.exec(lookingGlassCss)
      const singleContainer = /\.lg-orbs?\s*\{([^}]*)\}/.exec(lookingGlassCss)

      const hasTwoPseudoOrbs = Boolean(orbBefore && orbAfter)
      const hasSingleContainer = Boolean(singleContainer)
      expect(hasTwoPseudoOrbs || hasSingleContainer).toBe(true)

      const bodies = hasTwoPseudoOrbs
        ? [orbBefore![1], orbAfter![1]]
        : [singleContainer![1]]
      for (const body of bodies) {
        expect(body).toMatch(/radial-gradient/)
        expect(body).toMatch(/position\s*:\s*fixed/)
      }
    })

    it('orbs are pure CSS decoration — no aria-hidden attribute selector or new semantic markup dependency appears in the stylesheet for them (still just ::before/::after or a plain class)', () => {
      // A pure-CSS pseudo-element/decorative-container approach never needs to *select* on
      // aria-hidden (that would imply real DOM elements the SPEC says must not exist).
      expect(lookingGlassCss).not.toMatch(/\[aria-hidden(=|\])[^{]*orb/i)
    })

    it('orb drift+scale animation only runs inside @media (prefers-reduced-motion: no-preference) — no unconditional animation/transition on the orb layers', () => {
      const orbSelectorRe = /(body::before|body::after|\.lg-orbs?)\s*\{([^}]*)\}/g
      let m: RegExpExecArray | null
      let foundAny = false
      while ((m = orbSelectorRe.exec(lookingGlassCss))) {
        foundAny = true
        const body = m[2]
        // No bare (unguarded) animation/transform-driving declaration directly inside the base
        // rule body itself.
        expect(body).not.toMatch(/animation\s*:/)
      }
      expect(foundAny).toBe(true)

      // The animation must exist SOMEWHERE, but only inside a reduced-motion "no-preference"
      // guard (mirrors the existing .lg-fade / .lg-skeleton-shimmer convention already in this
      // file).
      const guardedOrbAnimation =
        /@media \(prefers-reduced-motion: no-preference\) \{[^}]*(?:body::before|body::after|\.lg-orbs?)[^}]*\{[^}]*animation\s*:/s.test(
          lookingGlassCss,
        )
      expect(guardedOrbAnimation).toBe(true)
    })

    it('the guarded orb animation uses translate3d/scale-style transform keyframes (drift + scale), not a static/no-op animation', () => {
      const reducedMotionBlock = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*)$/.exec(
        lookingGlassCss,
      )
      expect(reducedMotionBlock).not.toBeNull()
      const animationNameMatch = /(?:body::before|body::after|\.lg-orbs?)[^}]*\{[^}]*animation:\s*([\w-]+)/.exec(
        lookingGlassCss,
      )
      expect(animationNameMatch).not.toBeNull()
      const keyframesBlock = new RegExp(`@keyframes ${animationNameMatch![1]} \\{([\\s\\S]*?)\\n\\}`, 'm').exec(
        lookingGlassCss,
      )
      expect(keyframesBlock).not.toBeNull()
      expect(keyframesBlock![1]).toMatch(/translate3d|scale/)
    })
  })

  describe('constraints — this task never leaks into unrelated files or the scoring/gap/join layer', () => {
    it('does not modify --radius-md (deliberately deferred to specs 019-022, per the SPEC)', () => {
      const light = lightRoot()
      expect(light['radius-md']).toBe('4px')
    })

    it('the font @import still covers every weight the new design uses (Poppins 400/500/600/700, Inter 300-700, JetBrains Mono 400/500/600) — verified, not silently dropped', () => {
      // Matched to end-of-line (not up to the first `;`) because the Google Fonts URL itself
      // contains literal `;` separators between weight values (e.g. `wght@400;500;600;700`), so a
      // `[^;]*` character class would truncate the match well before the real end of the
      // `@import` statement.
      const importLine = /@import[^\n]*fonts\.googleapis\.com[^\n]*;/.exec(lookingGlassCss)
      expect(importLine).not.toBeNull()
      expect(importLine![0]).toMatch(/Poppins:wght@400;500;600;700/)
      expect(importLine![0]).toMatch(/Inter:wght@300;400;500;600;700/)
      expect(importLine![0]).toMatch(/JetBrains\+Mono:wght@400;500;600/)
    })

    it('matrix.css is not touched by this task (byte-for-byte identical to its current on-disk content at test-authoring time is out of scope here, but no new glass-v2 token name may appear in it) — except --chip-bg/--chip-fg, spec-020-authorized', () => {
      // A negative lookahead (rather than a bare `\b`) guards against false positives on
      // matrix.css's own pre-existing, differently-scoped tokens that happen to share a prefix
      // (e.g. --series-1..4 vs the new --series; \b alone matches at the letter/hyphen boundary
      // inside "series-1" too, since a hyphen is a non-word character).
      //
      // --chip-bg/--chip-fg are excluded from this guard: spec 018's "do not touch matrix.css"
      // constraint bound spec 018 itself, not every future spec. Spec 020's Constraints
      // explicitly requires ".topmove-stat restyle to --chip-bg/--chip-fg in both themes" inside
      // matrix.css — a deliberate, spec-authorized extension, not accidental leakage.
      //
      // --plot / --grid / --metal-hi are ALSO excluded, spec-021-authorized: spec 021's
      // Inputs/Outputs explicitly requires ".matrix-plot"/".matrix-point" to gain a brushed-metal
      // gradient-banded fill and a glass plot backdrop built from these three tokens. (--radius-card
      // is not in LIGHT_TOKENS/this guard at all — it lives in a later, unrelated :root block — so
      // spec 021 reusing it on .matrix-root needs no exception here.)
      //
      // Every other spec-018 token name remains guarded: if matrix.css ever picks up --ink,
      // --glass, --have, etc. unintentionally, this must still fail.
      const authorizedExceptions = new Set(['chip-bg', 'chip-fg', 'plot', 'grid', 'metal-hi'])
      for (const name of Object.keys(LIGHT_TOKENS)) {
        if (authorizedExceptions.has(name)) continue
        expect(matrixCss).not.toMatch(new RegExp(`--${name}(?![\\w-])`))
      }
    })
  })
})

describe('spec 018 — Bounded-AI boundary: no scoring/gap/join file is touched by this presentation-only change', () => {
  it('no frontend/src/lib file references any of the new glass-v2 tokens (this task is CSS-only; scoring/gap logic must stay untouched)', () => {
    // Real enforcement of "no lib/ file appears in the implementation changeset" is a
    // `git diff --name-only` check Cypress runs at audit time (post-implementation), not
    // something expressible as a Vitest assertion pre-implementation. This test instead pins the
    // static invariant that IS expressible now: none of the new token names leak into any
    // existing `lib/` source file's text, so an accidental import/usage would fail loudly here
    // even before an audit-time diff is run.
    const libDir = path.join(STYLES_DIR, '..', 'lib')
    const files = readdirSync(libDir, { recursive: true }) as string[]
    const sourceFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|\.spec\./.test(f))
    expect(sourceFiles.length).toBeGreaterThan(0)

    for (const file of sourceFiles) {
      const contents = readFileSync(path.join(libDir, file), 'utf-8')
      for (const name of Object.keys(LIGHT_TOKENS)) {
        expect(contents).not.toMatch(new RegExp(`--${name}\\b`))
      }
    }
  })
})
