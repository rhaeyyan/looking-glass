// Spec 019 — restyle `.nav` + the two sidebar step cards to spec 018's "glass v2" tokens, and add
// the new pill-shaped `.seg`/`.seg-opt` treatment + `.lg-step-badge` numbered circular badge.
//
// This suite is deliberately RED until Magnolia rewrites the relevant rules in looking-glass.css:
// `.nav`/`.card.blueprint` currently still consume spec 017's OLD --glass-tint-rgb/--glass-alpha
// pair (see the comment at looking-glass.css's :root block: "Untouched by spec 018 ... that lands
// in specs 019-022"), not spec 018's --glass/--glass-2 tokens this SPEC requires. It follows the
// same local `block`/`customProps` CSS-text-parsing convention as glass-v2-tokens.test.ts /
// glassmorphism.test.ts (there is no real DOM/CSSOM available in this Vitest environment), and
// reuses `contrastRatio`/`hexToRgb`/`resolveToHex` from colorTokens.test.ts per the SPEC's own
// "reusing contrastRatio from colorTokens.test.ts" instruction.
//
// Why a new file rather than folding these into App.test.tsx (which the SPEC's file list
// names): App.test.tsx is a React Testing Library component-render suite (jsdom, real DOM
// assertions); these are pure CSS-text/content assertions against a stylesheet no build step
// touches, which is exactly the "component-render test vs CSS-text assertion" fork the task
// brief calls out — and this repo already has three prior-art files (colorTokens.test.ts,
// glassmorphism.test.ts, glass-v2-tokens.test.ts) doing the CSS-text half of that fork for the
// exact same tokens. Splitting keeps App.test.tsx's failure output legible (DOM assertions only)
// and reuses the established parsing/contrast helpers directly instead of re-deriving them
// inline in a component-test file that has no reason to import node:fs.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { contrastRatio, hexToRgb, resolveToHex } from './colorTokens.test'

const STYLES_DIR = path.dirname(fileURLToPath(import.meta.url))
const CSS_PATH = path.join(STYLES_DIR, 'looking-glass.css')
const lookingGlassCss = readFileSync(CSS_PATH, 'utf-8')

const AA_NORMAL_TEXT = 4.5

/** Finds the `{ ... }` block for a selector pattern via brace-depth counting (mirrors the helper
 * duplicated in every sibling token/glass test file in this directory). */
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

/** Alpha-composites a translucent rgba tuple over an opaque hex backdrop (same formula spec 017/
 * 018's sibling test files use: `tint*alpha + backdrop*(1-alpha)` per channel). */
