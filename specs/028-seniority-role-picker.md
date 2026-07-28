# 028 — Seniority gradient framing (data layer)

## Context

V2 candidate from README's "Planned V2 scope expansion" and SESSION_STATE.md round 21's "Next":
seniority in the target-role picker. This is also Park condition #2 for the Datamata AI
Requirements Index (`data/dataset-evaluations.md` lines 100-112), being satisfied now: "V2 adds
seniority to the target-role picker... Given a target level, this becomes advice about the user's
actual position rather than a general remark. Still category-grain — this makes it relevant, not
joinable."

That doc's verdict is load-bearing and unchanged by this SPEC: the dataset has no `skill_name`
column, wrong grain (`category × seniority × tier`, not per-skill), and every cut except one is a
collection artifact of a growing crawl pool (raw `pct` trend, category rank — see the
denominator-cancellation table at lines 66-77). The **one surviving cut** is the seniority
gradient's *ordering* — monotonic (`entry ≤ mid ≤ senior`) across all 6 categories even as
absolute levels are diluted by pool growth — and its **one sound use** is stated explicitly:
"Narration framing, never ranking — a fixed, date-stamped sentence beside the deterministic
per-skill narration" (line 91). This SPEC builds exactly that: a static table + a pure template
function. It does not touch `computeSkillGap`, the Arbitrage Score, or any join. It is
**data-layer only** — no UI. Spec 029 (follow-on, Magnolia) renders it.

Companion V2 candidate (still unstarted, not this SPEC): role expansion via the LinkedIn/arshkon
postings dataset (README, SESSION_STATE round 21).

Lane: **OBSERVABLE** — copy-correctness only. Nothing built here can corrupt the Arbitrage Score,
gap ranking, or a join (see Bounded-AI boundary below), so a defect here is visible-and-wrong, not
silent-and-uncatchable. The one exception, tested as its own near-INVARIANT case: if the
monotonic `entry ≤ mid ≤ senior` gradient — the dataset's one validated finding — is violated in
the shipped table, that misrepresents Datamata's own research silently, so it gets a dedicated
structural test (Edge Cases below).

## [SPEC]

- **Objective**: Ship a small, static, hand-derived summary of the Datamata AI Requirements
  Index's one validated cut (the seniority gradient, per category, @ snapshot_date 2026-07-22) as
  checked-in TS data — analogous to spec 025's `ALIAS_TABLE` — plus a hand-authored
  `role_family → category` mapping (the 15 `Role` values this app ships to the 6 category values
  this dataset uses) and a pure `getSeniorityFraming(role, seniority)` function that renders one
  of three fixed sentence templates (entry / mid / senior — each phrased relative to *that*
  level, per Park condition #2's "advice about the user's actual position" framing, not a generic
  remark). No UI, no Supabase, no runtime read of the gitignored raw CSV.
- **Inputs/Outputs**:
  ```ts
  // frontend/src/lib/seniorityFraming.ts
  export type DatamataCategory = 'ai' | 'data' | 'devops' | 'engineering' | 'product' | 'security'
  export type SeniorityLevel = 'entry' | 'mid' | 'senior'

  interface SeniorityGradient {
    category: DatamataCategory
    snapshot_date: string   // frozen '2026-07-22' — the validated pull in dataset-evaluations.md;
                             // never Date.now(), never auto-refreshed
    entry_pct: number
    mid_pct: number
    senior_pct: number
  }

  // One entry per DatamataCategory, tier = 'any_ai' (see Constraints — this is the broadest,
  // most-general-purpose tier, matching the doc's own citation example's "AI requirements" phrasing,
  // not the narrower 'genai'/'ml' sub-tiers).
  export const SENIORITY_GRADIENT: Record<DatamataCategory, SeniorityGradient>

  // Hand-authored, approximate, many-to-one (15 roles -> 6 categories). Used ONLY to select which
  // framing sentence to show — never a score input, never a join key. Authored in this SPEC;
  // Redwood implements verbatim (do not re-derive independently):
  export const ROLE_TO_DATAMATA_CATEGORY: Record<Role, DatamataCategory> = {
    'Backend': 'engineering',
    'Full Stack': 'engineering',
    'Data Scientist / ML': 'data',
    'Data Engineer': 'data',
    'Software Engineer': 'engineering',
    'DevOps / Cloud / SRE': 'devops',
    'Frontend': 'engineering',
    'Data Analyst / BI': 'data',
    'Mobile': 'engineering',
    'Security': 'security',
    'QA / Test': 'engineering',
    'Business Analyst': 'product',
    'Designer (UX/UI)': 'product',
    'Product Manager': 'product',
    'Project / Program Mgr': 'product',
  }

  export function getSeniorityFraming(role: Role, seniority: SeniorityLevel): string | null
  ```
  Three fixed templates (category label capitalization per `CATEGORY_LABEL: Record<DatamataCategory,
  string>` = `{ ai: 'AI', data: 'data', devops: 'DevOps', engineering: 'engineering', product:
  'product', security: 'security' }`):
  - `entry`: `"AI requirements in {label} roles are concentrated at senior level and nearly absent
    at entry: just {entry_pct}% of entry-level postings vs {senior_pct}% at senior (Datamata AI
    Requirements Index, {snapshot_date})."`
  - `mid`: `"AI requirements in {label} roles rise with seniority — {mid_pct}% of mid-level
    postings, between {entry_pct}% at entry and {senior_pct}% at senior (Datamata AI Requirements
    Index, {snapshot_date})."`
  - `senior`: `"AI requirements in {label} roles concentrate at your level: {senior_pct}% of senior
    postings, up from {entry_pct}% at entry (Datamata AI Requirements Index, {snapshot_date})."`
  `getSeniorityFraming` looks up `ROLE_TO_DATAMATA_CATEGORY[role]`, then `SENIORITY_GRADIENT[category]`,
  fills the matching template, and returns the string; returns `null` only if `role` or `seniority`
  is somehow outside the typed union (defensive, should be unreachable given the types).
