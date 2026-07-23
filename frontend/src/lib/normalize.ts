// Deterministic skill-name normalization for the D1/D2/D3 join key — mirrors
// `src/ingest/normalize.py`'s `normalize_skill()` exactly, so the frontend's resume-gap match
// never drifts from the ingest pipeline's join methodology.
//
// Rule: lowercase, collapse whitespace / `/` / `-` / `_` runs to a single space, but KEEP `#`,
// `+`, `.` intact — so `C#` != `C++` != `C`. No alias/acronym expansion.

// Whitespace, `/`, `-`, `_` are equivalent separators; runs of any mix collapse to one space.
// `#`, `+`, `.` are deliberately excluded — they must survive verbatim.
const SEPARATOR_RUN_RE = /[\s/_-]+/g

// Deterministic and idempotent: normalizeSkillName(normalizeSkillName(x)) === normalizeSkillName(x).
export function normalizeSkillName(name: string): string {
  const lowered = name.toLowerCase()
  const collapsed = lowered.replace(SEPARATOR_RUN_RE, ' ')
  return collapsed.trim()
}
