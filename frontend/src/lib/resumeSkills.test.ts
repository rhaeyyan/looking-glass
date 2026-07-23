import { describe, it, expect } from 'vitest'
import {
  BASIC_MATCH_RESUME_TEXT,
  BASIC_MATCH_VOCABULARY,
  BASIC_MATCH_EXPECTED,
  SUBSTRING_TRAP_RESUME_TEXT,
  SUBSTRING_TRAP_VOCABULARY,
  SUBSTRING_TRAP_EXPECTED,
  PUNCTUATION_TRAP_RESUME_TEXT,
  PUNCTUATION_TRAP_VOCABULARY,
  PUNCTUATION_TRAP_EXPECTED,
  R_AND_D_RESUME_TEXT,
  R_AND_D_VOCABULARY,
  R_AND_D_EXPECTED,
  NEGATION_ADJACENT_RESUME_TEXT,
  NEGATION_ADJACENT_VOCABULARY,
  NEGATION_ADJACENT_EXPECTED,
  NEGATION_SENTENCE_BOUNDARY_RESUME_TEXT,
  NEGATION_SENTENCE_BOUNDARY_VOCABULARY,
  NEGATION_SENTENCE_BOUNDARY_EXPECTED,
  NEGATION_OUT_OF_WINDOW_RESUME_TEXT,
  NEGATION_OUT_OF_WINDOW_VOCABULARY,
  NEGATION_OUT_OF_WINDOW_EXPECTED,
  ANY_AFFIRMED_ANYWHERE_RESUME_TEXT,
  ANY_AFFIRMED_ANYWHERE_VOCABULARY,
  ANY_AFFIRMED_ANYWHERE_EXPECTED,
  NO_ALIAS_FOLDING_RESUME_TEXT,
  NO_ALIAS_FOLDING_VOCABULARY,
  NO_ALIAS_FOLDING_EXPECTED,
  NO_MATCHES_RESUME_TEXT,
  NO_MATCHES_VOCABULARY,
  NO_MATCHES_EXPECTED,
} from '../test/fixtures/resumeSkills.fixture'

// MILESTONE (spec 006, Task 2): this locks the FIRST fully-deterministic resume-skill-extraction
// contract in the project. Spec 004's LLM-backed contract (`Promise<string[]>`, a Supabase Edge
// Function call, a Zod response schema, `ExtractionSchemaError`) is deleted in its entirety and
// replaced below — after spec 006 lands, the app makes zero LLM calls anywhere.
//
//   extractResumeSkills(resumeText: string, vocabulary: string[]): string[]
//     - pure, synchronous, zero I/O — no `supabase` import, no mocking required in this file.
//     - returns the subset of `vocabulary` (verbatim casing) found as an affirmed, non-negated,
//       word-boundary-safe mention anywhere in `resumeText`.
//     - boundary rule: case-insensitive lookaround, `(?<![A-Za-z0-9])` / `(?![A-Za-z0-9])`, NOT
//       `\b` — `normalizeSkillName` (./normalize.ts) deliberately treats `#`/`+`/`.` as literal,
//       non-word characters (`C#`, `C++`, `.NET`), which a naive `\b` boundary mishandles.
//       Vocabulary strings must be regex-escaped before pattern construction (`.`/`+` are regex
//       metacharacters).
//     - negation rule: a fixed `NEGATION_CUES` list (no, not, without, never, lack of, lacking,
//       none, don't, doesn't, didn't) scanned case-insensitively in the window between a match and
//       the nearer of (a) the previous sentence terminator (`.`/`!`/`?`/`\n`) or (b) a fixed
//       40-character lookback. Any-affirmed-anywhere-wins: if the same vocabulary entry is
//       unnegated anywhere else in the text, it is still returned.
//     - no alias/synonym folding: exact (post-normalization-equivalent) string matches only.
//
// No `supabase` import and no mocking scaffold exist in this file — this function has no
// dependency on I/O of any kind.
import { extractResumeSkills } from './resumeSkills'