- **Design Pattern**: none — simple case. A static lookup table plus a three-branch template
  function; the same idiom spec 025's `ALIAS_TABLE` and spec 026's `SkillGroupBreakdown` already
  established for this codebase. No polymorphism or Strategy earned by 6 categories × 3 levels.
- **Bounded-AI boundary**: 100% deterministic, zero LLM calls. `getSeniorityFraming` is a pure
  function over two static, hand-authored tables — no I/O, no `await`, no dependency on
  `rows`/`RoleSkillRow`/`skill_key`/`arbitrage_score` at all. This is the whole point of the
  feature (Park condition #2: "context, not joinable") and it is enforced structurally, not just
  by convention: `frontend/src/lib/seniorityFraming.ts` must contain **no import** from
  `./gap`, `./supabaseClient`, or `./narrate` — Cypress asserts this by reading the file's own
  source text (see Verification Oracle), the same source-text-assertion technique
  `tests/test_frontend_read_layer_migration.py` already uses in this codebase. The seniority value
  a user picks can never reach `computeSkillGap`, the Arbitrage Score, or any Supabase query.
- **Verification Oracle**: `frontend/src/lib/seniorityFraming.test.ts` (new, vitest) — a real red
  today since neither the file nor the export exists. Covers the fixture cases and the structural
  import-boundary check in Edge Cases below.
- **Intellectual Control**: The dataset-evaluation work (`data/dataset-evaluations.md`) already did
  the hard part — proving which single cut of this dataset survives the pool-growth artifact and
  is safe to cite. This SPEC adds no new analysis, only packages that one validated cut as static
  data with a fixed citation date, exactly mirroring how spec 025 packaged a curated alias set
  instead of building a fuzzy-matching engine. The `role_family → category` mapping is explicitly
  flagged as a lossy judgment call (Constraints) rather than silently presented as authoritative,
  so a future correction is a one-line table edit, not a re-architecture.
- **Constraints**:
  - No new npm/pip dependency.
  - **The raw Datamata CSV is gitignored and not present in this checkout**
    (`data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv`, per
    `data/dataset-evaluations.md` line 15). This SPEC's `SENIORITY_GRADIENT` figures for
    `engineering` (entry 3.0, mid 7.3, senior 11.0) and `security` (entry 0.0, senior 5.6) are the
    only ones already validated in that doc (@ snapshot_date 2026-07-22) and may be used as-is.
    **The remaining four categories' figures (`ai`, `data`, `devops`, `product`) and `security`'s/
    `engineering`'s own `mid_pct` are not yet extracted** — Redwood must pull
    `(snapshot_date=2026-07-22, tier=any_ai, seniority ∈ {entry, mid, senior})` per category from
    the local raw file before this SPEC is considered complete, the same live-verification
    obligation spec 026's Constraints placed on enumerating `skill_group`. Do not fabricate or
    interpolate a plausible-looking number — an absent figure blocks this SPEC's completion, it
    does not get estimated.
  - `tier` is fixed at `'any_ai'` (the broadest tier, not `'genai'` or `'ml'`) — matches the doc's
    own citation example's plain "AI requirements" phrasing. Redwood must confirm this against the
    raw file's tier definitions before extracting; if `'any_ai'` isn't the right column for the
    intended meaning, halt and request a SPEC revision rather than silently substituting a
    different tier.
  - `snapshot_date` is frozen at `'2026-07-22'`, matching the validated pull. Per
    `data/dataset-evaluations.md`'s own "on re-open, re-validate first" rule: if a later pull is
    ever substituted, that is a new dated SPEC, not a silent edit of this one.
  - This data does **not** get a Supabase table or an ingest path — the V1 decision to "leave it
    out" of the DB stands (dataset-evaluations.md line 97-98); this SPEC only reverses the
    UI-relevance half of that call, not the storage half. Ships as a checked-in static TS module,
    same as `ALIAS_TABLE`.
  - Append a short note to `data/dataset-evaluations.md`'s Park conditions section (under the
    existing #2) recording that this SPEC satisfies it, with the date and a link — keeps the audit
    trail intact per this project's Session Continuity discipline.
- **Edge Cases**:
  1. `getSeniorityFraming('Backend', 'entry')` returns the exact `entry` template filled with
     `engineering`'s validated figures — byte-for-byte fixture assertion, not a substring check.
  2. Determinism: calling `getSeniorityFraming` twice with identical arguments yields
     byte-identical output (same discipline as specs 001/002/026).
  3. **Exhaustive mapping**: every one of the 15 `Role` values (from `./roles`) has an entry in
     `ROLE_TO_DATAMATA_CATEGORY` — assert `Object.keys(ROLE_TO_DATAMATA_CATEGORY)` is exactly
     `ROLES` as a set (mirrors `roles.test.ts`'s own set-equality style), not just a TS
     compile-time guarantee.
  4. **Monotonic gradient invariant**: for every `DatamataCategory` in `SENIORITY_GRADIENT`,
     `entry_pct <= mid_pct <= senior_pct` — this is literally the dataset's one validated finding
     (dataset-evaluations.md line 75); a violation here is a real data-entry bug, not a style nit,
     and must fail the test loudly.
  5. **Bounded-AI structural boundary**: read `frontend/src/lib/seniorityFraming.ts`'s own source
     text (`fs.readFileSync`) in the test and assert it contains no `from './gap'`, `from
     './supabaseClient'`, or `from './narrate'` import — the file must be provably unreachable from
     the scoring/gap pipeline, not just conventionally unused by it.
  6. All 6 `CATEGORY_LABEL` values render correctly in a sentence (in particular `ai` → `"AI"`,
     capitalized, and `devops` → `"DevOps"`, not `"Devops"` or `"ai"`/`"devops"` lowercase, which
     would read as a typo mid-sentence).
  7. Every `snapshot_date` in `SENIORITY_GRADIENT` is the literal string `'2026-07-22'` (frozen-date
     regression guard — catches an accidental per-entry date drift).
- **Files**: `frontend/src/lib/seniorityFraming.ts` (new), `frontend/src/lib/seniorityFraming.test.ts`
  (new), `data/dataset-evaluations.md`
- **Tipping Point**: If `data/dataset-evaluations.md`'s Park conditions #1 (publisher stabilizes the
  sampling frame, enabling a real trend feature) or #3 (a skill-level source lands, needing this as
  corroboration) are ever triggered, this static-lookup design is insufficient and the dataset
  needs a real ingest path — revisit then, not preemptively. Also: if the companion V2 candidate
  (LinkedIn/arshkon role expansion) ever changes the `Role` union away from these 15 values,
  `ROLE_TO_DATAMATA_CATEGORY` must be extended before new roles reach `getSeniorityFraming` — flag
  this as an explicit dependency for that future SPEC, not a rediscovery.

## [FORCES]

1. Packaging the one already-validated cut as static data (per `data/dataset-evaluations.md`) >
   re-litigating the dataset's rejected cuts or re-running the artifact analysis
2. A structurally provable Bounded-AI boundary (no import from the scoring/gap modules, tested) >
   a boundary that exists only as a comment or convention
3. Honest, live-verified figures (Redwood must pull 4 of 6 categories from the raw file) > a
   plausible-looking but fabricated number
4. Simplicity > Pattern purity
