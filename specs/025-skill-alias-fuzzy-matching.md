# 025 — Skill-alias fuzzy matching

## Context

Spec 006's deterministic resume-skill extraction (`extractResumeSkills`) matches only literal
spellings of the 141/148-skill D1/D2 vocabulary. A resume that says "k8s" for "Kubernetes" or
"postgres" for "PostgreSQL" is silently dropped before `computeSkillGap` ever sees it, understating
the user's real skill coverage — a correctness gap one layer upstream of the Arbitrage Score. This
is the V2 refinement referenced at README.md:218, specs/006's own scope note, and spec 004 Task 4's
Tipping Point ("if V2 adds alias/fuzzy matching, `normalizeSkillName`/`computeSkillGap` need a...").

Lane: **INVARIANT** — a missed alias silently under-counts a resume's skills with no visible signal.

## [SPEC]

- **Objective**: Extend `extractResumeSkills` (spec 006) to also detect resume mentions of a
  vocabulary entry written as a common alias/abbreviation/casing variant (e.g. "k8s" for
  "Kubernetes", "postgres" for "PostgreSQL", "js" for "JavaScript"), via a small **static,
  curated alias table** consulted by the exact same boundary-safe, overlap-resolved,
  negation-aware matching machinery spec 006 already built — not a new matching engine, and not
  edit-distance/embedding fuzzy matching. The function's public contract is unchanged: it still
  returns only entries drawn verbatim from `vocabulary` (never an alias string) — an alias hit is
  attributed back to its canonical vocabulary entry, exactly as spec 006's overlap-resolution
  already attributes a shorter match's span to a longer claimed one.
- **Inputs/Outputs**: Signature unchanged: `extractResumeSkills(resumeText: string, vocabulary:
  string[]): string[]`. New internal collaborator:
  `ALIAS_TABLE: Record<string, string[]>` in a new file, keyed by `normalizeSkillName(canonical)`
  (reuse `./normalize.ts` — do not hand-roll a second normalization rule), valued by an array of
  raw alias surface forms (e.g. `{'kubernetes': ['k8s'], 'postgresql': ['postgres', 'postgres sql'],
  'javascript': ['js'], 'typescript': ['ts'], 'python': ['py'], 'machine learning': ['ml'],
  'artificial intelligence': ['ai']}`). For each vocabulary entry, look up
  `ALIAS_TABLE[normalizeSkillName(entry)]` and search for those alias strings in `resumeText`
  using the identical `buildBoundaryPattern`/`findSpans`/negation-window logic already applied to
  the canonical string — do not duplicate or fork that logic into a second code path.
- **Design Pattern**: none — simple case. The alias table is a fixed, hand-curated lookup
  extending one existing algorithm; the variance here (a finite set of known industry
  abbreviations) doesn't earn a Strategy/matching-engine abstraction. Per `Simplicity > Pattern
  purity` and spec 004 Task 4's own Tipping Point, that abstraction is reserved for if/when real
  fuzzy matching is later demonstrated necessary — not for a static table.
- **Bounded-AI boundary**: Fully deterministic, unchanged from spec 006 — zero LLM calls anywhere
  in this path. The alias table is static data authored and reviewed at spec time (this SPEC),
  not generated or expanded at runtime by any model; matching remains regex/lookaround-based, the
  same mechanism spec 006 already uses. This is explicitly an alias-table/normalization expansion,
  not fuzzy string-distance matching (no Levenshtein, no embedding similarity) — the project's
  Bounded-AI discipline requires this stay deterministic and reviewable, and a curated table is
  auditable in a way a similarity threshold is not (no silent "close enough" matches to unrelated
  skills — e.g. Levenshtein distance 1 between `"r"` and `"c"` would be a correctness hazard this
  design avoids entirely by construction).
- **Verification Oracle**: `frontend/src/lib/resumeSkills.test.ts` (vitest) — extend with new
  alias-match fixture cases (see Edge Cases below); Cypress adds these as failing tests first
  (red, since today's exact-match-only implementation will miss every alias case), then Redwood
  implements against them. Additionally, `frontend/src/lib/skillAliases.test.ts` (new) asserts the
  alias table's own structural invariants (see Edge Cases) — this is a real oracle, not a test
  that cannot fail: it fails today because the file doesn't exist.
- **Intellectual Control**: The alias table is finite, hand-reviewed, and grows by explicit PR/
  spec update, not automatically — every entry is traceable to a real, confirmed canonical skill
  name in the live vocabulary (see Constraints), so this cannot silently introduce a match to a
  skill that doesn't actually exist in the data. Reusing spec 006's exact boundary/overlap/
  negation logic (rather than writing new matching code) means every existing regression guard
  (the `C`/`C#`/`C++` false-merge trap, the `r`/`R&D` residual, the negation window) applies to
  alias matches for free — there is no second, drifting implementation to keep in sync.
