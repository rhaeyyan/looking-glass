# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22–23 (Ingest, arbitrage_score, role-picker skeleton, and resume gap layer built; live deploy/verification of the resume gap layer in progress)

### Accomplished
- Reviewed the full repo against the multi-agent orchestration pipeline; ported missing
  `.claude/skills/`, `.claude/hooks/`, and two dangling handoff schemas from the seed repo.
  Committed `26e8d74`.
- **`specs/001-ingest-pipeline.md`** (7 tasks, complete): parse → normalize → join/corroborate/
  role-profile → Supabase schema (`skills_core`, `skill_role_profile`) + idempotent loader → docs
  reconciliation (139→141, 147→148, real drift found against the raw CSVs). `supabase-py` added
  as the one authorized dependency. Committed through `4d2e323`.
- **`specs/002-arbitrage-score.md`** (5 tasks, complete): `compute_arbitrage_score` → real
  `skill_arbitrage_scores` table + `arbitrage_scores` view + idempotent loader → README
  reconciliation. Live Supabase smoke test passed (RLS, exact row counts 141/450/141 against a
  real DB). Committed through `155c2ed`.
- **`specs/003-role-picker-matrix.md`** (7 tasks + one amendment, complete, live-verified) — MVP
  step 3, the first-ever frontend work: direct-to-Supabase client-side reads via the anon key (no
  backend API tier), new `role_skill_arbitrage` view, React/Vite/TS scaffold, a role picker →
  `fetchRoleSkillProfile` → accessible quadrant scatter (`SkillMatrix`) + arbitrage ladder
  (`ArbitrageLadder`) + accessible `<table>` fallback (`SkillDataTable`), all WCAG 2.2 AA (non-
  color shape encoding, keyboard-operable points, zero axe violations, reduced-motion respected),
  no charting dependency. 28/28 tests green. Notable mid-build fixes: RLS had only ever been
  enabled manually (never migrated) until Task 2 caught it; a global Testing Library `cleanup` was
  missing from the test harness (fixed, `ed7718c`) after Cypress found accumulating DOM renders
  corrupting accessible names. Final commit `f89fb5b`.

### Session addendum — live browser verification of spec 003, completed
- Dev server started (`npx vite --port 5173`, backgrounded) to visually verify Task 7's matrix
  against live Supabase data. Claude in Chrome extension not connected in this environment, so
  verification was done via user-supplied screenshots (Backend and Full Stack roles) instead of
  driven browser automation.
- **Confirmed working**: role picker, quadrant scatter with distinct point shapes (circle/
  triangle/square/diamond — non-color encoding holds), full skill table, and the arbitrage ladder
  correctly ranked descending with unscored skills (`ai`, `css`, `spring boot`, etc.) pushed last
  and flagged "Demand only, scarcity unknown."
- **Bug found and fixed** (`f653ce4`): `.ladder-item`'s CSS grid had 3 explicit column tracks for
  4 children (rank/name/track/score) — score wrapped to its own line instead of sitting inline at
  the bar's end. Fixed by adding a 4th `5rem` track + right-align. Separately, raw unrounded score
  floats (e.g. `291.323333333333`) overflowed that column and forced horizontal scroll — added
  `frontend/src/lib/format.ts` (`formatNum`, round-to-2dp presentation transform, Bounded-AI safe)
  used by `SkillDataTable`, `ArbitrageLadder`, and `SkillMatrix`'s point labels. Deliberately NOT
  `toFixed(2)` — that would render `"7.30"` and break the frozen Task 5 characterization test
  expecting `"7.3"`; used `Math.round(v*100)/100` instead to match. Re-verified via a second round
  of user screenshots: numbers now short and inline, no clipping. Full suite still 28/28 green.
- User populated `frontend/.env` with real credentials. In the process, `frontend/.env.example`
  (the committed placeholder template, no real secrets) was deleted from disk — user confirmed
  intentionally; deletion committed (`298efa3`).
