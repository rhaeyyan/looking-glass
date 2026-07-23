# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22–23 (template narrator shipped; user then reversed spec 004's
LLM-extraction decision — deterministic-extraction pivot now in progress)

> Specs 001–003 (ingest, arbitrage score, role-picker matrix) are complete and archived — see
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

### Accomplished
- **`specs/004-resume-gap-layer.md`** (6 tasks, complete): README MVP step 4, LLM-based resume
  extraction via a Supabase Edge Function proxying OpenRouter. **Superseded this session** — see
  spec 006 below; kept here only for history.
- **`specs/005-template-narrator.md`** (6 tasks, complete, committed `b1c7371`…`4e1f42d`, pushed):
  README MVP step 5, deterministic template narration (`narrateTopGap()`). All 6 tasks passed on
  the first try, zero rejection-loop cycles. Final suite: 244/244 pytest, 93/93 relevant vitest.
  Full detail archived once superseded further; see prior turns of this session for the complete
  build narrative if needed.
- **User decision: abandon spec 004's LLM extraction, go fully deterministic.** Rather than
  picking a mitigation for spec 004's confirmed OpenRouter free-tier rate-limit blocker (switch
  model / wait / pay), the user reversed the earlier call and chose to drop the LLM from resume
  extraction entirely — completing the zero-LLM pivot spec 005 started for narration. This
  **moots the spec 004 rate-limit decision** (no longer relevant — extraction is being replaced,
  not fixed).
- **`specs/006-deterministic-extraction.md`** persisted (commit `835c269`) and in progress. Cedar's
  5-task SPEC: vocabulary-scoped regex matching against the *currently-selected role's* skill list
  (not the full 141-skill catalog — anything outside the role profile is already discarded
  downstream by `computeSkillGap`). Concrete, honestly-bounded mitigations for the two regressions
  that got this idea rejected the first time (in spec 005): lookaround-based word-boundary
  matching (documented residual: `vocabulary: ['r']` still false-matches inside `"R&D"`) and a
  fixed negation-cue list scanned in a clause-bounded window (documented residual: a negation cue
  outside the window still slips through). No alias/synonym folding added — unchanged from spec
  004. **Forced decisions, both approved**: (1) delete `supabase/functions/extract-resume-skills/`
  from the repo — the live deployment/secret need a manual `supabase functions delete` /
  `supabase secrets unset` from the user, no agent holds live credentials; (2) remove `zod` from
  `frontend/package.json` — its only call site was validating the LLM's response shape.
  - **Task 1** (doc reconciliation, done directly by the orchestrator, not a subagent — prose-only,
    no TDD gate, mirrors the OpenRouter-provider-switch precedent): `README.md`'s "Bounded AI, by
    design" section, its step-5 pivot callout, the arbitrage-ladder caption, and the Stack "AI
    layer" bullet, plus `AGENTS.md`'s project-context flow line, its Stack "AI layer" bullet, and
    the Quality Standards Bounded-AI paragraph — all reconciled to state the app currently makes
    **zero LLM calls anywhere** (first such state since spec 001), while explicitly keeping the
    bounded-single-call mechanism documented as a pattern-in-reserve, not deleting the concept.
    Committed `3a3d271`, pushed.
  - **Task 2** (Cypress, RED) dispatched, running in the background — no compliance report yet
    this session. Freezes the new `extractResumeSkills(resumeText, vocabulary): string[]` contract
    (pure, synchronous, zero I/O) as failing tests, replacing the old LLM-response-shaped test
    file entirely.
  - Tasks 3, 4a, 4b not yet dispatched.
- **User instruction this session: commit and push after each task/subtask completes**, not just
  at the end — apply this for the remainder of spec 006's execution.

### Unfinished / blocked
- **Spec 006 Task 2** (Cypress, RED) is running in the background — no result yet.
- Spec 006 Tasks 3, 4a, 4b remain — implementation, then App.tsx call-site tests, then App.tsx
  integration (deletes the now-dead `extractStatus`/`extractError` loading/error UI states).
- **Outstanding manual step for the user** (cannot be done in-agent, no live credentials): once
  spec 006 Task 3 lands, run `supabase functions delete extract-resume-skills` and
  `supabase secrets unset OPENROUTER_API_KEY` against the live Supabase project.
- Spec 004's rate-limit blocker is now moot (extraction is being replaced, not fixed) — no
  decision needed there anymore; do not resurrect it as an open question.
- `zod` is currently missing from `frontend/node_modules` (pre-existing gap, breaks
  `resumeSkills.test.ts` collection) — moot once spec 006 Task 3 removes the dependency entirely.
- `@types/jest-axe` still not authorized/added — frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime).
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- Two pre-existing lint items out of scope where found: long-line (`E501`) warnings in
  `tests/test_ingest_parse.py`, unsorted imports in `tests/test_skill_core_join.py`.

### Next Steps
- Read Task 2's `[COMPLIANCE-REPORT]` from Cypress when it lands; if PASS (correctly RED),
  dispatch Task 3 to Redwood (the new extractor implementation + edge-function/secret/`zod`
  removal), commit + push, then continue to Task 4a (Cypress) and Task 4b (Redwood).
- Remind the user about the manual Supabase cleanup step (function + secret) once Task 3 lands.
- Once spec 006 is complete: README's MVP scope (all 5 steps) is code-complete with zero LLM
  calls anywhere — do a full live-browser verification pass (pick a role, paste a resume with a
  deliberate mix of affirmed/negated/edge-case skill mentions, confirm have/gap + narration render
  correctly against live Supabase data). This is also the first live verification opportunity for
  spec 005's narration, since spec 004's LLM path never got there.
- Confirm no stray scratch files landed in `looking-glass/` before the next commit.