function compositeOverBackdrop(rgba: [number, number, number, number], backdropHex: string): string {
  const [r, g, b, a] = rgba
  const backdrop = hexToRgb(backdropHex)
  const channel = (tint: number, i: number) => Math.round(tint * a + backdrop[i] * (1 - a))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(channel(r, 0))}${toHex(channel(g, 1))}${toHex(channel(b, 2))}`
}

describe('spec 019 — .nav consumes spec 018\'s --glass token (not spec 017\'s old --glass-tint-rgb/--glass-alpha pair)', () => {
  it('.nav background references var(--glass), not the old rgba(var(--glass-tint-rgb), var(--glass-alpha)) construction', () => {
    const body = block(lookingGlassCss, /^\.nav\s*\{/m)
    expect(body).toMatch(/background(-color)?\s*:\s*var\(--glass\)/)
    expect(body).not.toMatch(/--glass-tint-rgb/)
    expect(body).not.toMatch(/--glass-alpha/)
  })

  it('.nav keeps a real (positive) backdrop-filter blur for the sticky glass effect', () => {
    const body = block(lookingGlassCss, /^\.nav\s*\{/m)
    expect(body).toMatch(/backdrop-filter\s*:\s*blur\(/)
  })

  it('the nav-brand lockup rule is untouched by this task (still exists, no new class swapped in for the brand span itself)', () => {
    expect(lookingGlassCss).toMatch(/\.nav-brand\s*\{/)
  })
})

describe('spec 019 — the sidebar step cards consume spec 018\'s --glass-2 token, scoped to the sidebar only', () => {
  // The SPEC's own selector language is ".card.blueprint (sidebar variant)" — the only way to
  // scope "sidebar" cards distinctly from the results-column cards that also carry
  // `.card.blueprint` is through the existing `.lg-sidebar` ancestor already in App.tsx's DOM.
  const SIDEBAR_CARD_SELECTOR = /\.lg-sidebar \.card\.blueprint\b[^{]*\{/

  it('defines a .lg-sidebar .card.blueprint rule using var(--glass-2) as its background', () => {
    const body = block(lookingGlassCss, SIDEBAR_CARD_SELECTOR)
    expect(body).toMatch(/background(-color)?\s*:\s*var\(--glass-2\)/)
  })

  it('never reintroduces a fresh ad hoc rgba(...) literal for the sidebar card background (must trace to the --glass-2 token, not a new hand-picked color)', () => {
    const body = block(lookingGlassCss, SIDEBAR_CARD_SELECTOR)
    const backgroundDecl = /background(-color)?\s*:\s*([^;]+);/.exec(body)
    expect(backgroundDecl).not.toBeNull()
    expect(backgroundDecl![2]).not.toMatch(/rgba?\(/)
  })
})

describe('spec 019 — diagonal sheen overlay on the sidebar cards, built from --sheen-a/--sheen-b', () => {
  it('the stylesheet defines a sheen-gradient rule (a linear-gradient using both --sheen-a and --sheen-b) scoped to the sidebar cards', () => {
    // A pseudo-element overlay (::before/::after) is the conventional way to layer a sheen without
    // fighting the card's own background — accept either that or a background-image layered onto
    // the card rule itself, since the SPEC does not mandate the exact mechanism, only the tokens.
    const pseudoMatch = /\.lg-sidebar \.card\.blueprint(?:::before|::after)\s*\{([^}]*)\}/.exec(
      lookingGlassCss,
    )
    const inlineMatch = (() => {
      try {
        return block(lookingGlassCss, /\.lg-sidebar \.card\.blueprint\b[^{]*\{/)
      } catch {
        return null
      }
    })()

    const candidates = [pseudoMatch?.[1], inlineMatch].filter(
      (v): v is string => typeof v === 'string',
    )
    expect(candidates.length).toBeGreaterThan(0)

    const hasSheenGradient = candidates.some(
      (body) =>
        /linear-gradient\([^)]*var\(--sheen-a\)[^)]*var\(--sheen-b\)[^)]*\)/.test(body) ||
        (/linear-gradient\(/.test(body) &&
          /var\(--sheen-a\)/.test(body) &&
          /var\(--sheen-b\)/.test(body)),
    )
    expect(hasSheenGradient).toBe(true)
  })

  it('the sheen overlay (if built via a pseudo-element) is decorative-only — no content that would read as real text to assistive tech beyond the standard empty content: "" reset', () => {
    const pseudoMatch = /\.lg-sidebar \.card\.blueprint(?:::before|::after)\s*\{([^}]*)\}/.exec(
      lookingGlassCss,
    )
    if (pseudoMatch) {
      const contentDecl = /content\s*:\s*([^;]+);/.exec(pseudoMatch[1])
      if (contentDecl) {
        expect(contentDecl[1].trim().replace(/['"]/g, '')).toBe('')
      }
    }
  })

  it('--sheen-a and --sheen-b (spec 018 tokens) are actually consumed somewhere in the stylesheet now (previously unused — spec 018 only defined them)', () => {
    expect(lookingGlassCss).toMatch(/var\(--sheen-a\)/)
    expect(lookingGlassCss).toMatch(/var\(--sheen-b\)/)
  })
})

describe('spec 019 — sidebar card radius token (13px), --radius-md left untouched', () => {
  it('--radius-md is still 4px (untouched — the SPEC explicitly forbids touching it)', () => {
    const light = lightRoot()
    expect(light['radius-md']).toBe('4px')
  })

  it('the sidebar step card resolves to a 13px border-radius (directly or via a new token), distinct from --radius-md', () => {
    const light = lightRoot()
    const body = block(lookingGlassCss, /\.lg-sidebar \.card\.blueprint\b[^{]*\{/)
    const radiusDecl = /border-radius\s*:\s*([^;]+);/.exec(body)
    expect(radiusDecl).not.toBeNull()

    const raw = radiusDecl![1].trim()
    let resolvedPx: string
    const varMatch = /^var\(\s*--([\w-]+)\s*\)$/.exec(raw)
    if (varMatch) {
      const tokenName = varMatch[1]
      expect(tokenName).not.toBe('radius-md')
      expect(light[tokenName]).toBeDefined()
      resolvedPx = light[tokenName].trim()
    } else {
      resolvedPx = raw
    }
    expect(resolvedPx).toBe('13px')
  })
})

describe('spec 019 — .seg/.seg-opt pill-shaped toggle re-skin', () => {
  it('.seg is pill-shaped: its border-radius is large enough to fully round the ~36px-tall control (>= 18px, or a %/full-pill keyword), not the old 4px --radius-md rectangle', () => {
    const body = block(lookingGlassCss, /^\.seg\s*\{/m)
    const radiusDecl = /border-radius\s*:\s*([^;]+);/.exec(body)
    expect(radiusDecl).not.toBeNull()
    const raw = radiusDecl![1].trim()
    expect(raw).not.toMatch(/var\(--radius-md\)/)

    const pxMatch = /^([\d.]+)px$/.exec(raw)
    const pctMatch = /^([\d.]+)%$/.exec(raw)
    if (pxMatch) {
      expect(Number(pxMatch[1])).toBeGreaterThanOrEqual(18)
    } else if (pctMatch) {
      expect(Number(pctMatch[1])).toBeGreaterThanOrEqual(40)
    } else {
      // Accept a dedicated "pill" token name as an equally valid expression of the same intent.
      expect(raw).toMatch(/var\(--radius-(full|pill)\)/)
    }
  })

  it('the active .seg-opt (:has(input:checked)) is gradient-filled using the new --accent/--accent-soft tokens, not the old flat --color-accent fill', () => {
    const body = block(lookingGlassCss, /\.seg-opt:has\(input:checked\)\s*\{/)
    expect(body).toMatch(/linear-gradient\(/)
    expect(body).toMatch(/var\(--accent(-soft)?\)/)
  })

  it('the .seg-opt:has(input:checked) selector itself is unchanged (same radio-driven CSS selector — no new JS-driven "active" class introduced)', () => {
    expect(lookingGlassCss).toMatch(/\.seg-opt:has\(input:checked\)\s*\{/)
    // A class-based active-state selector would be the "regresses semantics" failure mode the
    // SPEC calls out: the control's checked-ness must stay expressed purely through the real
    // radio input's :checked state, not mirrored into a separate stateful class.
    expect(lookingGlassCss).not.toMatch(/\.seg-opt\.(active|selected|checked)\s*\{/)
  })

  it('.seg-opt:has(input:focus-visible) still defines a visible focus outline (regression guard — the re-skin must not drop focus-visibility)', () => {
    const body = block(lookingGlassCss, /\.seg-opt:has\(input:focus-visible\)\s*\{/)
    expect(body).toMatch(/outline\s*:/)
  })
})

describe('spec 019 — no new ad hoc rgba() literals in the restyled selectors (must trace to spec 018 tokens)', () => {
  const restyledSelectors: [string, RegExp][] = [
    ['.nav', /^\.nav\s*\{/m],
    ['.seg', /^\.seg\s*\{/m],
    ['.seg-opt:has(input:checked)', /\.seg-opt:has\(input:checked\)\s*\{/],
  ]

  for (const [label, pattern] of restyledSelectors) {
    it(`${label} declares no raw rgba(...)/hex literal — every color trace is a var(...) reference`, () => {
      const body = block(lookingGlassCss, pattern)
      // rgba()/rgb() literals are disallowed; var(--sheen-a)/var(--sheen-b) etc. are fine since
      // those are themselves token references, not new ad hoc values.
      expect(body).not.toMatch(/:\s*rgba?\([\d.\s,%]+\)/)
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    })
  }
})

describe('spec 019 — composited contrast: sidebar card text stays legible under --glass-2 + the --sheen-a overlay, over --page (the SPEC-mandated composite-then-check invariant)', () => {
  // Worst case: --sheen-a is the more opaque of the two sheen stops in both themes, so layering it
  // (rather than --sheen-b) over the --glass-2-on-page composite is the conservative check.
  it('every --ink* text token clears 4.5:1 against --glass-2 + --sheen-a layered over --page', () => {
    const tokens = lightRoot()
    const pageHex = tokens['page']
    expect(pageHex).toBeDefined()

    const glass2Rgba = parseRgba(tokens['glass-2'], 'glass-2')
    const glassOverPage = compositeOverBackdrop(glass2Rgba, pageHex)

    const sheenARgba = parseRgba(tokens['sheen-a'], 'sheen-a')
    const finalSurface = compositeOverBackdrop(sheenARgba, glassOverPage)

    for (const inkName of ['ink', 'ink-2', 'ink-3']) {
      const inkHex = resolveToHex(tokens[inkName], tokens)
      expect(contrastRatio(inkHex, finalSurface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })
})

describe('spec 019 — graceful degradation without backdrop-filter support (constraint)', () => {
  it('.nav and the sidebar card background alone (the --glass/--glass-2 solid-composited color, sans blur) still clears 3:1 against --page — a browser that ignores backdrop-filter must not become illegible', () => {
    const AA_NON_TEXT = 3.0
    const tokens = lightRoot()
    const pageHex = tokens['page']

    const navGlassRgba = parseRgba(tokens['glass'], 'glass')
    const navComposited = compositeOverBackdrop(navGlassRgba, pageHex)
    const inkHex = resolveToHex(tokens['ink'], tokens)
    expect(contrastRatio(inkHex, navComposited)).toBeGreaterThanOrEqual(AA_NON_TEXT)

    const cardGlassRgba = parseRgba(tokens['glass-2'], 'glass-2')
    const cardComposited = compositeOverBackdrop(cardGlassRgba, pageHex)
    expect(contrastRatio(inkHex, cardComposited)).toBeGreaterThanOrEqual(AA_NON_TEXT)
  })
})

describe('spec 019 — motion on the new pill-toggle transition is gated behind prefers-reduced-motion (constraint, mirrors the existing .nav/.card.blueprint convention)', () => {
  it('.seg-opt (or .seg) has no unconditional transition declared outside a reduced-motion guard', () => {
    for (const pattern of [/^\.seg\s*\{/m, /^\.seg-opt\s*\{/m]) {
      let body: string
      try {
        body = block(lookingGlassCss, pattern)
      } catch {
        continue
      }
      const transitionMatch = /transition\s*:\s*([^;]+);/.exec(body)
      if (transitionMatch) {
        const idx = lookingGlassCss.indexOf(transitionMatch[0])
        const preceding = lookingGlassCss.slice(0, idx)
        const lastMediaOpen = preceding.lastIndexOf('@media (prefers-reduced-motion: no-preference)')
        const lastMediaCloseGuess = preceding.lastIndexOf('\n}\n')
        expect(lastMediaOpen).toBeGreaterThan(-1)
        expect(lastMediaOpen).toBeGreaterThan(lastMediaCloseGuess - 1)
      }
    }
  })
})

describe('spec 019 — Bounded-AI / scope boundary: no lib/ file touched, no glass-v2 token leaks into scoring logic', () => {
  it('no frontend/src/lib source file references any of this task\'s tokens (--glass-2, --sheen-a, --sheen-b, --radius-card-sm)', () => {
    const libDir = path.join(STYLES_DIR, '..', 'lib')
    const files = readdirSync(libDir, { recursive: true }) as string[]
    const sourceFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|\.spec\./.test(f))
    expect(sourceFiles.length).toBeGreaterThan(0)

    for (const file of sourceFiles) {
      const contents = readFileSync(path.join(libDir, file), 'utf-8')
      expect(contents).not.toMatch(/--glass-2\b/)
      expect(contents).not.toMatch(/--sheen-a\b/)
      expect(contents).not.toMatch(/--sheen-b\b/)
      expect(contents).not.toMatch(/--radius-card-sm\b/)
    }
  })
})
