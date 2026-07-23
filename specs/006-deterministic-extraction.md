# 006 — Deterministic Resume-Skill Extraction

**Status**: Approved 2026-07-23. Reverses spec 004's LLM-based resume-skill extraction in favor
of deterministic vocabulary-scoped regex matching, completing the zero-LLM pivot spec 005 started
for narration. Both forced decisions below (edge function/secret deletion, `zod` removal)
approved. Tasks 1–4b authorized.

**Context**: Spec 004 built resume-skill extraction via a Supabase Edge Function
(`extract-resume-skills`) proxying OpenRouter's `google/gemma-4-31b-it:free`, consumed by
`frontend/src/lib/resumeSkills.ts`. Live verification has been blocked on a confirmed, persistent
upstream free-tier rate limit (429s) — not a code bug. Separately, spec 005 replaced narration
with a deterministic template engine; at that time the sibling proposal to *also* drop the LLM
from extraction was evaluated and explicitly rejected (unstructured NL is where an LLM earns its
keep — string matching regresses on single-letter skills, negation, and contextual phrasing, and
an extraction error corrupts the ranking itself).

**The human has now reversed that call.** Given the choice between fighting the rate limit
(switch model / wait / pay) or abandoning LLM extraction for a deterministic approach, they chose
the latter. This SPEC is not a re-litigation of that decision — it specs the reversal properly,
explicitly designing around the exact regressions that were the reason it was rejected the first
time, rather than silently reintroducing them.

**Goal**: Replace LLM-based extraction with deterministic vocabulary-scoped regex matching. After
this SPEC lands, the app has **zero LLM calls anywhere** — the first fully zero-LLM state since
spec 001.

## Plan summary (Cedar)

**Architectural call**: the new extractor takes a **vocabulary** parameter — the currently-loaded
role's `skill_name_raw` list (≤30 entries, already in memory as `rows` when `handleResumeSubmit`
runs) — rather than the full 141/148-skill D1/D2 catalog. Anything outside the selected role's own
profile is already silently ignored downstream by `computeSkillGap`, so a broader vocabulary would
add fetch/complexity for zero behavioral gain.

**Synchronous, not async**: no I/O is left to await. This has a real consequence, decided
explicitly: `App.tsx`'s `extractStatus`/`extractError` state and their "Extracting skills…"/
"Could not extract skills…" UI branches become genuinely dead (no pending window, no throw path
over already-validated inputs) and are **removed**, not re-skinned.

**Regressions addressed with concrete, bounded mitigations** (the reason the "100% zero-AI"
sibling proposal was rejected the first time):
1. **Short-skill substring false positives** — lookaround-based (not `\b`) word-boundary matching,
   needed because `normalizeSkillName` deliberately keeps `#`/`+`/`.` as literal characters
   (`C#`, `C++`, `.NET`) where naive `\b` misbehaves. Vocabulary strings are regex-escaped before
   pattern construction. **Honest residual limit, documented not fixed**: `vocabulary: ['r']`
   still false-positive-matches inside `"R&D"` — full resolution needs real NLP, which this
   project has already decided against elsewhere.
2. **Negation** — a small fixed `NEGATION_CUES` list scanned in a clause-bounded window (nearer of
   a sentence terminator or a fixed lookback). Any-affirmed-anywhere-wins: if the same skill
   appears unnegated elsewhere in the text, it's still returned (biased against false negatives).
   **Honest residual limit, documented not fixed**: a negation cue further back than the window
   fails to suppress a match.
3. **Contextual phrasing / synonyms** — unchanged from spec 004: no alias/synonym folding, exact-
   normalized-match only.

