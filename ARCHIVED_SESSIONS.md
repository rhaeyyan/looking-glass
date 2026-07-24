# ARCHIVED_SESSIONS.md — Session History Archive

> Protocol (AGENTS.md): this file holds archived sessions moved out of
> [SESSION_STATE.md](SESSION_STATE.md) once it exceeds 150 lines or 5 historical sessions.
> Access this archive only when necessary to trace past implementation history or decisions.

## Archived Sessions

### 2026-07-22 — Ingest, arbitrage score, and role-picker matrix (specs 001–003)

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
- **Live browser verification of spec 003, completed**: dev server started (`npx vite --port
  5173`) to visually verify Task 7's matrix against live Supabase data; verified via user-supplied
  screenshots (Claude in Chrome not connected in this environment). Confirmed working: role
  picker, quadrant scatter with distinct point shapes (non-color encoding holds), full skill
  table, arbitrage ladder ranked descending with unscored skills pushed last and flagged. Bug
  found and fixed (`f653ce4`): `.ladder-item`'s CSS grid had 3 explicit column tracks for 4
  children — score wrapped instead of sitting inline; fixed with a 4th `5rem` track + right-align.
  Raw unrounded score floats also overflowed — added `frontend/src/lib/format.ts` (`formatNum`,
  `Math.round(v*100)/100`, deliberately not `toFixed(2)` to match a frozen test expecting `"7.3"`
  not `"7.30"`). Re-verified via a second round of screenshots. User populated `frontend/.env`
  with real credentials; `frontend/.env.example` deleted from disk intentionally (`298efa3`).
  `screenshots/` added to `.gitignore` (manual scratch artifacts, not repo content).

### 2026-07-22–23 — Template narrator, deterministic-extraction pivot, and full live verification
(specs 004–006, README MVP scope complete)

- **`specs/004-resume-gap-layer.md`** (6 tasks, complete): README MVP step 4, LLM-based resume
  extraction via a Supabase Edge Function proxying OpenRouter (`google/gemma-4-31b-it:free`).
  Live verification was blocked for a while on a confirmed, persistent upstream free-tier rate
  limit — root-caused empirically (secret typo and an OpenRouter privacy-toggle gotcha were real
  but not *the* blocker; isolated scratch-script testing found the actual `429`). **Fully
  superseded later this session by spec 006** — the user reversed course and dropped LLM
  extraction entirely rather than mitigate the rate limit.
- **`specs/005-template-narrator.md`** (6 tasks, complete, `b1c7371`…`4e1f42d`): README MVP step
  5, deterministic template narration (`narrateTopGap()`) replacing the originally-planned LLM
  narrator — every fact the rationale needs was already computed by this stage. Appended
  `salary_premium_pct`/`median_days_open` to the `role_skill_arbitrage` view (migration 0004);
  built a pure function with a fixed five-step tie-precedence chain and a `formatNum`-based
  tolerance rule (never raw `===`); wired a new `TopGapNarration` component into `App.tsx`. All 6
  tasks passed on the first try, zero rejection-loop cycles.
- **User decision: abandon spec 004's LLM extraction, go fully deterministic**, completing the
  zero-LLM pivot spec 005 started. **`specs/006-deterministic-extraction.md`** (5 tasks, complete,
  `835c269`…`90fa085`): rewrote `resumeSkills.ts` as a pure, synchronous, vocabulary-scoped regex
  matcher (lookaround-based word-boundary matching, regex-escaped vocabulary, a fixed
  `NEGATION_CUES` list scanned in a clause-bounded window, longest-first overlap resolution
  fixing a real `C`/`C#` false-merge trap Cypress caught). Two regressions from the original
  rejection were mitigated with honestly-documented residual limits, not claimed solved: a
  single-letter entry like `r` still false-matches inside `"R&D"`; a negation cue outside the
  scan window still slips through. Deleted the now-dead edge function and removed `zod`. Docs
  (`README.md`/`AGENTS.md`) reconciled first to state the app makes **zero LLM calls anywhere**
  — first such state since spec 001. All 5 tasks passed on the first try, zero rejection-loop
  cycles, committed and pushed individually per the user's explicit instruction.
- **Housekeeping pass**: fixed two pre-existing lint items flagged-but-deferred across specs
  004–006 (unsorted imports, a scoped E501 exemption for CSV-fixture literals); found and deleted
  a real gap spec 006 left behind — `tests/test_extract_resume_skills_function.py` characterized
  the now-deleted edge function's source and was silently erroring on every run once that source
  was gone. Whole tree confirmed green: `ruff` all-pass, 218/218 pytest, 104/104 vitest, `eslint`
  clean.
