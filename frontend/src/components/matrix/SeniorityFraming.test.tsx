// specs/029-seniority-role-picker-ui.md — RED phase tests for the new <SeniorityFraming /> panel.
// The component (`./SeniorityFraming`) does not exist yet — that is the point: every test below
// must fail because the module cannot be loaded / the contract does not exist, not because of a
// typo in this file. Uses the same RED-phase-safe dynamic-import pattern as
// `SkillGroupBreakdown.test.tsx` / `TopGapNarration.test.tsx` (variable specifier + @vite-ignore)
// so a missing or incomplete implementation fails per-test with a real assertion instead of
// aborting file collection outright.
//
// Component contract this task locks in (Magnolia MUST honor):
//   - Named export `SeniorityFraming`, exactly one prop: `{ note: string | null }`. No `rows`,
//     `haveSkillKeys`, `role`, or `topGaps` prop — this is the Bounded-AI boundary: the component
//     is structurally incapable of depending on scoring state because it has nothing in its own
//     props for a scoring bug to leak through (SPEC's "Bounded-AI boundary" + "Intellectual
//     Control" sections). Asserted here via a source-text check, mirroring
//     `seniorityFraming.test.ts`'s own "Bounded-AI structural import boundary" test — the load-
//     bearing test in this file.
//   - Renders `null` (no DOM) when `note` is `null`.
//   - Renders a `<p>` containing the note text when `note` is a non-null string, PLUS a visible,
//     non-color-only "context, not a score input" cue: a neutral glyph (e.g. "ⓘ") marked
//     `aria-hidden="true"` (so it doesn't create a second, redundant announcement for screen-reader
//     users — the visible text below already carries the meaning) paired with visible text (e.g.
//     "Context —") prefixing the sentence. Mirrors round 21's SkillGroupBreakdown color-only fix
//     (see SkillGroupBreakdown.tsx's own comment + SkillGroupBreakdown.test.tsx's "marks the
//     selected entry with a visible non-color cue" test) for the identical WCAG 1.4.1 "use of
//     color" pitfall — here there isn't even a color signal in play, just a plain sentence, so the
//     cue must be delivered by icon + text, never by styling (e.g. italics/border) alone.
//   - Stays axe-clean in both the null-note and note-present states.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'

const COMPONENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_PATH = path.join(COMPONENT_DIR, 'SeniorityFraming.tsx')

const SENIORITY_FRAMING_MODULE = './SeniorityFraming'
async function loadSeniorityFraming() {
  const mod = await import(/* @vite-ignore */ SENIORITY_FRAMING_MODULE)
  return mod.SeniorityFraming
}

const SAMPLE_NOTE =
  'AI requirements in engineering roles rise with seniority — 7.3% of mid-level postings, ' +
  'between 3% at entry and 11% at senior (Datamata AI Requirements Index, 2026-07-22).'

describe('<SeniorityFraming /> null-note gating', () => {
  it('renders nothing when note is null (never an empty citation box)', async () => {
    const SeniorityFraming = await loadSeniorityFraming()
    const { container } = render(<SeniorityFraming note={null} />)

    expect(container.firstChild).toBeNull()
  })
})

describe('<SeniorityFraming /> note rendering', () => {
  it('renders the note text inside a <p> element when note is a non-null string', async () => {
    const SeniorityFraming = await loadSeniorityFraming()
    render(<SeniorityFraming note={SAMPLE_NOTE} />)

    const paragraph = screen.getByText(new RegExp(SAMPLE_NOTE.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    expect(paragraph.tagName).toBe('P')
    expect(paragraph.textContent).toContain(SAMPLE_NOTE)
  })

  it('pairs a visible "Context —" style text cue with an aria-hidden icon glyph — not color alone', async () => {
    const SeniorityFraming = await loadSeniorityFraming()
    const { container } = render(<SeniorityFraming note={SAMPLE_NOTE} />)

    // Visible text cue: something explicitly reading "Context" (case-insensitive), separate from
    // the sentence itself, so a sighted color-vision-deficient user gets the "this is context, not
    // a score input" signal from TEXT, never from a border/italic/color treatment alone.
    expect(screen.getByText(/context/i)).toBeInTheDocument()

    // Non-redundant aria-hidden icon: a glyph element marked aria-hidden="true" so it is not
    // double-announced by a screen reader (the visible "Context —" text already carries the
    // meaning for sighted users; assistive tech gets it from the text node instead).
    const hiddenIcons = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
    expect(hiddenIcons.length).toBeGreaterThan(0)
  })

  it('does not render any note DOM at all for an empty container check when note is null, even after rendering with a note first (fresh mount)', async () => {
    const SeniorityFraming = await loadSeniorityFraming()
    const { container, rerender } = render(<SeniorityFraming note={SAMPLE_NOTE} />)
    expect(container.firstChild).not.toBeNull()

    rerender(<SeniorityFraming note={null} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SeniorityFraming.tsx — Bounded-AI structural prop boundary', () => {
  // Load-bearing test: proves the component has no scoring-related prop in its own signature, not
  // merely that it happens not to use one today. Mirrors seniorityFraming.test.ts's own
  // "structural import boundary" test technique (source-text assertion via readFileSync).
  it('receives ONLY the `note` prop — no rows/haveSkillKeys/role/topGaps in its own prop signature', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8')

    const signatureMatch = source.match(/SeniorityFraming\s*\(\s*\{([^}]*)\}/)
    expect(
      signatureMatch,
      'Could not find a `SeniorityFraming({ ... })` destructured-props function signature in the source.',
    ).not.toBeNull()

    const propNames = (signatureMatch as RegExpMatchArray)[1]
      .split(',')
      .map((entry) => entry.trim().split(':')[0].trim())
      .filter(Boolean)

    expect(propNames).toEqual(['note'])
  })

  it('never references rows/haveSkillKeys/topGaps as identifiers anywhere in the file', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8')

    expect(source).not.toMatch(/\brows\b/)
    expect(source).not.toMatch(/\bhaveSkillKeys\b/)
    expect(source).not.toMatch(/\btopGaps\b/)
  })

  it('does not import RoleSkillRow, TopMove, or any scoring/gap/db module', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8')

    expect(source).not.toMatch(/RoleSkillRow/)
    expect(source).not.toMatch(/TopMove/)
    expect(source).not.toMatch(/from\s+['"].*\/gap['"]/)
    expect(source).not.toMatch(/from\s+['"].*supabaseClient['"]/)
    expect(source).not.toMatch(/from\s+['"].*\/narrate['"]/)
  })
})

describe('<SeniorityFraming /> accessibility', () => {
  it('stays axe-clean when note is null (renders nothing)', async () => {
    const SeniorityFraming = await loadSeniorityFraming()
    const { container } = render(<SeniorityFraming note={null} />)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('stays axe-clean when note is a rendered sentence', async () => {
    const SeniorityFraming = await loadSeniorityFraming()
    const { container } = render(<SeniorityFraming note={SAMPLE_NOTE} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
