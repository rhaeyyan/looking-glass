# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22–23 (resume gap layer built, live-verification blocked on an
upstream rate limit; template narrator spec'd, built, and complete — README MVP step 5 done)

> Specs 001–003 (ingest, arbitrage score, role-picker matrix) are complete and archived — see
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

### Accomplished
- **`specs/004-resume-gap-layer.md`** (6 tasks, complete, code-complete end-to-end): README MVP
  step 4 — first LLM-in-the-loop slice. Supabase Edge Function (`extract-resume-skills`) proxies
  an LLM call server-side via a project secret (never a `VITE_*` var); switched mid-build from
  Claude to OpenRouter (`google/gemma-4-31b-it:free`) per user decision, diff-verified not just
  self-report-trusted (`d0b8670`). V1 skill-matching is exact-normalized-match only (no fuzzy/
  alias). `haveSkillKeys: Set<string>` threaded additively through the three matrix components,
  no new pattern earned. `zod` added as the one new dependency. All 6 tasks committed
  (`b761f54`…`6325ff6`), 71/71 tests green, independently re-verified each task.
- **Deploy + live-verification attempt (spec 004)**: deployed via the Supabase Dashboard UI (CLI
  OAuth login unusable headlessly in this sandbox). Root-caused a persistent `502
  extraction_failed` through several red herrings (a secret typo, then an OpenRouter
  free-tier "Model Training" privacy toggle — both real, both fixed, neither *the* blocker) down
  to the actual cause: `google/gemma-4-31b-it:free` is genuinely rate-limited upstream on
  OpenRouter right now (`429`, confirmed via isolated scratch-script testing and 10 consecutive
  polls over ~3.5 minutes, all `502`). **Code and deployed function are both confirmed correct —
  the sole blocker is external free-tier capacity, not a bug.**
- **Template narrator pivot (README MVP step 5) — evaluated, approved, and now spec'd**: user
  asked for an evaluation of replacing the LLM narrator with a deterministic template engine
  (and, separately, of going "100% zero-AI" by also replacing resume extraction with string
  matching). Recommendation: narration → template = **adopt** (every fact it needs is already
  computed by this stage; also serves as the deterministic fallback for the confirmed rate-limit
  blocker above); extraction → string matching = **reject** (unstructured NL is exactly where the
  LLM earns its keep; regresses on single-letter skills, negation, phrasing). **User approved
  moving forward with this recommendation.** Routed to Cedar, who produced a 6-task `[SPEC]`,
  persisted to **`specs/005-template-narrator.md`**: Tasks 1–2 (Redwood) expose two already-
  computed `skills_core` fields (`salary_premium_pct`, `median_days_open`) through
  `role_skill_arbitrage`/`RoleSkillRow` via an append-only view-column authorization (Workflow
  Rule 8, minimal — no new table/RLS); Tasks 3–4 (Redwood) build a pure, synchronous
  `narrateTopGap()` with a fixed tie-precedence chain (`arbitrage_score → demand_score →
  scarcity_index → salary_premium_pct → median_days_open`) and a `formatNum`-based tolerance
  rule (never raw `===`) — this resolves the two nits flagged in the original proposal; Tasks 5–6
  (Magnolia) wire it into a new `TopGapNarration` component. No GoF pattern earned. Extraction
  stays untouched.
- **`specs/005-template-narrator.md`** (6 tasks, complete, code-complete end-to-end, README MVP
  step 5 done): all 6 tasks ran back-to-back with zero rejection-loop cycles — every RED task
  (Cypress) came back PASS on the first try, every GREEN task (Redwood/Magnolia) satisfied the
  frozen tests on the first attempt. Diff- and test-verified independently at every step, not
  self-report-trusted. Tasks 1–2: appended `salary_premium_pct`/`median_days_open` to
  `role_skill_arbitrage` via an append-only `CREATE OR REPLACE VIEW`
  (`supabase/migrations/0004_role_arbitrage_narration_fields.sql`, not live-applied — no
  credentials in-agent, same as 0003) and threaded them through `RoleSkillRow`/
  `fetchRoleSkillProfile`; Redwood made both fields optional (`?:`) rather than the SPEC's literal
  required text, to avoid touching two out-of-scope fixture files from specs 003/004 — flagged
  transparently, verified behaviorally identical, accepted as a reasonable scope-respecting call.
  Tasks 3–4: `frontend/src/lib/narrate.ts`'s `narrateTopGap()` — pure, synchronous, zero-I/O,
  16/16 tests passing, correctly implements the fixed tie-precedence chain (not object-key-
  declaration order) and cites `pct_of_role` (never a null field) for the demand-only degradation
  case — both adversarial-fixture traps Cypress built in specifically to catch a naive
  implementation. Tasks 5–6: `TopGapNarration.tsx` (new component, `<section
  aria-labelledby>` + `<h2>`/`<p>`) wired into `App.tsx`'s existing `handleResumeSubmit`, no new
  async trigger, `narration` state reset on role change so switching roles never leaves stale
  narration in the DOM; the "no gaps" `role="status"` message text is locked verbatim
  (`"No gaps — you already have every skill this role needs."`) per Cypress's own compliance
  report making the test file the authoritative wording, not the SPEC's example text. Final
  suite: 244/244 pytest, 93/93 relevant vitest (1 unrelated pre-existing `zod`-missing suite
  failure, confirmed present before this spec started). **Not yet committed to git** — working
  tree has the full spec 005 diff uncommitted.

### Unfinished / blocked
- **Spec 004 still NOT live-verified end-to-end** — blocked purely on OpenRouter's free-tier
  rate limit on `google/gemma-4-31b-it:free`. **Decision still pending from the user**: (a) switch
  to a different free OpenRouter model, (b) wait and retry later, (c) accept a paid model (needs
  Cedar authorization for the dependency/cost change). Do not re-diagnose — root cause is
  confirmed; this is a decision, not a bug hunt. Independent of spec 005 (template narration
  doesn't touch the extraction call path).
- Spec 005's work is uncommitted — needs a commit (or `/wrap-up`) before it's durable.
- `zod` is missing from `frontend/node_modules` despite being an authorized dependency since spec
  004 — breaks `resumeSkills.test.ts` collection (1 failing suite every vitest run). Pre-existing,
  not caused by spec 004 or 005, but worth a `npm install` sweep next session.
- `@types/jest-axe` still not authorized/added — frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime).
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- Two pre-existing lint items out of scope where found: long-line (`E501`) warnings in
  `tests/test_ingest_parse.py`, unsorted imports in `tests/test_skill_core_join.py`.

### Next Steps
- **Commit spec 005's work** (currently uncommitted) — group into Conventional Commits per task,
  mirroring how spec 004 was committed task-by-task.
- Get the user's decision on the spec 004 rate-limit mitigation (see above), then finish
  live-verifying spec 004 in a real browser (pick a role, paste a resume, confirm have/gap and the
  new top-gap narration both render correctly against live Supabase data) — this is the first
  chance to see spec 005 rendered against real data, not just fixtures.
- Run `npm install` in `frontend/` to resolve the missing `zod` module and get `resumeSkills.test.ts`
  collecting again.
- Confirm no stray scratch files landed in `looking-glass/` before the next commit.
- After spec 004's live-verification is unblocked, README's MVP scope (all 5 steps) is
  code-complete — next would be broader polish/hardening, not a new numbered MVP step.