- **Live verification, completed end-to-end for the first time.** No Claude-in-Chrome connection
  in this environment, so verification ran via user-supplied screenshots. Found and fixed a real
  live-environment gap along the way: migration 0004 (spec 005) had only ever been structurally
  test-verified, never actually applied to the live Supabase database — surfaced as a live
  `column role_skill_arbitrage.salary_premium_pct does not exist` error. Gave the user the exact
  SQL to run via the Dashboard SQL Editor; independently confirmed the fix via a direct REST query
  against the live view before asking the user to retry. Final screenshots confirmed the full
  primary flow working live: role picker → resume paste → deterministic extraction (correctly
  affirming "ai"/"llm" from the resume text while correctly leaving "llms" as a gap, demonstrating
  the exact-match-only design decision holding on a real resume) → have/gap rendered with
  non-color badges on the matrix/ladder/table → a real, auditable top-gap narration citing actual
  arbitrage-score numbers. **README's full 5-step MVP scope is code-complete and live-verified,
  with zero LLM calls anywhere.**
- Also added `screenshot/` (singular) to `.gitignore` alongside the existing `screenshots/` entry
  — the new folder had a real resume with real PII in it, exactly what the project's Zero-Trust
  posture says should never land in the repo.

### 2026-07-23 — README's full MVP scope live-verified (milestone)

- **The entire primary flow is now live-verified end-to-end for the first time**: pick target
  role → paste resume → deterministic extraction → arbitrage-ranked have/gap → deterministic
  top-gap narration, all confirmed working against the real Supabase database via user-supplied
  screenshots. The app makes zero LLM calls anywhere in this flow.
- Found and fixed one real live-environment gap along the way: migration 0004
  (`salary_premium_pct`/`median_days_open` on `role_skill_arbitrage`) had only ever been
  structurally test-verified, never applied to the live database. Gave the user the exact SQL;
  independently confirmed the fix via a direct REST query against the live view before declaring
  it resolved.
- `screenshot/` (singular, contains real resume PII) added to `.gitignore` alongside the existing
  `screenshots/` entry.
- Two documented, intentionally-not-fixed residual limitations in the deterministic extractor (by
  design, not bugs — pinned by frozen tests): a single-letter vocabulary entry (e.g. `r`) still
  false-matches inside an unrelated abbreviation that tokenizes identically (`R&D`); a negation
  cue further back than the fixed scan window fails to suppress a match.
- `@types/jest-axe` still not authorized/added at that point — frozen test files surface a
  `jest-axe` TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime).
  Resolved later via spec 007 (local type shim, no new dependency).
- Lint hook (`post-edit-lint.sh`) still couldn't resolve `node` (didn't source nvm) at that point —
  fixed in the next session (resolves `node` from `~/.local/bin` or nvm, guards `set -u`).

### 2026-07-24 (round 1) — UI redesign, de-jargon copy pass, top-3 moves, table merge, dark-theme desync fix

- **Fixed the lint hook** (`post-edit-lint.sh`): it now resolves `node` from `~/.local/bin` or
  nvm under the hook's bare PATH and guards `set -u` on `$NVM_DIR`. Verified end-to-end (catches a
  real eslint error → exit 2).
