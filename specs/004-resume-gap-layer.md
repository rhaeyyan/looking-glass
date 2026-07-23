# 004 — Resume Gap Layer (README MVP step 4)

**Status**: Approved 2026-07-22. Supabase Edge Function + `ANTHROPIC_API_KEY` secret (new
infrastructure), `zod` runtime dependency, and the V1 exact-normalized-match skill rule (no
fuzzy/alias matching) all approved. Tasks 1–6 authorized.

**Context**: First LLM-in-the-loop slice in the codebase. Everything built so far (`specs/001`,
`specs/002`, `specs/003`, all complete and live-verified) is deterministic SQL/Python + a React
frontend reading pre-computed Supabase views. This SPEC covers README step 4 only (skill
extraction → gap highlighting); step 5 (LLM narration of the top gap) is out of scope and gets its
own future SPEC, reusing this same edge-function pattern.

**Goal**: Paste a resume → extract skills → subtract from the role profile → highlight *your* gaps
on the matrix, ranked by Arbitrage Score.

## Plan summary (Cedar)

**Three forced decisions (all approved):**

1. **Extraction call architecture** — a single Supabase Edge Function
   (`supabase/functions/extract-resume-skills`, Deno) proxies the Claude call server-side. Reads
   `ANTHROPIC_API_KEY` from a Supabase project *secret* (never a `VITE_*` var, never shipped to the
   client), invoked from the frontend via the already-approved `supabase-js` client's
   `functions.invoke()`. Calling Claude directly from the browser would ship the Anthropic API key
   in the public bundle — a Zero-Trust violation — so client-side-direct was rejected outright.
   Talks to Anthropic's REST API via raw `fetch()` (no SDK) — no new npm/pip dependency for this
   half, but it is new infrastructure (a deployed function + a new secret) and needed explicit
   approval regardless.
2. **Skill matching rule (V1, no fuzzy/alias matching per README)** — normalize both sides
   (case-fold, trim, collapse whitespace/punctuation — same normalization the ingest pipeline
   already uses for the D1/D2/D3 join) and exact-match a role skill's `skill_key` (falling back to
   normalized `skill_name_raw` when `skill_key` is null) against the normalized set of extracted
   resume skills. Extracted resume skills with no corresponding role-profile skill are silently
   unused (not errors, not surfaced) — the gap layer answers "which of the role's skills do you
   have," not "resume completeness."
3. **UI contract change** — additive `haveSkillKeys: Set<string>` prop threaded through the
   existing three sibling components (`SkillMatrix`, `ArbitrageLadder`, `SkillDataTable`) rather
   than a new pattern. Two states (have/gap) don't earn a Strategy/interface abstraction yet
   (`Simplicity > Pattern purity`); revisit only if a third visual state appears.

**New dependency (approved)**: `zod` (frontend, runtime) — the mechanism AGENTS.md names for
schema-validating LLM structured output before it touches the deterministic gap computation.

**Bounded-AI boundary (applies to every task touching the LLM)**: Claude's only job is turning
resume free text into a flat list of skill strings. The edge function requests structured output
from Claude but performs no scoring. The frontend Zod-validates that list, then a 100%
deterministic function (`computeSkillGap`) does normalize → match → partition-into-have/gap →
sort-by-already-computed-`arbitrage_score`. The LLM never sees, computes, or influences a score, a
gap, or a rank.

**Zero-Trust / PII**: resume text is never logged (edge function or client), never persisted to
Supabase or `localStorage`, never included in thrown-error messages, and is capped at a bounded
input length client-side.

**Task shape** mirrors spec 003's SPIKE→characterize→TDD cadence: Tasks 1–2 resolve the genuinely
unknown extraction-call architecture (SPIKE, then Cypress audits after); Tasks 3–4 build the
deterministic, schema-validated gap layer (standard TDD); Tasks 5–6 wire have/gap into the existing
matrix UI (standard TDD). 6 tasks, none over 5 files, no task references more than 3 specs.

---

## Task 1 — Redwood [SPIKE]: resume-skill-extraction edge function (walking skeleton)