**Forced decisions (both approved):**
1. **Edge function + secret — DELETE.** `supabase/functions/extract-resume-skills/` is removed
   from the repo (Task 3). Leaving dead, credentialed infra live after its only caller is deleted
   is exactly the attack surface the zero-trust posture argues against; the audit trail survives
   permanently in git/specs, not in leaving the function deployed. The **live** deployment and its
   `OPENROUTER_API_KEY` secret cannot be torn down by an agent (no live credentials in-agent, per
   the Security-isolation gate) — the human must manually run `supabase functions delete
   extract-resume-skills` and `supabase secrets unset OPENROUTER_API_KEY`.
2. **`zod` — REMOVE** from `frontend/package.json`. It was added in spec 004 solely to validate
   the LLM's structured output and has no other call site in the repo.

**Task shape**: doc reconciliation first (mirrors the OpenRouter-provider-switch precedent — docs
updated before the code change), then two TDD pairs (Cypress RED → Redwood GREEN). Task 4a is
eligible to start as soon as Task 2's contract is frozen (different files); Task 4b depends on
both Task 3 and Task 4a.

---

## Task 1 — Doc reconciliation (prerequisite, no TDD gate)

```markdown
[SPEC]
- **Objective**: Reconcile README.md and AGENTS.md with the now-approved reversal: resume
  extraction is deterministic, not LLM-backed. Record the reversal decision and its rationale
  (why regressions #1–#3 are now mitigated rather than avoided) so the docs never silently
  contradict the code. This is a prose-only change with no behavioral surface — it precedes the
  code tasks below, mirroring the OpenRouter-provider-switch precedent (docs updated first, then
  Cedar spec's the code change).
- **Inputs/Outputs**: N/A — documentation edit only.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — no code path touched.
- **Intellectual Control**: Prevents the exact failure mode this project's own Session Continuity
  rule warns about (stale ledger/doc vs. source-of-truth code drift). README's own step-5 writeup
  (lines ~144–151) currently states the sibling proposal was rejected — that sentence must be
  replaced with the reversal, not left standing next to contradicting code. AGENTS.md's "AI layer"
  bullet currently states OpenRouter/Gemma is used for "resume skill-extraction and result
  narration" — after this SPEC lands, the app has zero runtime LLM calls; state that plainly
  rather than leaving a stale claim. Flag this explicitly as a project milestone in the doc text
  (first zero-LLM state since spec 001).
- **Constraints**: Prose only. No code, no test changes. Must not alter any Workflow Rule,
  Handoff Schema, or the Team Roster table (those are process/config, out of this task's scope).
- **Edge Cases**: If AGENTS.md's stack line is changed to remove OpenRouter/Gemma entirely, note
  that the *mechanism* (a single bounded, server-side-proxied LLM call, model-swappable) remains
  documented as the pattern-in-reserve, in case a future SPEC reintroduces an LLM call elsewhere —
  don't delete the general Bounded-AI framing, only the now-false claim that extraction currently
  uses it.
- **Files**: README.md, AGENTS.md
- **Tipping Point**: N/A — a two-file prose edit has no scale threshold.
```
```markdown
[FORCES]
1. Documentation honesty (docs match running code) > minimizing diff size
2. Simplicity > Pattern purity
```

## Task 2 — Cypress RED: deterministic extractor contract