describe('extractResumeSkills', () => {
  it('is a pure synchronous function (does not return a Promise)', () => {
    const result = extractResumeSkills(BASIC_MATCH_RESUME_TEXT, BASIC_MATCH_VOCABULARY)

    expect(result).not.toBeInstanceOf(Promise)
    expect(Array.isArray(result)).toBe(true)
  })

  it('is deterministic: the same inputs produce the same output across repeated calls', () => {
    const first = extractResumeSkills(BASIC_MATCH_RESUME_TEXT, BASIC_MATCH_VOCABULARY)
    const second = extractResumeSkills(BASIC_MATCH_RESUME_TEXT, BASIC_MATCH_VOCABULARY)

    expect(first).toEqual(second)
  })

  // Edge case 1 — basic affirmed match (case-insensitive)
  it('returns vocabulary entries affirmed in the resume text, verbatim-cased, case-insensitive match', () => {
    const result = extractResumeSkills(BASIC_MATCH_RESUME_TEXT, BASIC_MATCH_VOCABULARY)

    expect(result.sort()).toEqual([...BASIC_MATCH_EXPECTED].sort())
  })

  // Edge case 2 — substring-inside-longer-word non-match (solved case)
  it('does not match a short vocabulary entry as a substring of a longer word ("go" in "cargo"/"Chicago")', () => {
    const result = extractResumeSkills(SUBSTRING_TRAP_RESUME_TEXT, SUBSTRING_TRAP_VOCABULARY)

    expect(result).toEqual(SUBSTRING_TRAP_EXPECTED)
  })

  // Edge case 3 — punctuation-preserving boundary / false-merge trap
  it('does not let a shorter vocabulary entry false-merge-match inside a punctuation-suffixed longer one (C vs C#)', () => {
    const result = extractResumeSkills(PUNCTUATION_TRAP_RESUME_TEXT, PUNCTUATION_TRAP_VOCABULARY)

    expect(result).toEqual(PUNCTUATION_TRAP_EXPECTED)
  })

  // Edge case 4 — documented, NOT fixed residual false positive
  it('DOCUMENTED RESIDUAL LIMITATION: a single-letter vocabulary entry false-positive-matches an unrelated abbreviation ("r" inside "R&D") — accepted, not fixed; full resolution needs real NLP, which this project has already decided against', () => {
    const result = extractResumeSkills(R_AND_D_RESUME_TEXT, R_AND_D_VOCABULARY)

    expect(result).toEqual(R_AND_D_EXPECTED)
  })

  // Edge case 5 — negation, direct adjacency
  it('excludes a skill whose only mention is directly negated ("no X experience", "not familiar with Y")', () => {
    const result = extractResumeSkills(NEGATION_ADJACENT_RESUME_TEXT, NEGATION_ADJACENT_VOCABULARY)

    expect(result).toEqual(NEGATION_ADJACENT_EXPECTED)
  })

  // Edge case 6 — negation does not leak across a sentence boundary
  it('does not let a negation cue suppress a mention in a later, separate sentence', () => {
    const result = extractResumeSkills(
      NEGATION_SENTENCE_BOUNDARY_RESUME_TEXT,
      NEGATION_SENTENCE_BOUNDARY_VOCABULARY,
    )

    expect(result).toEqual(NEGATION_SENTENCE_BOUNDARY_EXPECTED)
  })

  // Edge case 7 — documented, NOT fixed residual limitation
  it('DOCUMENTED RESIDUAL LIMITATION: a negation cue further back than the fixed window (no intervening sentence terminator) fails to suppress the match — accepted, not fixed', () => {
    const result = extractResumeSkills(
      NEGATION_OUT_OF_WINDOW_RESUME_TEXT,
      NEGATION_OUT_OF_WINDOW_VOCABULARY,
    )

    expect(result).toEqual(NEGATION_OUT_OF_WINDOW_EXPECTED)
  })

  // Edge case 8 — any-affirmed-anywhere-wins
  it('includes a skill that is negated once but affirmed unnegated elsewhere in the same text', () => {
    const result = extractResumeSkills(
      ANY_AFFIRMED_ANYWHERE_RESUME_TEXT,
      ANY_AFFIRMED_ANYWHERE_VOCABULARY,
    )

    expect(result).toEqual(ANY_AFFIRMED_ANYWHERE_EXPECTED)
  })

  // Edge case 9 — no alias/synonym folding
  it('does not fold a synonym/alias phrase onto a vocabulary entry ("Amazon Web Services" does not satisfy "AWS")', () => {
    const result = extractResumeSkills(NO_ALIAS_FOLDING_RESUME_TEXT, NO_ALIAS_FOLDING_VOCABULARY)

    expect(result).toEqual(NO_ALIAS_FOLDING_EXPECTED)
  })

  // Edge case 10 — empty vocabulary / no matches at all
  it('returns [] for an empty vocabulary', () => {
    const result = extractResumeSkills(BASIC_MATCH_RESUME_TEXT, [])

    expect(result).toEqual([])
  })

  it('returns [] when nothing in a non-empty vocabulary is mentioned', () => {
    const result = extractResumeSkills(NO_MATCHES_RESUME_TEXT, NO_MATCHES_VOCABULARY)

    expect(result).toEqual(NO_MATCHES_EXPECTED)
  })

  it('treats regex-metacharacter vocabulary entries as literal text, not regex syntax (".NET")', () => {
    const result = extractResumeSkills(
      'I have built several services with .NET over the years.',
      ['.NET'],
    )

    expect(result).toEqual(['.NET'])
  })

  it('returns only entries drawn verbatim from vocabulary, never a freely-generated string', () => {
    const result = extractResumeSkills(BASIC_MATCH_RESUME_TEXT, BASIC_MATCH_VOCABULARY)

    for (const skill of result) {
      expect(BASIC_MATCH_VOCABULARY).toContain(skill)
    }
  })
})
