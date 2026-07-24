// Spec 010 (specs/010-scatter-legend-touch-motion.md) — CSS-structural contract for the two
// additions that live purely (or mostly) in stylesheet rules rather than component markup:
//
//   (2) tap-reveal must be ADDITIVE to the existing hover/:focus-visible reveal triggers — never a
//       replacement — so a `[data-revealed='true']` selector must union with, not clobber, the
//       `:hover` / `:focus-visible` rule already in place.
//   (3) the settle-in transition on role change must live INSIDE the existing
//       `@media (prefers-reduced-motion: no-preference)` gate around `.matrix-point`, transitioning
//       the position properties (`left`/`bottom`) the scatter already uses for placement — and the
//       BASE (non-gated) `.matrix-point` rule must keep zero `transition` declaration, so a
//       reduced-motion user still gets zero animation, exactly as today.
//
// These are plain-CSS content assertions (no build step touches matrix.css), mirroring the
// established pattern in `frontend/src/styles/colorTokens.test.ts`. RED phase: matrix.css does not
// yet contain a `data-revealed` selector, and the reduced-motion `.matrix-point` transition list
// does not yet include the position properties — every assertion below currently fails.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MATRIX_DIR = path.dirname(fileURLToPath(import.meta.url))
const matrixCss = readFileSync(path.join(MATRIX_DIR, 'matrix.css'), 'utf-8')

/** Finds the `{ ... }` block whose selector text matches `selectorPattern`, using brace-depth
 *  counting from the first `{` after the match. Copied from colorTokens.test.ts's helper — these
 *  files are flat, hand-authored rule lists with no nesting inside a single rule body, so this is
 *  exact for this purpose while staying immune to incidental whitespace/formatting differences. */
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

describe('spec 010 — tap-reveal CSS is additive to hover/focus (never replaces them)', () => {
  it('keeps the original hover/:focus-visible reveal rule intact', () => {
    expect(matrixCss).toContain('.matrix-point:hover .matrix-point-label')
    expect(matrixCss).toContain('.matrix-point:focus-visible .matrix-point-label')
  })

  it('adds a [data-revealed="true"] selector that also forces the label opaque (union, not override)', () => {
    // Accepts either a standalone rule or the selector folded into the existing comma-list; either
    // way the literal attribute selector text must be present, paired somewhere with `opacity: 1`.
    const selectorRe = /\.matrix-point\[data-revealed=['"]true['"]\]\s+\.matrix-point-label/
    expect(matrixCss).toMatch(selectorRe)

    const match = selectorRe.exec(matrixCss)
    expect(match).not.toBeNull()
    // Find the enclosing rule body (from the selector match forward to the next `}`) and confirm
    // it sets the label fully opaque, same as the hover/focus rule does.
    const from = match!.index
    const closeBrace = matrixCss.indexOf('}', from)
    const ruleBody = matrixCss.slice(matrixCss.indexOf('{', from) + 1, closeBrace)
    expect(ruleBody).toMatch(/opacity:\s*1\s*;?/)
  })
})

describe('spec 010 — settle-in transition stays behind the existing prefers-reduced-motion gate', () => {
  it('the BASE (non-gated) .matrix-point rule declares no transition at all', () => {
    const baseBody = block(matrixCss, /^\.matrix-point \{/m)
    expect(baseBody).not.toMatch(/transition\s*:/)
  })

  it("the no-preference media query's .matrix-point rule transitions left/bottom (position), not just transform/opacity", () => {
    const reducedMotionBlock = block(
      matrixCss,
      /@media \(prefers-reduced-motion: no-preference\) \{/,
    )
    const pointBody = block(reducedMotionBlock, /\.matrix-point \{/)
    const transitionDecl = /transition\s*:\s*([^;]+;?[^;]*);/.exec(pointBody)?.[1] ?? ''
    expect(transitionDecl).toMatch(/\bleft\b/)
    expect(transitionDecl).toMatch(/\bbottom\b/)
  })

  it('a reduced-motion user still sees zero transition anywhere outside the no-preference gate for position', () => {
    // Crude but effective guard: the string "transition" must only ever appear inside the
    // `@media (prefers-reduced-motion: no-preference)` block in this stylesheet (today it appears
    // exactly there, for .matrix-point and .matrix-point-label) — never added as an unconditional
    // rule elsewhere for the scatter.
    const reducedMotionBlock = block(
      matrixCss,
      /@media \(prefers-reduced-motion: no-preference\) \{/,
    )
    const withoutGate = matrixCss.replace(reducedMotionBlock, '')
    const scatterSection = withoutGate.slice(
      withoutGate.indexOf('/* ---------- Scatter ---------- */'),
      withoutGate.indexOf('/* ---------- Have/gap flag (scatter) ----------'),
    )
    expect(scatterSection).not.toMatch(/transition\s*:/)
  })
})