```markdown
[SPEC]
- **Objective**: Freeze the new `extractResumeSkills` contract as failing tests, replacing the
  LLM-response-shaped contract entirely. New signature:
  `extractResumeSkills(resumeText: string, vocabulary: string[]): string[]` — pure, synchronous,
  zero I/O, zero mocking of `supabase` needed (delete that mock scaffold from the test file
  entirely). Returns the subset of `vocabulary` (verbatim casing, not normalized — normalization
  stays `gap.ts`'s job) found as an affirmed, non-negated, word-boundary-safe mention anywhere in
  `resumeText`.
- **Inputs/Outputs**:
  - In: `resumeText: string` (free text, ≤20,000 chars per existing cap), `vocabulary: string[]`
    (the current role's `skill_name_raw` values, ≤~30 entries).
  - Out: `string[]` — a subset of `vocabulary`, verbatim, order not significant (gap.ts sets it).
  - Matching rule: case-insensitive; boundary-aware via lookaround (`(?<![A-Za-z0-9])` /
    `(?![A-Za-z0-9])`), not `\b`, specifically because `normalizeSkillName` deliberately keeps
    `#`/`+`/`.` as literal (non-word) characters (`C#`, `C++`, `.NET`) where naive `\b` misbehaves.
    Vocabulary strings must be regex-escaped before pattern construction (`.`/`+` are regex
    metacharacters and must be literal).
  - Negation rule: a small fixed `NEGATION_CUES` list (`no`, `not`, `without`, `never`, `lack of`,
    `lacking`, `none`, `don't`, `doesn't`, `didn't`) scanned case-insensitively in the window
    between the match and the nearer of (a) the previous sentence-terminator (`.`/`!`/`?`/`\n`) or
    (b) a fixed 40-character lookback. A match with a negation cue anywhere in its window is not,
    by itself, an affirmed mention; if *any* other occurrence of the same vocabulary entry
    elsewhere in the text is unnegated, the skill is still returned (any-affirmed-anywhere-wins —
    deterministic, order-independent, biased against false negatives).
  - No alias/synonym folding (unchanged from spec 004 decision #2): `"Amazon Web Services"` does
    not match a `vocabulary` entry of `"AWS"`.
- **Design Pattern**: none — simple case (one fixed algorithm, no swappable matching strategies).
- **Bounded-AI boundary**: N/A — no LLM in this path. (First fully-deterministic extraction
  contract in the project; flag this milestone in the test file's header comment.)
- **Intellectual Control**: Because the function only ever returns entries drawn from
  `vocabulary` itself (never a freely-generated string), its output is *self-consistent by
  construction* with `computeSkillGap`'s `normalizeSkillName` matching — normalizing a vocabulary
  string against itself can never fail to match, closing off a whole class of LLM-phrasing-drift
  bugs the old path could produce.
- **Constraints**: Zero new dependencies (confirmed: no tokenizer already in
  `frontend/package.json`; pure regex/string ops suffice). Delete the `ExtractionSchemaError`
  class, the Zod schema, and all `supabase.functions.invoke` mocking from this test file — none
  of it applies anymore.
- **Edge Cases** (test cases the fixture/test file must encode):
  1. Basic affirmed match (case-insensitive).
  2. Substring-inside-longer-word non-match, solved case: `vocabulary: ['go']` must NOT match
     inside `"cargo"`/`"Chicago"`.
  3. Punctuation-preserving boundary / false-merge trap: `vocabulary: ['C', 'C#', 'C++']` against
     `"I write C# daily"` → only `['C#']`.
  4. **Documented, not-fixed residual false positive**: `vocabulary: ['r']` against
     `"Our R&D team..."` → matches (pin this as accepted behavior via a comment explaining word-
     boundary matching cannot distinguish a real short-skill token from an unrelated abbreviation
     that happens to tokenize identically — full resolution needs real NLP, which this project has
     already decided against elsewhere).
  5. Negation, direct adjacency: `"no Kubernetes experience"`, `"not familiar with Rust"` → excluded.
  6. Negation does not leak across a sentence boundary: `"I don't like Java. I know Kubernetes."`
     with `vocabulary: ['Java', 'Kubernetes']` → `['Kubernetes']` only.
  7. **Documented, not-fixed residual limitation**: a negation cue further back than the window
     (e.g. across a long intervening clause without a sentence terminator) fails to suppress —
     pin one such case as accepted behavior, commented as a known gap, not a bug.
  8. Any-affirmed-anywhere-wins: a skill mentioned once negated and once affirmed elsewhere in
     the same text → included.
  9. No alias/synonym folding: `"Amazon Web Services"` does not satisfy `vocabulary: ['AWS']`.
  10. Empty `vocabulary` → `[]`. No matches at all → `[]`.
- **Files**: `frontend/src/lib/resumeSkills.test.ts`, `frontend/src/test/fixtures/resumeSkills.fixture.ts`
- **Tipping Point**: N/A for a test-only task — see Task 3's Tipping Point for the implementation.
```
```markdown
[FORCES]
1. Locking the exact contract (signature, boundary rule, negation rule) > leaving Redwood
   implementation-detail latitude
2. Simplicity > Pattern purity
```

## Task 3 — Redwood GREEN: implement the deterministic extractor + decommission the LLM path

```markdown
[SPEC]
- **Objective**: Make Task 2's frozen tests pass. Rewrite `resumeSkills.ts` per the algorithm
  above; delete the now-dead `extract-resume-skills` edge function from the repo; remove `zod`
  as a dependency (its only call site in the codebase was this file's LLM-response schema).
- **Inputs/Outputs**: As locked by Task 2. `resumeSkills.ts` no longer imports `./supabaseClient`
  or `zod` — both become unused in this file.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — no LLM anywhere in this file or this task.
- **Intellectual Control**: Removing a deployed, credentialed Edge Function whose only caller no
  longer exists closes an attack surface the zero-trust posture (README's Security-isolation
  gate) argues against tolerating; the decision (why, and what replaced it) is permanently
  recoverable from git history and `specs/006-*.md`, so no audit trail is actually lost by
  deleting the deployed artifact.
- **Constraints**: No new dependency. Regex construction must escape vocabulary strings
  (`.`/`+` are regex metacharacters that must be treated literally, per Task 2 Edge Case 3).
- **Edge Cases**:
  - **Forced decision — edge function + secret**: DELETE `supabase/functions/extract-resume-skills/`
    from the repo in this task. Separately (cannot be done in-agent — no live Supabase
    credentials, per the Security-isolation gate), the human must manually run
    `supabase functions delete extract-resume-skills` and
    `supabase secrets unset OPENROUTER_API_KEY` against the live project. Note this explicitly in
    the `[COMPLETION-REPORT]`'s "Known gaps" as an outstanding manual step, not a silently-dropped
    task.
  - **Forced decision — `zod`**: remove from `frontend/package.json` `dependencies` in this task;
    confirmed (via repo-wide grep) to have no other call site.
  - Vocabulary containing duplicate entries: harmless — output naturally dedupes via the same
    `Set` construction `computeSkillGap` already does downstream; no dedup logic needed here.
  - Performance: ≤30 vocabulary entries × ≤20,000-char resume text is negligible; no memoization
    or precompiled-regex caching needed at this scale.
- **Files**: `frontend/src/lib/resumeSkills.ts`, `supabase/functions/extract-resume-skills/index.ts` (delete), `supabase/functions/extract-resume-skills/README.md` (delete), `frontend/package.json`
- **Tipping Point**: If a future V2 feature needs matching against the full 141/148-skill D1/D2
  catalog (not just the selected role's ~30-skill vocabulary), refactor to build/compile the
  vocabulary-to-regex list once and cache it, rather than rebuilding per call — not worth doing at
  today's scale. If negation false-positives/negatives become a demonstrated recurring problem
  (not just a documented theoretical residual), that's the signal to revisit real NLP — not a
  reason to keep growing `NEGATION_CUES` ad hoc.
```
```markdown
[FORCES]
1. Deleting dead, credentialed infra > preserving it "just in case"
2. Simplicity > Pattern purity
```

## Task 4a — Cypress RED: `App.tsx` call-site contract

```markdown
[SPEC]
- **Objective**: Update `App.test.tsx`'s resume-submit tests for the new synchronous,
  two-argument `extractResumeSkills` contract. Remove tests that assert on states that can no
  longer occur (a pending-extraction loading window; an extraction failure/error alert) since a
  pure synchronous function has neither.
- **Inputs/Outputs**: `mockExtract` (the mocked `extractResumeSkills`) must be exercised with
  `mockReturnValue`/plain return values, never `mockResolvedValue`/`mockRejectedValue`. The
  "calls extractResumeSkills with the exact textarea value" test must assert it is called with
  `(resumeText, vocabulary)` where `vocabulary` is `rows.map(r => r.skill_name_raw)` for the
  currently-loaded role rows.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A.
- **UI Scope**: structural — the loading (`role="status"`, "Extracting skills from your
  resume…") and error (`role="alert"`, "Could not extract skills from your resume: …") regions
  are removed from the DOM entirely, not restyled; their tests must be deleted, not updated to
  new copy.
- **Intellectual Control**: Pinning this in tests first (before Task 4b's implementation) is
  what proves the removal is deliberate and complete, not an accidental regression discovered
  later.
- **Constraints**: Do not touch `computeSkillGap`/`narrateTopGap` assertions — those are
  unaffected by this change and must remain real (unmocked), per this file's existing convention.
- **Edge Cases**: Keep the two client-side-validation tests (no role selected; empty/whitespace
  resume) unchanged — those still gate before `extractResumeSkills` is ever called and are
  unaffected by sync-vs-async.
- **Files**: `frontend/src/App.test.tsx`
- **Tipping Point**: N/A — test-only task.
```
```markdown
[FORCES]
1. Proving the dead states are gone > preserving now-meaningless test coverage for optics
2. Simplicity > Pattern purity
```

## Task 4b — Redwood GREEN: `App.tsx` integration

```markdown
[SPEC]
- **Objective**: Make Task 4a's frozen tests pass. `handleResumeSubmit` calls
  `extractResumeSkills(resumeText, rows.map(r => r.skill_name_raw))` synchronously (no `await`,
  no `try/catch` — no realistic throw path over already-validated inputs), then proceeds exactly
  as before into `computeSkillGap`/`narrateTopGap`. Remove the `extractStatus`/`extractError`
  state pair and their two now-dead render branches entirely (they gate nothing else in this
  component — confirmed by inspection: the have/gap render is gated by role-fetch `status`, not
  `extractStatus`).
- **Inputs/Outputs**: No change to `computeSkillGap`/`narrateTopGap` call shapes.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — this file has no LLM call anywhere after this task.
- **UI Scope**: structural (per Task 4a).
- **Intellectual Control**: Removing state that no longer gates any render path is the concrete
  Jevons-Paradox check this task's `[COMPLETION-REPORT]` must address — don't leave dead state
  "just in case."
- **Constraints**: No new state introduced to replace what's removed unless a test in 4a demands it.
- **Edge Cases**: If `rows` is empty when submit fires (shouldn't happen given the existing
  role-required validation gate, but stay defensive), `vocabulary` is simply `[]`, which
  `extractResumeSkills` already handles (Task 2, Edge Case 10) — no special-casing needed here.
- **Files**: `frontend/src/App.tsx`
- **Tipping Point**: If a future feature reintroduces a real async step during resume submit,
  add a loading/error state pair scoped to *that* step specifically — don't resurrect
  `extractStatus`/`extractError` preemptively for a hypothetical future need.
```
```markdown
[FORCES]
1. Matching the new deterministic function's real behavior > keeping legacy async scaffolding for familiarity
2. Simplicity > Pattern purity
```

---

**Relevant paths**: `README.md`, `AGENTS.md`, `SESSION_STATE.md`, `specs/004-resume-gap-layer.md`,
`specs/005-template-narrator.md`, `frontend/src/lib/resumeSkills.ts`,
`frontend/src/lib/resumeSkills.test.ts`, `frontend/src/test/fixtures/resumeSkills.fixture.ts`,
`frontend/src/lib/gap.ts`, `frontend/src/lib/normalize.ts`, `frontend/src/App.tsx`,
`frontend/src/App.test.tsx`, `frontend/package.json`,
`supabase/functions/extract-resume-skills/index.ts`,
`supabase/functions/extract-resume-skills/README.md`.