```markdown
[SPIKE]
- **Objective**: Prove a resume-text-in → Claude-call-server-side → skill-list-out path works
  end-to-end with zero secret exposure to the client, establishing the repo's first Supabase Edge
  Function convention. No frontend wiring, no Zod validation refinement yet — that's Task 4.
- **Inputs/Outputs**: HTTP POST body `{ resumeText: string }` → JSON `{ skills: string[] }` (or a
  structured error). Invoked via `supabase.functions.invoke('extract-resume-skills', { body })`
  from a manual/CLI test client — no frontend caller wired in this task.
- **Design Pattern**: none — simple case; one function, one external call.
- **Bounded-AI boundary**: Claude extracts skill strings from free text only; this function
  performs zero scoring/ranking/gap logic. Request Claude's response as constrained structured
  output (tool-use/JSON schema) to bound malformed output at the source; the frontend's Zod parse
  (Task 4) remains the authoritative gate before anything touches the gap computation.
- **Constraints**: `ANTHROPIC_API_KEY` read from `Deno.env.get(...)` (a Supabase project *secret*,
  set via `supabase secrets set`, never a `VITE_*`/client-visible var). Plain `fetch()` to
  `https://api.anthropic.com/v1/messages` — **no SDK dependency**. No `console.log`/logging of
  `resumeText` or the raw Claude response anywhere. No database write of resume content. CORS
  restricted to the frontend's dev/prod origins, not `*`.
- **Edge Cases**: empty/whitespace-only `resumeText` → 400, no Claude call made. Oversized
  `resumeText` (define and enforce a max length, e.g. 20,000 chars) → 400, no call made. Claude API
  error/timeout → 502 with a generic message (never forward raw upstream error text, which could
  leak infra details). Empty extraction result (`{ skills: [] }`) is a valid, non-error response.
- **Files**: `supabase/functions/extract-resume-skills/index.ts`,
  `supabase/functions/extract-resume-skills/README.md` (deploy + secret-setup instructions)
- **Tipping Point**: if step 5 (narration) or any future task needs a second Claude call, factor
  the shared fetch/auth boilerplate into `supabase/functions/_shared/anthropic.ts` rather than
  duplicating it — not needed for one function.
```
```markdown
[FORCES]
1. Prove the real secret-isolated call path end-to-end (walking skeleton) > building validation first
2. Simplicity > Pattern purity
```

## Task 1 (amended) — Redwood: swap the edge function's upstream call from Anthropic to OpenRouter

**Amendment context (2026-07-22)**: after Task 1 shipped calling Claude directly, the human
decided to switch the AI layer to OpenRouter (`google/gemma-4-31b-it:free`, OpenAI-compatible
endpoint, confirmed native function-calling support) for both this extraction task and the future
step-5 narration task. `AGENTS.md`/`README.md`'s stack lines were updated first (commit `2687b5f`)
to keep docs and code in sync. This amendment is a surgical diff to the already-built edge
function — its public HTTP contract, input validation, timeout handling, CORS allow-listing,
statelessness, and Bounded-AI/Zero-Trust invariants are unchanged.

```markdown
[SPEC]
- **Objective**: Re-point the already-built `extract-resume-skills` edge function's single
  upstream LLM call from Anthropic's Messages API to OpenRouter's OpenAI-compatible Chat
  Completions API (`google/gemma-4-31b-it:free`), per the human's provider decision now recorded
  in `AGENTS.md` and `README.md`. This is a surgical diff: the function's public HTTP contract
  (`POST { resumeText }` → `200 { skills: string[] }` / `400` / `502`), its input validation,
  timeout handling, CORS allow-listing, statelessness, and no-logging-of-resume-content
  invariants are UNCHANGED and must not be touched except where explicitly listed below.
- **Inputs/Outputs**: unchanged from the original Task 1 — `POST { resumeText: string }` →
  `200 { skills: string[] }` | `400 { error: string }` | `502 { error: string }`. Only the
  function's internal upstream call changes.