- **Imported + implemented the claude.ai/design prototype** ("Looking Glass UI Redesign",
  `Looking Glass.dc.html`) into the real React app: ported the Industry design system
  (`src/styles/looking-glass.css` — blueprint cards, tokens, light+dark theme with an in-nav
  toggle), a two-column shell, a ready-score donut, and a high-leverage scatter framing. Kept the
  live Supabase path, the deterministic extractor, and the WCAG shape-encoded scatter (the
  prototype's color-only dots would have regressed the a11y bar).
- **De-jargon copy pass (UI text only — no schema/identifier rename):** "Arbitrage Score" →
  "Leverage Score" everywhere on screen; "Have"/"Gap" badges → "Already have"/"Worth learning";
  simplified the header/hint/axis wording. DB columns, the SQL view, and code identifiers
  (`arbitrage_score`, `ArbitrageLadder`) are deliberately unchanged.
- **Top gap → top 3 ranked moves:** added `narrateTopGaps` beside the untouched `narrateTopGap`
  (whose Bounded-AI provenance suite still passes as-is); it reuses `narrateTopGap` verbatim for
  the #1 headline and attaches per-move stat chips + short notes, every number `formatNum`-
  provenanced. `<TopGapNarration>` now renders the ranked shortlist.
- **Green:** vitest 108/108 (incl. axe), eslint clean, `vite build` clean. Updated the coupled
  tests (App, SkillMatrix, ArbitrageLadder, TopGapNarration, narrate) to the new copy/behavior.
- **Rebuilt the scatter to match the mockup** (user flagged the old clip-path "shapes" as
  unreadable and the points as crushed into the corner): removed the per-index shape channel
  (it encoded no real variable), switched to circular bubbles on **min-max-normalized** axes so
  points spread into the plot (raw scores span a narrow low range; raw numbers still show verbatim
  in labels + table — only positioning is scaled), added the mockup's high-leverage-zone diagonal
  gradient + guide labels + hover-reveal name pills, and replaced the have/gap text pill with a
  compact ✓/✕ glyph badge. WCAG non-color intent preserved via glyph + position + accessible name
  + table Status column. Updated the three `SkillMatrix` tests that were pinned to `data-shape`.
- **Ran it live** end-to-end (headless Chromium against the real `.env`/Supabase, synthetic resume,
  Backend role) in light + dark, zero page/console errors; screenshots in scratchpad confirm the
  redesign + the fixed scatter.
- **Merged "Skill profile for {role}" (standalone data table) + "Every skill, ranked by leverage"
  (arbitrage ladder) into ONE component**, `SkillLeverageTable.tsx`: a single ranked-by-leverage
  table with an inline leverage bar, every numeric column, and a Status (Already have/Worth
  learning) column — also serves as the scatter's accessible numeric alternative. Deleted
  `ArbitrageLadder.tsx`/`.test.tsx` and `SkillDataTable.tsx`; `SkillMatrix` no longer embeds a
  table, just a "figures are in the ranked table below" pointer. **Found + fixed a real regression
  during live verification**: the merged table's 10 columns overflowed the results card at normal
  desktop widths, silently scrolling the Status column out of view — fixed by reordering columns
  (#, Skill, Status pinned first) and making those three `position: sticky` so they never scroll
  out of view regardless of viewport width; the deeper metric columns scroll. Verified via
  screenshot at 1440px and 390px, light + dark. Also discovered (not fixed at that point, flagged
  as a separate gap): `matrix.css`'s dark-theme tokens only keyed off `prefers-color-scheme: dark`,
  never the app's own `data-theme` toggle in `looking-glass.css` — all prior "dark mode"
  screenshots set the OS color scheme in the browser context, which happened to match and masked
  this. 105/105 (net -3 from deleting Ladder's 10-test file + adding LeverageTable's 8-test file,
  minus removed table-alt tests in SkillMatrix), tsc/eslint/build clean.
- **UI polish pass (via Magnolia + ui-ux-pro-max / dataviz / frontend-design skills)** on three
  user asks: (1) responsiveness — `.nav` flex-wraps, new `max-width:520px` (gutters+type scale) and
  `max-width:560px` (ladder 5-col grid → wrapping flex; scatter shrinks 340→260px) breakpoints,
  `overflow-wrap` on long skill names, `.lg-results` `overflow-x:clip`; verified **no horizontal
  overflow** at 1440/390px. (2) role visibility — results column now opens with a visible
  `<h2>Skill profile for {role}</h2>` + "TARGET ROLE" kicker (table `<caption>` kept for a11y).
  (3) removed the redundant "X ranks above Y on leverage score: A vs B" headline from the top-moves
  panel — `TopGapNarration` dropped the `headline` prop, replaced with a static value-framing line;
  `narrate.ts` untouched (still returns `headline`, provenance suite intact). Touched App.tsx,
  TopGapNarration.tsx + .test, App.test, looking-glass.css, matrix.css. 108/108, tsc/eslint/build
  clean; re-screenshotted live in light+dark+mobile (Full Stack) — all three asks confirmed.
- **Fixed the `matrix.css` dark-theme desync** flagged above: its tokens now react to
  `:root[data-theme='dark']`/`[data-theme='light']` (mirroring `looking-glass.css`'s two-block
  pattern — a media-query block guarded against an explicit light override, plus an unconditional
  block for explicit dark), not just `prefers-color-scheme`. Verified live: OS color scheme forced
  to **light**, then clicked the in-app Dark toggle — `--surface-1`/`--text-primary` on
  `.matrix-root` flipped to dark values and the full page (including scatter + ranked table)
  rendered dark, confirming the toggle no longer desyncs from data-viz components. 105/105,
  tsc/eslint/build clean.
- Spec 007 (jest-axe local type shim, no new dependency) and this UI-polish pass are both
  committed and pushed to `main` this session.
