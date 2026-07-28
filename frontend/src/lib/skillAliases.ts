// Spec 025 — static, curated skill-alias table consulted by `resumeSkills.ts`'s existing
// boundary/overlap/negation matching machinery. Not a fuzzy/edit-distance matcher: every entry
// here is a hand-reviewed, literal surface-form variant of a real canonical skill name, added by
// explicit spec update only (see specs/025-skill-alias-fuzzy-matching.md's Tipping Point).
//
// Keys are `normalizeSkillName(canonical)` (./normalize.ts — do not hand-roll a second
// normalization rule). Values are raw alias surface forms, matched case-insensitively via the
// same `buildBoundaryPattern`/`findSpans` logic already applied to canonical strings.
//
// Verification note (spec 025 Constraints): `data/raw/{d1,d2,d3}/` are gitignored and not present
// in this checkout, and no live Supabase query was available while authoring this table, so the
// canonical targets below could not be checked against the raw CSVs directly. They were instead
// checked against `data/schema-notes.md`'s documented samples and the project's own test fixtures:
//   - "Python" is directly quoted in schema-notes.md's D2 sample rows.
//   - "Kubernetes" and "PostgreSQL" are the exact illustrative vocabulary used by Cypress's
//     already-committed oracle (resumeSkills.fixture.ts) for this spec, and "Kubernetes" is also
//     used as representative D1/D2 test data in tests/test_skill_core_join.py.
//   - "JavaScript"/"TypeScript" are not directly quoted in schema-notes.md's samples; included
//     only as ubiquitous, industry-standard terms with a near-zero collision risk (flagged as a
//     known gap in the spec 025 COMPLETION-REPORT pending raw-CSV or live-Supabase confirmation).
// Deliberately NOT included: "artificial intelligence" -> "ai" and "machine learning" -> "ml".
// schema-notes.md's D3 sample confirms a real, distinct literal skill named `ai` (lowercase,
// 71253 postings) — aliasing "ai" onto a different canonical ("artificial intelligence") would
// risk exactly the alias/literal-collision hazard the SPEC's Constraints warn against, so both
// entries are withheld pending confirmation that no role vocabulary carries "AI"/"ML" as its own
// literal skill.
export const ALIAS_TABLE: Record<string, string[]> = {
  kubernetes: ['k8s'],
  postgresql: ['postgres', 'postgres sql'],
  javascript: ['js'],
  typescript: ['ts'],
  python: ['py'],
}