- **Design Pattern**: none — simple case; a single call-site swap, no new abstraction earned by
  one provider change (per the existing Tipping Point below, still not crossed).
- **Bounded-AI boundary**: unchanged — the model's only job is extracting a flat `skills: string[]`
  from free text; this function still performs zero scoring/ranking/gap logic. The forced tool-call
  continues to bound malformed output at the source; the frontend's future Zod parse (Task 4)
  remains the authoritative gate.
- **What changes**:
  1. **Endpoint**: `ANTHROPIC_API_URL` (`https://api.anthropic.com/v1/messages`) →
     `OPENROUTER_API_URL` (`https://openrouter.ai/api/v1/chat/completions`). Remove the
     `ANTHROPIC_VERSION` constant (no OpenRouter equivalent needed).
  2. **Model constant**: `CLAUDE_MODEL = 'claude-sonnet-5'` → `OPENROUTER_MODEL =
     'google/gemma-4-31b-it:free'`.
  3. **Secret name**: `Deno.env.get('ANTHROPIC_API_KEY')` → `Deno.env.get('OPENROUTER_API_KEY')`.
     Update the `server_misconfigured` check accordingly. No other secret/env-var name changes.
  4. **Auth header**: `'x-api-key': apiKey` → `Authorization: 'Bearer ' + apiKey`. Remove the
     `anthropic-version` header entirely.
  5. **Attribution headers**: include OpenRouter's recommended `HTTP-Referer` and `X-Title`
     headers (low-stakes attribution/ranking metadata, not a Bounded-AI or Zero-Trust concern —
     no secret or PII in either value). Use a static, non-PII value for both (e.g. the repo's
     public GitHub URL for `HTTP-Referer`, `"Looking Glass"` for `X-Title`) — do not derive either
     from request data.
  6. **Request body shape**: replace Anthropic's `{ model, max_tokens, tools: [EXTRACT_SKILLS_TOOL
     as Anthropic input_schema], tool_choice: { type: 'tool', name }, messages }` with the
     OpenAI-compatible shape: `{ model, messages, tools: [{ type: 'function', function: { name,
     description, parameters: <same JSON-schema object, renamed from input_schema> } }],
     tool_choice: { type: 'function', function: { name: 'extract_skills' } } }`. Keep the same
     `max_tokens`-equivalent (`max_tokens` is also valid in OpenRouter's schema — retain it) and
     the same user-message prompt text.
  7. **Response parsing**: replace the Anthropic `content[].find(block => block.type ===
     'tool_use').input.skills` walk with reading
     `choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments` — this arrives as a JSON
     **string**, not a structured object, and must be `JSON.parse`'d inside its own `try/catch`
     (a `JSON.parse` failure here is a distinct failure mode from an HTTP/network failure and must
     also throw `'upstream_response_unparseable'`, not an unhandled exception). After parsing,
     apply the exact same defensive shape check as today (`Array.isArray(skills) &&
     skills.every(s => typeof s === 'string')`) before returning — do not relax this check for
     the new provider.
- **Constraints**: no new npm/Deno dependency — plain `fetch()`, same as today. No change to
  `MAX_RESUME_LENGTH`, `*_TIMEOUT_MS` (rename the constant, keep the value and the
  `AbortController` mechanism identical), CORS logic, or the `Deno.serve` handler's control flow
  (validation → key check → call → generic-502-on-any-thrown-error). Do not touch
  `resolveAllowedOrigins`, `corsHeaders`, `jsonResponse`, or the request-validation block in
  `Deno.serve` — none of those reference the provider and must not be edited.
- **Edge Cases**:
  - All edge cases from the original Task 1 SPIKE still apply unchanged (empty/whitespace
    `resumeText` → 400 no call made; oversized `resumeText` → 400 no call made; empty `{ skills:
    [] }` is a valid 200; upstream error/timeout → generic 502, never forward raw upstream text).
  - **New**: a `tool_calls[0].function.arguments` string that fails `JSON.parse` must be caught
    and mapped to the same `'upstream_response_unparseable'` error as a missing/malformed field —
    never an unhandled exception that could 500 instead of 502 or leak a stack trace.
  - **New**: a response with no `tool_calls` array at all (model replied with plain text instead
    of invoking the tool) must be handled by the same defensive check, not assumed present.
  - **Operational risk (documented, not code)**: `google/gemma-4-31b-it:free` is a free-tier
    OpenRouter model and may be rate-limited or occasionally return non-tool-call/non-conforming
    output more often than Claude's tool-use did. The existing generic `try/catch` → `502
    extraction_failed` path already covers this — no additional code is required beyond the
    defensive parsing above — but this is a deliberate, documented reliability tradeoff of the
    provider swap, not a silent gap. If this proves operationally unacceptable, that is a future
    SPEC decision (e.g. a paid-tier fallback model), not something to solve speculatively here.
- **Files**: `supabase/functions/extract-resume-skills/index.ts`,
  `supabase/functions/extract-resume-skills/README.md` (update: API URL, secret-setup step 2 →
  `OPENROUTER_API_KEY`, model-choice section → explain the `google/gemma-4-31b-it:free` choice
  and note the free-tier reliability tradeoff, curl/manual-verification snippets unaffected since
  the function's public HTTP contract didn't change).
- **Out of scope / follow-ups to flag, not to build now**:
  - `tests/test_extract_resume_skills_function.py` (Task 2) currently asserts
    `Deno.env.get('ANTHROPIC_API_KEY')` and a negative `sk-ant-...` regex — these will fail or go
    stale once this amendment lands. A follow-up Cypress task should update those assertions to
    `OPENROUTER_API_KEY` and an OpenRouter-appropriate secret-pattern check. Not authorized in
    this task (would exceed this task's file budget and Cypress, not Redwood, owns that file).
  - The future step-5 narration SPEC should reuse this exact OpenRouter pattern (endpoint, Bearer
    auth, OpenAI-compatible `tools`/`tool_choice` shape, `arguments`-string parsing) rather than
    re-deriving it — noted here for whoever writes that SPEC, not written now.
- **Tipping Point**: unchanged from the original — if a second OpenRouter/LLM call is ever needed
  (e.g. step-5 narration), factor the shared fetch/auth boilerplate into
  `supabase/functions/_shared/openrouter.ts` rather than duplicating it. Not needed for one
  function.
```

