# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22–23 (template narrator shipped; user reversed spec 004's
LLM-extraction decision; deterministic-extraction pivot now complete — zero LLM calls anywhere)

> Specs 001–003 (ingest, arbitrage score, role-picker matrix) are complete and archived — see
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

### Accomplished
- **`specs/004-resume-gap-layer.md`** (6 tasks, complete): README MVP step 4, LLM-based resume
  extraction via a Supabase Edge Function proxying OpenRouter. **Fully superseded this session**
  by spec 006 — kept here only for history.
- **`specs/005-template-narrator.md`** (6 tasks, complete, committed `b1c7371`…`4e1f42d`, pushed):
  README MVP step 5, deterministic template narration (`narrateTopGap()`). All 6 tasks passed on
  the first try, zero rejection-loop cycles.
- **User decision: abandon spec 004's LLM extraction, go fully deterministic.** Rather than
  picking a mitigation for spec 004's confirmed OpenRouter free-tier rate-limit blocker, the user
  reversed the earlier call and dropped the LLM from resume extraction entirely — completing the
  zero-LLM pivot spec 005 started for narration. This mooted the spec 004 rate-limit decision.
- **`specs/006-deterministic-extraction.md`** (5 tasks, complete, committed `835c269`…`90fa085`,
  pushed): vocabulary-scoped regex matching against the *currently-selected role's* skill list
  (not the full 141-skill catalog — anything outside the role profile is already discarded
  downstream by `computeSkillGap`). Every task passed on the first try, zero rejection-loop
  cycles, diff/test-verified independently at each step, committed and pushed individually per
  the user's explicit instruction this session.
  - **Task 1** (doc reconciliation, done directly by the orchestrator, not a subagent —
    prose-only, no TDD gate): `README.md`'s "Bounded AI, by design" section, step-5 pivot
    callout, and Stack "AI layer" bullet; `AGENTS.md`'s project-context flow line, Stack "AI
    layer" bullet, and Quality Standards Bounded-AI paragraph — all reconciled to state the app
    now makes **zero LLM calls anywhere** (first such state since spec 001), while explicitly
    keeping the bounded-single-call mechanism documented as a pattern-in-reserve. `3a3d271`.
  - **Task 2** (Cypress, RED, `e8df5be`): froze the new
    `extractResumeSkills(resumeText, vocabulary): string[]` contract — pure, synchronous, zero
    I/O — replacing the old LLM-response-shaped test file entirely. Flagged a real implementation
    trap for Task 3: a naive per-entry regex scan double-matches `C` and `C#` at the same
    position, since `#` satisfies `C`'s right-hand lookaround boundary too.
  - **Task 3** (Redwood, GREEN, `b5ff895`): rewrote `resumeSkills.ts` — lookaround-based boundary
    matching (not `\b`, since `normalizeSkillName` keeps `#`/`+`/`.` literal), regex-escaped
    vocabulary, a fixed `NEGATION_CUES` list scanned in a clause-bounded window, and longest-first
    overlap resolution (by string length, stable index tiebreak) that correctly resolves the
    `C`/`C#` trap Cypress flagged. Deleted `supabase/functions/extract-resume-skills/` entirely;
    removed `zod` from `frontend/package.json` (confirmed no other call site). 108/108 tests,
    zero regressions.
  - **Task 4a** (Cypress, RED, `feba15f`): updated `App.test.tsx` for the synchronous
    two-argument call site; deleted the now-impossible loading/error UI-state tests (a pure
    synchronous function has neither a pending window nor a realistic throw path).
  - **Task 4b** (Redwood, GREEN, `90fa085`, **completes spec 006**): `handleResumeSubmit` now
    calls `extractResumeSkills` synchronously with `rows.map(r => r.skill_name_raw)`; removed the
    `extractStatus`/`extractError` state pair and both dead render branches entirely — net
    `-24/+6` lines. Final suite: 104/104 vitest, `tsc --noEmit` clean of every error this spec
    touched (only pre-existing, unrelated `jest-axe` typing gaps remain).
- **User instruction this session, applied throughout spec 006's execution**: commit and push
  after each task/subtask completes, not just at the end.

### Unfinished / blocked
- **Outstanding manual step for the user** (cannot be done in-agent, no live Supabase
  credentials): run `supabase functions delete extract-resume-skills` and
  `supabase secrets unset OPENROUTER_API_KEY` against the live project to fully decommission the
  now-dead deployed function and its secret.
- Two documented, intentionally-not-fixed residual limitations in the new extractor (by design,
  not bugs — pinned by frozen tests): a single-letter vocabulary entry (e.g. `r`) still
  false-matches inside an unrelated abbreviation that tokenizes identically (`R&D`); a negation
  cue further back than the fixed scan window fails to suppress a match.
- `@types/jest-axe` still not authorized/added — frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime).
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- Two pre-existing lint items out of scope where found: long-line (`E501`) warnings in
  `tests/test_ingest_parse.py`, unsorted imports in `tests/test_skill_core_join.py`.

### Next Steps
- Remind the user about the manual Supabase cleanup step (function + secret) above.
- **README's MVP scope (all 5 steps) is now code-complete with zero LLM calls anywhere.** Do a
  full live-browser verification pass: pick a role, paste a resume with a deliberate mix of
  affirmed/negated/edge-case skill mentions, confirm have/gap + narration both render correctly
  against live Supabase data. This is the first live-verification opportunity for the whole
  primary flow, since spec 004's LLM path never got there.
- Confirm no stray scratch files landed in `looking-glass/` before the next commit.
