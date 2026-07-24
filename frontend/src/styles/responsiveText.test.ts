// Spec 016 — fix the two confirmed instances where a flex/grid child carrying real (often
// dynamic) text cannot shrink below its intrinsic content width, causing overflow or an awkward
// break instead of smooth wrapping:
//   1. .topmove (matrix.css) — a grid row of [rank badge | name/note/stats column]. The second
//      track is `1fr`, which — per CSS grid's default `min-width: auto` on grid items — refuses
//      to shrink below the intrinsic (unbroken) width of its longest text content
//      (`.topmove-name`, which carries `skill_name_raw`: resume/dataset-driven, unbounded length).
//      Fix: `grid-template-columns: 1.5rem minmax(0, 1fr)` + `overflow-wrap: anywhere` on
//      `.topmove-name` and `.topmove-note`, matching the existing pattern already used on
//      `.lev-skill` / `.lg-results-title`.
//   2. .nav-brand (looking-glass.css) — a row flex child of `.nav` (itself a row flex) that is
//      ALSO itself a row flex of [wordmark text, "PIVOT ENGINE" tag pill]. Fix: `min-width: 0` (so
//      it can shrink inside `.nav`) + `flex-wrap: wrap` (so the pill can drop to its own line
//      before the wordmark is forced to overflow).
//
// These are plain-CSS content assertions read directly off the stylesheet text — same pattern as
// colorTokens.test.ts — because neither file goes through a build step that would let a
// component-render test observe the resolved layout box model.
//
// All tests in this file are RED until Redwood/Magnolia make the two edits above.
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

/** Finds the `{ ... }` block whose selector text matches `selectorPattern`, using brace-depth
 * counting from the first `{` after the match. Copied verbatim from colorTokens.test.ts's helper
 * of the same name/contract — these files are flat, hand-authored rule lists with no nesting
 * inside a single rule body, so this is exact for this purpose while staying immune to incidental
 * whitespace/formatting differences. */
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

describe('spec 016 fix 1 — .topmove grid track cannot shrink below .topmove-name intrinsic width (matrix.css)', () => {
  it(".topmove's second grid track is minmax(0, 1fr), not a bare 1fr (the default min-width:auto on grid items is the overflow bug)", () => {
    const body = block(matrixCss, /^\.topmove \{/m)
    const gridMatch = /grid-template-columns\s*:\s*([^;]+);/.exec(body)
    expect(gridMatch).not.toBeNull()
    expect(gridMatch![1].trim()).toBe('1.5rem minmax(0, 1fr)')
  })

  it('.topmove-name sets overflow-wrap: anywhere (carries skill_name_raw — resume/dataset-driven, unbounded length)', () => {
    const body = block(matrixCss, /^\.topmove-name \{/m)
    expect(body).toMatch(/overflow-wrap\s*:\s*anywhere\s*;/)
  })

  it('.topmove-note sets overflow-wrap: anywhere (matching the .lev-skill / .lg-results-title pattern)', () => {
    const body = block(matrixCss, /^\.topmove-note \{/m)
    expect(body).toMatch(/overflow-wrap\s*:\s*anywhere\s*;/)
  })

  it('regression guard: .matrix-canvas (an unrelated grid) keeps its plain 1fr track — the fix is scoped to .topmove only, not a blanket minmax(0, 1fr) sweep', () => {
    const body = block(matrixCss, /^\.matrix-canvas \{/m)
    const gridMatch = /grid-template-columns\s*:\s*([^;]+);/.exec(body)
    expect(gridMatch).not.toBeNull()
    expect(gridMatch![1].trim()).toBe('1.5rem 1fr')
  })

  it("constraint regression guard: .leverage-table's white-space: nowrap / horizontal-scroll design is untouched (intentional, not a bug)", () => {
    const body = block(matrixCss, /^\.leverage-table \{/m)
    expect(body).toMatch(/min-width\s*:\s*660px\s*;/)
    const cellBody = block(matrixCss, /^\.leverage-table th,\n\.leverage-table td \{/m)
    expect(cellBody).toMatch(/white-space\s*:\s*nowrap\s*;/)
  })
})

describe('spec 016 fix 2 — .nav-brand cannot shrink inside .nav, and cannot itself wrap its wordmark + pill (looking-glass.css)', () => {
  it('.nav-brand sets min-width: 0 (flex item of the row-flex .nav)', () => {
    const body = block(lookingGlassCss, /^\.nav-brand \{/m)
    expect(body).toMatch(/min-width\s*:\s*0\s*;/)
  })

  it('.nav-brand sets flex-wrap: wrap (itself a row flex of the wordmark + the "PIVOT ENGINE" tag pill)', () => {
    const body = block(lookingGlassCss, /^\.nav-brand \{/m)
    expect(body).toMatch(/flex-wrap\s*:\s*wrap\s*;/)
  })

  it('regression guard: .nav-brand keeps display: flex and align-items: baseline (only min-width/flex-wrap are added, nothing else changes)', () => {
    const body = block(lookingGlassCss, /^\.nav-brand \{/m)
    expect(body).toMatch(/display\s*:\s*flex\s*;/)
    expect(body).toMatch(/align-items\s*:\s*baseline\s*;/)
  })

  it('regression guard: .nav (the parent row flex) already sets flex-wrap: wrap and is untouched by this spec', () => {
    const body = block(lookingGlassCss, /^\.nav \{/m)
    expect(body).toMatch(/flex-wrap\s*:\s*wrap\s*;/)
  })
})
