import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// RED phase (spec 009 — `.lg-results` empty + loading states). Static source-level checks on
// `looking-glass.css`: the CSS is never executed by jsdom in these unit tests, so any
// `prefers-reduced-motion` guarding must be verified by parsing the stylesheet text directly, the
// same way the SPEC's own constraint is worded ("gated behind `@media (prefers-reduced-motion:
// no-preference)` exactly like the existing `.lg-fade`/`.matrix-point` transitions").
//
// Locked naming convention: `.lg-skeleton` (the codebase's existing `lg-` prefix for App-level
// structural classes — `.lg-results`, `.lg-donut`, `.lg-scorecard`, etc. — per App.tsx/looking-
// glass.css already in the repo). Redwood's skeleton block(s) must use this class (or a
// `.lg-skeleton*` variant) for these tests to locate them.

const cssPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'looking-glass.css',
)
const css = readFileSync(cssPath, 'utf-8')

/** Extracts the text content of every top-level (non-nested) `@media (<query>) { ... }` block
 * whose query string matches `queryPattern`, using balanced-brace parsing (a naive regex can't
 * handle nested braces or multiple media blocks reliably). */
function extractMediaBlocks(source: string, queryPattern: RegExp): string[] {
  const blocks: string[] = []
  const mediaStart = /@media\s*([^{]+)\{/g
  let match: RegExpExecArray | null
  while ((match = mediaStart.exec(source))) {
    const query = match[1]
    if (!queryPattern.test(query)) continue
    let depth = 1
    let i = mediaStart.lastIndex
    const start = i
    while (depth > 0 && i < source.length) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    blocks.push(source.slice(start, i - 1))
  }
  return blocks
}

/** Strips every `@media (...) { ... }` block (of any query) out of `source`, leaving only
 * top-level (unguarded) rules — used to prove an animation is NEVER applied outside the
 * reduced-motion guard, not merely that it's also present inside one. */
function stripAllMediaBlocks(source: string): string {
  let result = ''
  let i = 0
  const mediaStart = /@media\s*[^{]+\{/g
  let match: RegExpExecArray | null
  while ((match = mediaStart.exec(source))) {
    result += source.slice(i, match.index)
    let depth = 1
    let j = mediaStart.lastIndex
    while (depth > 0 && j < source.length) {
      if (source[j] === '{') depth++
      else if (source[j] === '}') depth--
      j++
    }
    i = j
    mediaStart.lastIndex = j
  }
  result += source.slice(i)
  return result
}

describe('looking-glass.css — skeleton loading state respects prefers-reduced-motion (spec 009)', () => {
  it('defines a .lg-skeleton (or .lg-skeleton*) rule at all', () => {
    expect(/\.lg-skeleton[a-zA-Z-]*\s*\{|\.lg-skeleton[a-zA-Z-]*[,.\s]/.test(css)).toBe(true)
  })

  it('only applies a shimmer/pulse animation to the skeleton inside @media (prefers-reduced-motion: no-preference)', () => {
    const noPreferenceBlocks = extractMediaBlocks(css, /prefers-reduced-motion:\s*no-preference/)
    const animatedInGuardedBlock = noPreferenceBlocks.some(
      (block) => /\.lg-skeleton[a-zA-Z-]*/.test(block) && /animation\s*:/.test(block),
    )
    expect(animatedInGuardedBlock).toBe(true)

    // Same rule must NEVER set `animation` outside any prefers-reduced-motion:no-preference guard —
    // the reduced-motion fallback is a static (non-animated) block, not merely a duplicate.
    const unguarded = stripAllMediaBlocks(css)
    const skeletonRuleMatches = unguarded.match(/\.lg-skeleton[a-zA-Z-]*[^{]*\{[^}]*\}/g) ?? []
    for (const rule of skeletonRuleMatches) {
      expect(rule).not.toMatch(/animation\s*:/)
    }
  })
})
