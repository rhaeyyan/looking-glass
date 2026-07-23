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
- **Housekeeping pass while the user handled the manual Supabase cleanup step (below)**: no
  Claude-in-Chrome connection in this environment, so a live-browser verification pass wasn't
  possible solo — did a full-repo health sweep instead (`b5d303e`, `c5b7f2f`, pushed).
  - Fixed the two pre-existing lint items flagged-but-deferred across specs 004–006: sorted
    import blocks in `tests/test_arbitrage_score.py` and `tests/test_skill_core_join.py`
    (mechanical, `ruff --fix`); added a scoped `per-file-ignores` E501 exemption for
    `tests/test_ingest_parse.py` in `pyproject.toml` (the long lines are CSV fixture data
    transcribed verbatim from `data/schema-notes.md`, not wrappable code).
  - **Found and fixed a real gap spec 006 left behind**: `tests/test_extract_resume_skills_function.py`
    (spec 004 Task 2's characterization tests) reads
    `supabase/functions/extract-resume-skills/index.ts` for its assertions — Task 3 correctly
    deleted that source file (per the approved forced decision) but this now-orphaned test file
    was never in Task 3's file list, so it silently started erroring on every test (25 errors, 1
    failure) once the source it characterized was gone. Deleted the file — nothing left for it
    to guard.
  - Whole-tree health confirmed green end-to-end: `ruff check src/ tests/` all-pass, 218/218
    pytest, 104/104 vitest, `eslint .` clean, `tsc --noEmit` down to only the pre-existing
    `jest-axe` typing gap (unrelated, needs Cedar's dependency authorization — not fixed, per
    Workflow Rule 8).
  - Confirmed no stray scratch files in the repo (`git clean -ndx` showed only expected
    caches/env files/venvs).
  - Stopped the dev server (`npx vite --port 5173`) started for the aborted verification
    attempt — nothing was driving it.

- **User confirmed the manual Supabase cleanup (edge function + secret deletion) is done.**
  Started the dev server back up (`npx vite --port 5173`) and asked the user to try a live
  verification pass themselves, since no Claude-in-Chrome connection exists in this environment.
- **Found a second real live-environment gap via the user's screenshot**: the role picker failed
  with `column role_skill_arbitrage.salary_premium_pct does not exist`. Root cause: migration
  `0004_role_arbitrage_narration_fields.sql` (written in spec 005, appends
  `salary_premium_pct`/`median_days_open` to the `role_skill_arbitrage` view) was structurally
  test-verified but — like every migration in this project — was **never actually applied to the
  live Supabase database** (no live credentials in-agent). This was documented in each spec's
  text but never surfaced to the user as a required manual step the way the edge-function
  deletion was; that's a gap in how clearly this got communicated, not a code bug. Gave the user
  the exact migration SQL to run via the Supabase Dashboard's SQL Editor (same place they
  deployed the edge function earlier) — not yet confirmed applied/re-tested this session.
- Noticed the user's screenshot folder is `screenshot/` (singular) — `.gitignore` only excluded
  `screenshots/` (plural) from an earlier session, so the new folder was untracked and about to
  surface as noise (worse: it contains an actual resume with real name/certs in it — exactly the
  PII this project's Zero-Trust posture says should never land in the repo). Added `screenshot/`
  to `.gitignore` alongside the existing plural entry.

### Unfinished / blocked
- **Live verification is still blocked** on the user running migration 0004's SQL against the
  live database (see above) — the app's own code is correct; the deployed schema is one
  migration behind. Not yet confirmed resolved this session.
- Two documented, intentionally-not-fixed residual limitations in the new extractor (by design,
  not bugs — pinned by frozen tests): a single-letter vocabulary entry (e.g. `r`) still
  false-matches inside an unrelated abbreviation that tokenizes identically (`R&D`); a negation
  cue further back than the fixed scan window fails to suppress a match.
- `@types/jest-axe` still not authorized/added — frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime). Needs
  Cedar's sign-off (new devDependency) if the user wants it resolved.
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- No Claude-in-Chrome connection in this environment — live-browser verification depends on the
  user driving it themselves (screenshots) or the extension getting connected in a future session.

### Next Steps
- Confirm with the user that migration 0004's SQL (given to them verbatim) has been run against
  the live DB, then have them retry the role picker and full primary flow (pick role → paste
  resume with a mix of affirmed/negated skills → confirm have/gap + narration render correctly).
- **Do not ask the user to paste more real-resume screenshots/content into the conversation or
  repo if avoidable** — the `screenshot/` folder already has one with real PII in it; steer future
  verification toward synthetic/placeholder resume text where possible, consistent with the
  project's Zero-Trust "no real user PII" posture.
- If the user wants `@types/jest-axe` resolved, route it to Cedar for dependency authorization
  first (Workflow Rule 8) — don't add it directly.
- Once live verification passes end-to-end, README's full MVP scope is done, live-verified, and
  zero-LLM — worth a final wrap-up/tag moment when that lands.