- **Constraints**: No new npm dependency (plain data + the existing regex machinery suffice; no
  fuzzy-matching/NLP library). Redwood must verify each canonical target string in `ALIAS_TABLE`
  against `data/schema-notes.md`'s documented D1/D2/D3 skill lists (or a live Supabase query if
  ambiguity remains) before wiring an alias to it — the exact canonical casing/spelling in this
  SPEC's Inputs/Outputs section is illustrative, not verified against the raw CSVs (which are
  gitignored and not present in this checkout), and must not be trusted blindly. An alias string
  must never itself collide with a *different* canonical vocabulary entry's own literal spelling
  within the same role's ~30-skill vocabulary (e.g. do not alias `"ts"` to `"typescript"` if some
  role vocabulary also contains a literal, unrelated skill whose normalized form is `"ts"`) —
  Redwood must spot-check this against the 15 role profiles in `skills-2026-by-role.csv`'s
  documented skill lists before adding an entry. Keep the table small and targeted (aim ≤30–40
  canonical entries, 1–3 aliases each) — this is a bounded correctness fix, not a general
  synonym-expansion project.
- **Edge Cases**:
  1. Alias match, basic: `vocabulary: ['Kubernetes']`, resume `"5 years with k8s clusters"` →
     `['Kubernetes']`.
  2. Canonical-still-works regression guard: every existing spec 006 fixture (basic match,
     substring trap, punctuation trap, R&D residual, both negation cases, any-affirmed-anywhere,
     no-matches) must still pass unchanged — this feature is additive, not a rewrite.
  3. Alias + negation: `"no k8s experience"` with `vocabulary: ['Kubernetes']` → excluded (the
     same negation window/cue logic applies to alias spans, not just canonical spans).
  4. Alias + any-affirmed-anywhere-wins: `"no k8s experience, but I've since learned Kubernetes"`
     → included (one negated alias occurrence, one affirmed canonical occurrence elsewhere).
  5. Overlap resolution across alias and canonical spans: if both the canonical string and one of
     its aliases could independently match overlapping text, the existing longest-first/
     overlap-discard rule from spec 006 governs — no double-counting, no crash.
  6. A vocabulary entry with no alias-table entry behaves exactly as spec 006 today (backward
     compatible) — most of the 141/148-skill core will have zero aliases in this initial table.
  7. Case-insensitivity for aliases, same as canonical matching (`"K8S"`, `"Postgres"` both match).
  8. Alias-table structural test (`skillAliases.test.ts`): every `ALIAS_TABLE` key is already in
     `normalizeSkillName`'s canonical output form (idempotent — normalizing a key again is a
     no-op); no alias string is empty/whitespace-only; no alias string is identical to its own
     canonical key (redundant entry); no two different canonical keys share the exact same alias
     string (ambiguous alias — must fail this test, not be silently resolved at match time).
  9. Empty `vocabulary` or no aliases found anywhere → `[]`, same as before.
- **Files**: `frontend/src/lib/resumeSkills.ts`, `frontend/src/lib/skillAliases.ts` (new),
  `frontend/src/lib/resumeSkills.test.ts`, `frontend/src/lib/skillAliases.test.ts` (new),
  `frontend/src/test/fixtures/resumeSkills.fixture.ts`
- **Tipping Point**: If the alias table grows past ~50–100 entries, needs per-domain/per-locale
  variants, or a demonstrated (not hypothetical) recurring miss survives after reasonable alias
  curation, that is the signal to revisit a real matching-Strategy abstraction or genuine
  fuzzy/NLP matching (per spec 004 Task 4's original Tipping Point) — not a reason to keep growing
  this table ad hoc or to reach for Levenshtein/embeddings preemptively. Also out of this SPEC's
  scope, flagged as a follow-up not authorized here: README.md lines ~209–219 and
  `data/schema-notes.md` currently state "no alias/synonym folding is implemented" and list it as
  an out-of-scope V2 item — once this lands, a short doc-reconciliation task (mirroring spec 006
  Task 1) should update both, but that is prose-only and belongs in its own task, not bundled into
  this 5-file code budget.

## [FORCES]

1. Curated deterministic alias table (auditable, bounded) > fuzzy/edit-distance matching (opaque, unbounded false-positive surface)
2. Reusing spec 006's existing boundary/overlap/negation logic for alias spans > a second, parallel matching code path
3. Simplicity > Pattern purity