```markdown
[FORCES]
1. Minimal, provider-isolated diff (change only the upstream call) > touching already-approved surrounding logic
2. Simplicity > Pattern purity
```

## Task 2 — Cypress: characterization tests for the edge function (SPIKE audit)

**Status: complete.** Executed against the real, post-amendment (OpenRouter) implementation, not
the stale Claude-era prose originally written below — see the reconciled edge-case list.
`tests/test_extract_resume_skills_function.py`, 26/26 passing, full suite 208 passed/16 skipped.
Committed `25d561a`.

```markdown
[SPEC]
- **Objective**: Lock in the edge function's observed contract as a regression guard, per the
  SPIKE path — written after the skeleton, not before. Structural/text assertions on the function
  source, since no Deno test runner exists in this repo yet and live calls require a secret
  unavailable in test context (Zero-Trust: no live production credentials in-agent).
- **Inputs/Outputs**: `supabase/functions/extract-resume-skills/index.ts` read as text → regex/
  structural assertions (same style as `tests/test_frontend_read_layer_migration.py` from spec 003
  Task 1).
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: fully deterministic test assertions; N/A LLM (this task tests the
  *shape* of the LLM-calling code, never calls it).
- **Intellectual Control**: the security-critical invariants (secret sourced from `Deno.env`, never
  a hardcoded/client-visible key; no logging of resume content; no DB write) must be enforced by a
  test, not left to review, exactly like the RLS contract in spec 003 Task 1.
- **Constraints**: pytest only, text/regex assertions, no live Supabase/OpenRouter credentials
  anywhere in test context.
- **Edge Cases** (as executed, against the real OpenRouter implementation):
  - `Deno.env.get('OPENROUTER_API_KEY')` present; no hardcoded/secret-shaped literal ever assigned
    to a key/secret/token binding or passed directly as the `Authorization` header.
  - `Authorization` header built via `Bearer ${apiKey}` (or equivalent) referencing the `apiKey`
    parameter — never a literal, and never a stale `x-api-key` header (would indicate reversion to
    the old Anthropic shape).
  - No `console.log`/`console.error`/`console.info` call includes the `resumeText` variable or the
    raw request/response body (negative regex assertion) — the function has zero `console.*` calls
    at all.
  - No Supabase client import or write call (`.insert(`/`.upsert(`/`.update(`) anywhere in the file
    (negative assertion — this function must stay stateless).
  - A max-length check on `resumeText` exists and executes before the upstream call.
  - CORS header value is not the literal `'*'` anywhere in the file.
  - OpenRouter endpoint/model targeted (Anthropic endpoint absent); OpenAI-style `tools`/
    `tool_choice` shape; `choices[0].message.tool_calls[0].function.arguments` parsed via
    `JSON.parse` in its own try/catch mapping to `upstream_response_unparseable`; defensive
    `Array.isArray`/`every(typeof === 'string')` shape check; optional-chained `tool_calls?.[0]` so
    a missing tool-call doesn't throw unhandled.
- **Files**: `tests/test_extract_resume_skills_function.py`
- **Tipping Point**: N/A — characterization tests; revisit only if the function's public contract
  changes. Live end-to-end verification (deploy + real `functions.invoke()` call) remains a manual
  step for the human, documented in the function's README, not automatable here.
```
```markdown
[FORCES]
1. Freezing the security-critical invariants of the observed skeleton (as it actually exists today) > a hypothetical/stale future contract
2. Simplicity > Pattern purity
```

## Task 3 — Cypress: failing tests for schema-validated extraction + deterministic gap computation

```markdown
[SPEC]
- **Objective**: Write failing tests for the frontend's Zod-gated extraction call and the fully
  deterministic have/gap partition + sort, before Redwood implements — standard TDD, this is not
  exploratory.
- **Inputs/Outputs**: mocked `supabase.functions.invoke` responses (valid, malformed, empty) →
  `extractResumeSkills()`; a `RoleSkillRow[]` fixture + a resume-skill string array →
  `computeSkillGap()` returning `{ haveSkillKeys: Set<string>; rows: RoleSkillRow[] }` sorted by
  `arbitrage_score` descending (null-score rows last, per the existing ladder convention).
- **Design Pattern**: N/A (Cypress does not choose Redwood's implementation pattern).
- **Bounded-AI boundary**: assert that `computeSkillGap` never reads anything from the mocked
  Claude response except the skill-name strings, and never produces/mutates a score — its only
  output is a boolean have/gap partition and a stable sort of already-scored rows.
- **Constraints**: vitest; test/fixture files only; no live Supabase/Anthropic call in tests.
- **Edge Cases** (must be asserted):
  - A malformed mocked response (missing `skills` key, wrong type, oversized array) is rejected by
    the Zod schema and surfaces as a typed error — never silently coerced or passed through.
  - Case/whitespace/punctuation differences between an extracted skill and a role skill's
    `skill_key`/`skill_name_raw` still match (normalization works both directions).
  - An extracted skill with no corresponding role-profile skill is silently ignored (not an error,
    not surfaced).
  - A role skill with `skill_key: null` (no D1/D2 match) is matched, if at all, against normalized
    `skill_name_raw` — never dropped from the output regardless of have/gap status.
  - `computeSkillGap` output row order is unchanged from `ArbitrageLadder`'s existing
    null-scores-last descending-by-`arbitrage_score` rule (regression guard against a second,
    drifting sort implementation).
- **Files**: `frontend/src/lib/resumeSkills.test.ts`, `frontend/src/lib/gap.test.ts`,
  `frontend/src/test/fixtures/resumeSkills.fixture.ts`
- **Tipping Point**: N/A for Cypress; see Task 4.
```
```markdown
[FORCES]
1. Schema-validated LLM output + deterministic gap logic locked by test > trusting review alone
2. Simplicity > Pattern purity
```

## Task 4 — Redwood: implement the schema-validated extraction call + deterministic gap layer

```markdown
[SPEC]
- **Objective**: Make Task 3's tests pass — `extractResumeSkills(resumeText): Promise<string[]>`
  (invokes the Task 1 edge function via the existing `supabase` client, Zod-parses the response,
  throws a typed error on schema mismatch) and `computeSkillGap(rows, resumeSkills): { haveSkillKeys,
  rows }` (pure, deterministic, no I/O).
- **Inputs/Outputs**: per Task 3's fixtures/assertions exactly.
- **Design Pattern**: none — simple case; two pure/near-pure functions, no polymorphism earned yet
  (per Forced Decision #3's Tipping Point).
- **Bounded-AI boundary**: `extractResumeSkills` is the ONLY function in this task allowed to touch
  the LLM boundary (via the edge function), and its output is a flat `string[]`, nothing else.
  `computeSkillGap` is 100% deterministic — normalize, exact-match, partition, sort by the
  already-computed `arbitrage_score` (reusing `ArbitrageLadder`'s existing sort semantics, not a
  new one) — and MUST NOT compute, adjust, or re-derive any score.
- **Constraints**: adds `zod` as a new runtime dependency (authorized above — no other new
  dependency). `normalizeSkillName()` must match the case/punctuation/whitespace-folding
  methodology already documented in `README.md`'s join-strategy section (reuse, don't reinvent).
  Resume text itself must never be logged or persisted by this code.
- **Edge Cases**: per Task 3, plus: `computeSkillGap([], anything)` and
  `computeSkillGap(rows, [])` both return every row as a gap without throwing.
- **Files**: `frontend/src/lib/resumeSkills.ts`, `frontend/src/lib/gap.ts`,
  `frontend/src/lib/normalize.ts`, `frontend/package.json`
- **Tipping Point**: if V2 adds alias/fuzzy matching, `normalizeSkillName`/`computeSkillGap` need a
  real matching-strategy abstraction — this is where a Strategy pattern would first be earned; not
  needed for V1's exact-normalized-match rule.
```
```markdown
[FORCES]
1. Tests-as-contract (do not modify Cypress's tests) > implementation convenience
2. Simplicity > Pattern purity
```

## Task 5 — Cypress: failing tests for have/gap rendering + resume input

```markdown
[SPEC]
- **Objective**: Write failing tests for the resume-paste input flow and the have/gap visual state
  on the existing matrix/ladder/table components, before Magnolia implements.
- **Inputs/Outputs**: an extended `RoleSkillRow[]` fixture + a mocked `extractResumeSkills` →
  mounted `<App />` with a resume `<textarea>`, and `<SkillMatrix rows={...}
  haveSkillKeys={...} />` / `<ArbitrageLadder .../>` / `<SkillDataTable .../>` receiving the new
  prop directly.
- **Design Pattern**: N/A (Cypress does not choose Magnolia's implementation).
- **Bounded-AI boundary**: assert the rendered have/gap state traces verbatim to the deterministic
  `computeSkillGap` output, never to a raw LLM field rendered directly.
- **Constraints**: vitest + testing-library + jest-axe; test/fixture files only.
- **Edge Cases** (must be asserted — WCAG 2.2 AA, per the `dataviz` skill's non-color-only rule
  applying a second time to this new binary):
  - Pasting resume text and submitting calls `extractResumeSkills` with the exact textarea value,
    then `computeSkillGap` with the result and the current role's rows.
  - Every have-state point/ladder-item/table-row exposes a **non-color** differentiator (e.g. a
    `data-have` attribute plus a distinct glyph/label) from every gap-state one, in addition to the
    existing per-skill shape encoding — never color-only.
  - Accessible names/labels for have-state and gap-state items explicitly say so (e.g. "...you
    already have this skill" vs. "...gap").
  - The accessible `<table>` has an explicit have/gap column (text, not color-only).
  - Submitting with no role selected yet, or with empty/whitespace-only resume text, is blocked
    client-side with an inline `role="alert"` message — no call is made.
  - A pending extraction shows a `role="status"` loading state; an extraction failure shows
    `role="alert"` and never crashes the mounted app or the still-visible role profile.
  - `axe()` reports zero violations in the idle, loading, error, and populated (have+gap) states.
- **Files**: `frontend/src/App.test.tsx`, `frontend/src/components/matrix/SkillMatrix.test.tsx`,
  `frontend/src/components/matrix/ArbitrageLadder.test.tsx`,
  `frontend/src/test/fixtures/roleSkillProfile.fixture.ts`
- **Tipping Point**: N/A for Cypress; see Task 6.
```
```markdown
[FORCES]
1. WCAG 2.2 AA non-color-only encoding for the new have/gap state, locked by test > visual review alone
2. Simplicity > Pattern purity
```

## Task 6 — Magnolia: wire resume input + have/gap into the matrix, ladder, and table

```markdown
[SPEC]
- **Objective**: Make Task 5's tests pass — add the resume `<textarea>` + submit flow to `App.tsx`
  and thread `haveSkillKeys: Set<string>` through `SkillMatrix`, `ArbitrageLadder`, and
  `SkillDataTable` to render the have/gap binary as a second, non-color visual channel layered on
  top of the existing per-skill shape encoding from spec 003.
- **Inputs/Outputs**: `RoleSkillRow[]` + `haveSkillKeys: Set<string>` (from Task 4's
  `computeSkillGap`, unchanged) → the matrix/ladder/table with have vs. gap visually and
  programmatically distinguishable.
- **Design Pattern**: none — simple case; additive boolean prop on the three existing sibling
  components (Forced Decision #3), no new abstraction earned yet.
- **Bounded-AI boundary**: every rendered number and every have/gap flag traces verbatim to
  already-computed data (`RoleSkillRow` fields + `computeSkillGap`'s deterministic output); the LLM
  is invoked exactly once per resume submission, solely to produce the skill-string list consumed
  by Task 4's code — this component layer never calls Claude directly and never computes anything.
- **UI Scope**: structural — a new input control (resume textarea + submit) and a genuinely new
  visual state (have/gap) on the existing layout, not styling alone.
- **Intellectual Control**: re-invoke the `dataviz` skill (and `a11y-sec-2026`) before choosing the
  have/gap glyph/pattern, exactly as Task 7 of spec 003 did for the original shape encoding —
  reconfirm the chosen glyph clears the CVD/non-color bar stacked on top of the existing per-skill
  shape channel.
- **Constraints**: no new npm dependency without halting and requesting an updated `[SPEC]`. Cap
  the resume textarea's accepted length to match Task 1's edge-function limit (surface a client-side
  message rather than letting an oversized paste round-trip to the function and fail there). Never
  render, log, or persist the raw resume text anywhere beyond the controlled textarea state.
- **Edge Cases**: per Task 5 exactly.
- **Files**: `frontend/src/App.tsx`, `frontend/src/components/matrix/SkillMatrix.tsx`,
  `frontend/src/components/matrix/ArbitrageLadder.tsx`,
  `frontend/src/components/matrix/SkillDataTable.tsx`, `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: if a third visual state is ever needed (e.g. a "stretch"/partial-match skill),
  revisit the ad hoc `haveSkillKeys: Set<string>` boolean for a real enum-driven variant system
  before it turns into `if`/`else` sprawl across three components.
```
```markdown
[FORCES]
1. WCAG 2.2 AA data-viz constraints (Cypress's frozen tests) > visual polish
2. Simplicity > Pattern purity
```

---

**Relevant paths**: `README.md`, `AGENTS.md`, `SESSION_STATE.md`, `specs/003-role-picker-matrix.md`,
`frontend/src/App.tsx`, `frontend/src/lib/supabaseClient.ts`,
`frontend/src/components/matrix/SkillMatrix.tsx`,
`frontend/src/components/matrix/ArbitrageLadder.tsx`, `frontend/package.json`,
`supabase/migrations/0003_frontend_read_layer.sql`.