- Ad-hoc verification screenshots landed in `screenshots/` — deliberately kept out of the repo as
  manual scratch artifacts; added `screenshots/` to `.gitignore` so this stops surfacing as
  uncommitted-changes noise every session-end check.

- **`specs/004-resume-gap-layer.md`** (6 tasks, approved by human): Cedar's SPEC for README MVP
  step 4 — first LLM-in-the-loop slice. Three forced decisions approved: (1) a new Supabase Edge
  Function (`extract-resume-skills`) proxies Claude server-side via a project *secret*
  (`ANTHROPIC_API_KEY`, never a `VITE_*` var) — rejected calling Claude directly from the browser
  as a Zero-Trust violation; (2) V1 skill-matching is exact-normalized-match only, no fuzzy/alias
  (per README's explicit V1 scope); (3) have/gap threaded as an additive `haveSkillKeys:
  Set<string>` prop on the existing three matrix components, no new pattern earned yet. New
  runtime dep approved: `zod`. Persisted; Tasks 1–6 authorized.
  - **Task 1** (Redwood, SPIKE, `b761f54`): built the repo's first Supabase Edge Function
    (`supabase/functions/extract-resume-skills/`) calling Claude server-side via forced tool-use.
    Caught and fixed a hallucinated model ID (`claude-opus-4-6` doesn't exist) on review.
  - **Provider switch, mid-Task-1**: user chose OpenRouter (`google/gemma-4-31b-it:free`, verified
    real via web search — released after this assistant's Jan-2026 cutoff) over Claude, for both
    extraction and future narration. Updated `AGENTS.md`/`README.md` first (`2687b5f`), had Cedar
    write a surgical amendment rather than let Redwood freelance it (`6a9a0c0`), Redwood
    implemented (`d0b8670`) — endpoint/secret-name/auth-header/tool-call-shape all changed, CORS/
    validation/statelessness untouched; diff-verified, not just self-report-trusted.
  - **Task 2** (Cypress, `25d561a` + spec reconciliation): characterization tests written against
    the real OpenRouter implementation, not the spec's stale Claude-era prose — 26/26 passing
    (independently re-verified), full suite 208 passed/16 skipped. Spec file's Task 2 section
    rewritten to match reality.
  - Edge function still undeployed, no live secret set (deploy steps in its README for the human).
- **Task 3** (Cypress, RED, `5dad61a`) → **Task 4** (Redwood, GREEN, `cc819b5`): built
  `frontend/src/lib/{resumeSkills,gap,normalize}.ts` + `zod` dependency —
  `extractResumeSkills()` (Zod-validates the edge function's response, named
  `ExtractionSchemaError` on failure) and `computeSkillGap()` (pure, deterministic have/gap
  partition, reusing `ArbitrageLadder`'s exact sort). `normalizeSkillName`'s regex verified
  byte-for-byte against `src/ingest/normalize.py`'s join-key logic, not just described. 49/49 tests
  pass, independently re-verified.
- **Task 5** (Cypress, RED, `e611f4e`) → **Task 6** (Magnolia, GREEN, `6325ff6`, **completes spec
  004**): resume textarea/submit wired into `App.tsx`; additive optional `haveSkillKeys?:
  Set<string>` threaded through `SkillMatrix`/`ArbitrageLadder`/`SkillDataTable` — omitted →
  byte-identical rendering to before, provided → `data-have` + visible `Have`/`Gap` badge +
  accessible-name suffix, layered on the existing shape encoding via a reserved status color ramp
  (never color-only, `dataviz` skill invoked first). 71/71 tests pass, independently re-verified;
  exactly the spec-authorized files touched each task. Resume gap layer (README MVP step 4) is
  code-complete end-to-end: pick role → paste resume → extract (OpenRouter) → Zod-gated →
  deterministic gap → have/gap rendered on the matrix/ladder/table.

### Deploy + live-verification attempt (spec 004, in progress)
- Supabase CLI (`npx supabase`) proved unusable in this sandbox: `supabase login`'s browser OAuth
  can't complete headlessly, and a `SUPABASE_ACCESS_TOKEN` exported in the user's own `!`-session
  shell does not propagate to the assistant's separate Bash-tool subprocess (confirmed empirically
  — different shell contexts despite both being called "this session"). Switched to deploying via
  the **Supabase Dashboard UI** instead (Edge Functions → paste `index.ts` → deploy), which
  succeeded.
- First verification curl (anon key, real project URL, from the assistant's Bash tool) returned
  `502 {"error":"extraction_failed"}` — correct generic-error behavior, but extraction itself was
  failing. Root-caused iteratively, each hypothesis tested empirically rather than guessed:
  1. Secret name/value typo in the dashboard's Secrets page — user found and fixed a wrong key
     value. Retried: still 502.
  2. Discovered via web search a real, documented OpenRouter gotcha: free-tier (`:free`) models
     reject requests with a data-policy 404 unless "Model Training" is enabled in OpenRouter
     account privacy settings (prompt data must be shareable with the free provider). User enabled
     it. Retried: still 502.
  3. Isolated further by having the user test **outside our function entirely**: a plain chat
     completion directly against OpenRouter with their real key → succeeded (200, real response) —
     confirms the key and the model itself both work. This means the bug is specific to our
     function's forced-tool-use request shape, not the provider/key/model.
  4. Next isolation step in flight: a scratch script
     (`/tmp/.../scratchpad/test_openrouter.sh`, **not** committed — a stray earlier copy was
     accidentally written into the repo root and has been deleted) sends the exact
     `tools`/`tool_choice` shape our edge function sends, run by the user with their own key, to
     confirm whether `google/gemma-4-31b-it:free` genuinely supports forced tool-use despite being
     listed as supporting "native function calling" — **result not yet reported back**.
- **specs/003 and specs/004 both code-complete.** specs/004 still not live-verified end-to-end —
  the deployed function is returning 502 on every real extraction attempt; root cause narrowed to
  the tool-use request shape but not yet confirmed or fixed.
- Task 6 note: `SkillMatrix`'s have/gap badge doesn't get the same `visually-hidden` duplicate-text
  span `ArbitrageLadder`'s does — deliberate (avoids ambiguous double-matches when a skill appears
  in both components at once), documented in Magnolia's completion report, not a gap.
- `@types/jest-axe` still not authorized/added — the frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` (does not affect vitest/runtime). Revisit with
  Cedar if a types dep is wanted.
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- Two pre-existing lint items flagged but out of scope where found: long-line (`E501`) warnings
  in `tests/test_ingest_parse.py`, unsorted imports in `tests/test_skill_core_join.py`.

### Next Steps
- **Get the result of the in-flight tool-use isolation test** (step 4 above) from the user, then:
  - If `google/gemma-4-31b-it:free` fails on forced tool-use directly: this is a real model
    limitation, not a code bug — needs a decision (different free model? relax to unforced
    `tool_choice: "auto"` with stricter response parsing? accept and document the gap?) rather than
    more guessing.
  - If it succeeds directly: the bug is in our function's exact request encoding vs. the isolation
    script's — diff them line by line (attribution headers? message content escaping? `max_tokens`
    field OpenRouter doesn't like?).
- Once extraction genuinely returns real skills end-to-end, finish live-verifying spec 004 in a
  real browser: pick a role, paste a resume, confirm have/gap renders correctly.
- Clean up: the scratch debug script lives in `/tmp/.../scratchpad/`, not the repo — confirm no
  other stray scratch files landed in `looking-glass/` before the next commit.
- After spec 004 is live-verified: README MVP step 5 (LLM narration) is next, unspecced, should
  reuse this OpenRouter/edge-function pattern.
- Optional cleanup someday: fix the lint hook's node/nvm PATH resolution; consider `@types/jest-axe`.
