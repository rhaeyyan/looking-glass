// Deterministic, zero-I/O resume-skill extraction (spec 006). Replaces spec 004's LLM-backed
// extractor entirely — after this file lands, the app makes zero LLM calls anywhere.
//
// extractResumeSkills(resumeText, vocabulary) returns the subset of `vocabulary` (verbatim
// casing — normalization is `gap.ts`'s job, not this file's) found as an affirmed, non-negated,
// word-boundary-safe mention anywhere in `resumeText`. Pure and synchronous: no network, no
// mocking scaffold required by callers.
//
// Boundary rule: case-insensitive lookaround, `(?<![A-Za-z0-9])` / `(?![A-Za-z0-9])`, not `\b` —
// `normalizeSkillName` (./normalize.ts) deliberately treats `#`/`+`/`.` as literal, non-word
// characters (`C#`, `C++`, `.NET`), which a naive `\b` boundary mishandles. Vocabulary strings are
// regex-escaped before pattern construction since `.`/`+` are regex metacharacters.
//
// Overlap resolution (the "C" vs "C#" false-merge trap): a bare `C` immediately followed by `#`
// still boundary-matches as a standalone `C`, because `#` is a non-word character and satisfies
// the right-hand lookaround just as validly as it does for `C#` itself. To resolve this, vocabulary
// entries are matched longest-first (by string length, tie-broken by original vocabulary index —
// never by input order alone, so the result is deterministic regardless of how the vocabulary is
// ordered). A shorter entry's match is discarded if its span overlaps a span already claimed by a
// longer entry's match, whether or not that longer-entry match was itself affirmed — the span
// still identifies that character range as the longer token's mention, not the shorter one's.
//
// Negation rule: a fixed NEGATION_CUES list scanned case-insensitively in the window between a
// match and the nearer of (a) the previous sentence terminator (`.`/`!`/`?`/`\n`) or (b) a fixed
// 40-character lookback. Any-affirmed-anywhere-wins: if the same vocabulary entry has any other,
// unnegated occurrence elsewhere in the text, it is still returned — biased against false
// negatives over false positives.
//
// Documented, not-fixed residual limitations (accepted — full resolution needs real NLP, which
// this project has already decided against elsewhere):
//   - A single-letter vocabulary entry (e.g. `r`) false-positive-matches inside an unrelated
//     abbreviation that tokenizes identically (`R&D`).
//   - A negation cue further back than the fixed window, with no intervening sentence terminator,
//     fails to suppress a match.

const NEGATION_CUES = [
  'no',
  'not',
  'without',
  'never',
  'lack of',
  'lacking',
  'none',
  "don't",
  "doesn't",
  "didn't",
]

const NEGATION_LOOKBACK_CHARS = 40
const SENTENCE_TERMINATOR_RE = /[.!?\n]/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildBoundaryPattern(value: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`, 'gi')
}

function findSpans(text: string, value: string): Array<[number, number]> {
  const pattern = buildBoundaryPattern(value)
  const spans: Array<[number, number]> = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  return spans
}

function overlapsAny(span: [number, number], claimed: Array<[number, number]>): boolean {
  const [start, end] = span
  return claimed.some(([claimedStart, claimedEnd]) => start < claimedEnd && claimedStart < end)
}

function lastSentenceTerminatorIndex(text: string, before: number): number {
  for (let i = before - 1; i >= 0; i--) {
    if (SENTENCE_TERMINATOR_RE.test(text[i])) {
      return i
    }
  }
  return -1
}

function isNegated(text: string, matchStart: number): boolean {
  const lookbackStart = Math.max(0, matchStart - NEGATION_LOOKBACK_CHARS)
  const terminatorIndex = lastSentenceTerminatorIndex(text, matchStart)
  const sentenceStart = terminatorIndex === -1 ? 0 : terminatorIndex + 1
  const windowStart = Math.max(sentenceStart, lookbackStart)
  const window = text.slice(windowStart, matchStart)

  return NEGATION_CUES.some((cue) => buildBoundaryPattern(cue).test(window))
}

export function extractResumeSkills(resumeText: string, vocabulary: string[]): string[] {
  const orderedByLengthDesc = vocabulary
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value.length - a.value.length || a.index - b.index)

  const claimedSpans: Array<[number, number]> = []
  const result: string[] = []

  for (const { value } of orderedByLengthDesc) {
    const spans = findSpans(resumeText, value)
    let affirmed = false

    for (const span of spans) {
      if (overlapsAny(span, claimedSpans)) {
        continue
      }
      claimedSpans.push(span)
      if (!isNegated(resumeText, span[0])) {
        affirmed = true
      }
    }

    if (affirmed) {
      result.push(value)
    }
  }

  return result
}
