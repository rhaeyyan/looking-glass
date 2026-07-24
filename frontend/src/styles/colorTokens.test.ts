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

/** The exact light/dark hex values matrix.css already tuned for AA contrast in both themes,
 * pre-spec-008. The spec requires the new shared tokens reuse these values verbatim rather than
 * inventing new ones — so these constants double as both "what --have-tone/--learn-tone must
 * equal in looking-glass.css" and "what matrix.css must stop hardcoding". */
const LIGHT_HAVE = '#1a7f4b'
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
