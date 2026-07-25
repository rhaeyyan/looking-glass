# ARCHIVED_SESSIONS.md — Session History Archive

> Protocol (AGENTS.md): this file holds archived sessions moved out of
> [SESSION_STATE.md](SESSION_STATE.md) once it exceeds 150 lines or 5 historical sessions.
> Access this archive only when necessary to trace past implementation history or decisions.

## Archived Sessions

### 2026-07-25 — Sticky-Status ghosting fix (round 13), mobile-friendly table (round 14), breakpoint widening (round 15), via the real Pine→Cedar→Cypress→Redwood/Magnolia pipeline

- **Round 13 — sticky-Status ghosting, real fix**: round 12.8's `@media (max-width: 560px)`
  mobile-unpin only masked the bug below that breakpoint; user proved via screenshot it still
  ghosts at full desktop width and asked for the actual multi-agent pipeline instead of another
  direct patch. Ran it for real: **Pine** classified COMPLEX (2 failed patches = Rule 9 circuit
  breaker) → **Cedar** diagnosed the true root cause (a sticky element's translucent `background`
  is a single paint layer; a two-layer composite — translucent tint over opaque
  `var(--surface-1)`, same declaration, same already-locked selector — fixes it at every width
  unconditionally, no DOM change needed) and persisted
  `specs/023-fix-leverage-table-sticky-status-opacity.md`; user approved via `AskUserQuestion`
  (HITL) → **Cypress** amended 2 assertions in `SkillLeverageTable.test.tsx` first, confirmed they
  failed red against the old CSS → **Redwood** implemented the fix and deleted the now-redundant
  560px stopgap. 608/608 passing. Independently re-verified: reran the suite, diffed the CSS, and
  screenshotted 1280px desktop mid-scroll before/after via `git stash`. **Committed + pushed**:
  `62b01a5`.
  Also fixed in the same round — **metric-column crowding** (Salary Premium/Days-to-fill/%-of-Role
  columns ran text together when scrolled, since `table-layout: fixed` only had explicit widths on
  the sticky lead columns): routed via **Pine** → **Magnolia** (no Cedar SPEC needed, first
  attempt). Magnolia added an explicit `<colgroup>` with per-column widths and let the two
  prose-like cells (Salary Premium, "Confirmed across postings" header) wrap instead of
  overflowing. 608/608 passing. **Committed + pushed**: `e9bdb21`.
  Also cleared 2 stale "still open" ledger items this round: the round-8 README refresh turned out
  to already be committed (`fc69f21`), and the round-10 favicon was confirmed by actually viewing
  the PNG assets (clean "LG" monogram, both sizes) rather than trusting a stale note.
- **Round 14 — mobile-friendly leverage table**: user supplied a real-device mobile screenshot
  (~430 CSS px, not simulated) showing the three sticky/pinned columns (`.lev-num` 2.25rem +
  `.lev-skill` 9rem + `.lev-status` 9.5rem ≈ 332px) eating almost the entire phone width. Routed
  via **Pine** → **Cedar** (COMPLEX — a real design tradeoff, not a cosmetic tweak, on a table with
  a recent track record of under-solved ad hoc patches). Cedar explicitly rejected a full
  card/stacked-layout mobile restructure (too much DOM/a11y risk for the gain) and specced a
  decisive, minimal fix: below 480px, unpin only Status (keep Rank+Skill pinned), shrink
  `.lev-skill` from 9rem→6rem, visually-hide (clip-rect, not `display:none`) the Status label text
  so only the ✓/✕ glyph shows. Persisted `specs/024-mobile-friendly-leverage-table.md`; user
  approved via `AskUserQuestion`. **Cypress** wrote failing tests first (613/618 → exactly the 5
  intended RED failures), **Magnolia** implemented against them (618/618 passing). Independently
  re-verified at 428px (matching the user's device) and 768px desktop — confirmed the label text
  stays connected to the DOM (never removed), just visually clipped. **Committed + pushed**:
  `3ddbd9f`.
- **Round 15 — breakpoint widening after real-device retest**: user tested round 14's fix on their
  actual phone and it visibly did NOT apply. Verified directly against the LIVE production site
  (not just local dev) via Playwright: confirmed the deploy was current and the fix DID work
  correctly at a simulated 428px viewport — so the fix itself was never broken. Round 14's chosen
  breakpoint (480px, picked without real-hardware validation) simply didn't cover the user's
  actual device, whose effective CSS viewport is apparently wider than 480px (real phones can
  report a wider viewport than physical size implies, especially with browser zoom/display-scale
  settings). Asked the user directly rather than guessing a third number blind; user chose to
  widen the breakpoint generously to ~640px. Routed via **Pine** (SIMPLE — a user-decided value
  change inside an already-approved mechanism, no fresh Cedar SPEC, Rule 9 doesn't apply since the
  human supplied the corrective decision directly) → **Magnolia**, who changed the media query to
  640px and updated Cypress's breakpoint-literal test assertions to match. 618/618 passing.
  Independently re-verified by sweeping 8 viewport widths (428–768px), confirming the exact
  transition sits at 640/641px, and specifically that 487px (the user's estimated actual device
  width) now correctly triggers the mobile layout. **Committed + pushed**: `27554b4`.

### 2026-07-25 — Glass-parity cleanup (round 12), polish pass (12.5), hover/motion (12.6), leverage-table sticky-column overlap fixes (12.7/12.8)

- **Round 12 — corner-bracket/glass-parity cleanup**: corrected a stale round-11 ledger note (specs
  018-022 had already landed in `aa9d239`, verified via `npx vitest run`, 608/608). User said the
  live app still looked unpolished vs. the Claude-Design mockup; found every card still had leftover
  pre-glass `.blueprint > .corner` bracket ticks, and the results-column cards were still on the
  inert (transparent-in-dark-mode) spec-017 `--glass-tint/--glass-alpha` pair rather than spec-019's
  real `--glass-2` token. Removed all corner-bracket markup/CSS; added `.lg-results .card.blueprint`
  (mirrors the existing sidebar rule); restyled `.btn-primary`/`.lg-step-badge` to a metallic
  gradient; gave `.nav`/`.seg` glass chrome; flipped `.lev-status` to soft-fill. 608/608 passing,
  zero test edits. **Committed + pushed**: `c043929`.
- **Round 12.5 — closer visual match pass**: diffed 4 user-supplied screenshots against the mockup;
  found the scatter's have/gap glyph key and the leverage table's Status column both lacked the
  mockup's pill-chip styling (`.matrix-legend*` had zero CSS), headers weren't uppercase/tracked,
  and the bubble fill was a flatter 3-stop gradient vs. the mockup's 5-stop "marble" band. Added the
  legend chip markup/CSS, reshaped `bandedMetalFill()` to 5 stops, added ✓/✕ icon spans to the
  Status pill (kept in a separate inner span so `getByText('Already have')`-style exact-match RTL
  assertions still resolved). 608/608 passing, zero test edits. User said "only commit" (not push):
  **committed** as `d4ad589`, left un-pushed at the time (later pushed alongside round 12.7, see
  below).
- **Round 12.6 — hover/motion pass**: cross-referenced the mockup's `.dc.html` inline
  `style-hover`/`transition`/`animation` attributes against the app; most were already implemented,
  three were missing (`.topmove` cards had zero hover CSS, the leverage table had no row-hover, the
  scatter bubble hover never deepened its shadow). Added all three, gated behind
  `prefers-reduced-motion`. First attempt used `var(--shadow)` (a glass-v2 token) and broke
  `glass-v2-tokens.test.ts`'s boundary rule that matrix.css may only reference two spec-020-
  authorized glass-v2 tokens; fixed by building the shadow from matrix.css's own `--border` token
  instead. 608/608 passing. **Committed + pushed**: `1188418`.
- **Round 12.7 — mobile sticky-column overlap at rest**: user reported the Status pill visually
  overlapping the skill name next to it on a mobile screenshot. Root cause: `.leverage-table` never
  set `table-layout: fixed`, so auto layout could widen the sticky `.lev-skill`/`.lev-status`
  columns past the widths their hard-coded sticky `left` offsets assumed; separately, `.lev-status`'s
  `7rem` width was too narrow for "✕ Worth learning" text, which overflowed onto the skill column
  under `white-space: nowrap`. First attempt (wrap the pill in an inner span to fix the width issue)
  broke `SkillLeverageTable.test.tsx`'s locked contract requiring `border-radius`/`padding`/
  `position:sticky`/background directly on `.lev-status` itself — reverted. Landed fix: added
  `table-layout: fixed`, widened `.lev-status`/`.lev-status-h` to `9.5rem`. 608/608 passing,
  verified via before/after Playwright screenshots at a 390px viewport (no `chromium-cli` binary
  available in this environment; used the `run` skill's generic dev-server + Playwright fallback
  pattern). **Committed + pushed**: `d5ba193` (also pushed `d4ad589` from round 12.5 in the same
  push, `1188418..d5ba193`).
- Round 12.8 (mobile sticky-column overlap *while scrolling* — a deeper root cause the 12.7 fix
  didn't reach) was still uncommitted as of this archiving pass — see `SESSION_STATE.md`'s current
  session section for that entry's detail, not archived here yet.
- Still open from this session: round 8's README Stack/Status refresh (not yet committed) and
  round 10's favicon visual confirmation (machine-verified only) — see the entry above and the one
  below for detail.

### 2026-07-24/25 — Migration-error diagnosis (round 9, no changes), favicon redesign swap (round 10, shipped)

- **Round 9 — recurring `skills_core already exists` migration error**: user repeatedly hit
  `42P07`/`42710`/`42601` errors re-running `supabase/migrations/*.sql` files directly in the SQL
  Editor/`psql` (no CLI migration tracking involved). Diagnosed each error correctly: 0001-0004 were
  already fully applied against the linked Supabase project from an earlier session (confirmed via
  `information_schema` introspection queries the user ran and pasted back); a later `42601` syntax
  error was traced to copy-paste corruption (a dropped closing paren) in whatever the user pasted,
  not a defect in the repo file (`cat -A` confirmed the committed file is byte-correct). End state:
  DB schema fully up to date, nothing further needs to run; *why* the user kept re-running these
  files was never answered (low-priority, not pursued). **Diagnostic-only — no files changed.**
  Also committed this round's own ledger housekeeping (archiving rounds 5-8, trimming
  `SESSION_STATE.md`): `a3bc079`, `91d4f0d`, `3d6f3c0`, `a3869de`, pushed to `origin/main`
  (`306753b..a3869de`). `assets/` (untracked, containing `favicon_io`) was pre-existing, left as-is,
  not investigated.
- **Round 10 — favicon redesign swap**: user replaced `assets/favicon_io/`'s source files
  (previously-untracked) with a new icon design, same 8 filenames as before. Confirmed 1:1 filename
  match against `frontend/public/`'s existing favicon set, copied all 8 over (`site.webmanifest`
  byte-identical, the other 7 modified). Confirmed no test files or `index.html` needed updates.
  Verified via dev server + `curl /favicon.ico` → `200`. Committed the 7 changed files as `7210e55`
  (`feat: swap frontend favicon to new design`) and pushed (`78796e0..7210e55`).
  `assets/favicon_io/` deliberately left untracked (source-of-truth question asked, unanswered);
  `assets/` was added to `.gitignore` in round 11 to stop it re-flagging as untracked cruft every
  turn. **Still open**: no human/browser visual confirmation of the new favicon has been reported
  back (only machine-verified via curl).

### 2026-07-23/24 — Light-mode contrast/wrapping/glassmorphism (specs 015–017), dark-mode glass-alpha fix (round 6), Vercel deploy fix (round 7), README refresh (round 8)

- **Round 5 — light-mode contrast, responsive wrapping, glass-ui**: user reported light-mode text
  too low-contrast, text blocks overflowing/wrapping awkwardly, and requested glassmorphism design
  elements reflecting the "Looking Glass" name. Investigated with real computed WCAG contrast
  ratios before routing: `--color-accent` (#5980a6) measured 3.71:1, failing AA's 4.5:1; only 2
  elements in the whole stylesheet had `overflow-wrap`/`min-width: 0` set. Routed through Cedar,
  who re-verified and found more failures: `--have-tone` borderline (4.489:1), `.lg-donut-label`'s
  opacity dimming failing, `--text-muted` (matrix.css) failing on all 3 surfaces, and
  `.matrix-zone-hi` wrongly borrowing a data-identity chart color as label text. For wrapping,
  audited and found exactly 2 real bugs: `.topmove`'s grid column missing `minmax(0, 1fr)`, and
  `.nav-brand` unable to shrink/wrap. For glassmorphism, scoped strictly to `.card.blueprint`/
  `.nav` chrome (light mode only), built on corrected tokens, matrix.css's opaque chart surfaces
  never touched.
  **Three SPECs written, approved, persisted**: [specs/015](specs/015-fix-light-mode-contrast.md),
  [specs/016](specs/016-fix-responsive-text-wrapping.md),
  [specs/017](specs/017-glassmorphism-card-nav-chrome.md), sequenced 015→016→017. Committed
  (`6a93b9f`).
  **Spec 015 shipped** (`716971a`): `--color-accent` → `#416180` (5.78:1), `--have-tone` →
  `#1a7a4b` (4.78:1), `.lg-donut-label` dropped opacity dimming (14.79:1), `--text-muted` →
  `#6b6862` (4.96:1 tightest), `.matrix-zone-hi` repointed to `--text-secondary` (7.53:1). Dark
  mode left byte-identical. A stale spec-008 regression-guard test hardcoding the old
  `--have-tone` value was correctly identified as stale (not a defect) and updated. 188/188 vitest.
  **Spec 016 shipped** (`116bb90`): `.topmove`'s grid column fixed (`minmax(0, 1fr)`),
  `overflow-wrap: anywhere` added, `.nav-brand` given `min-width: 0` + `flex-wrap: wrap`. 197/197
  vitest.
  **Spec 017 shipped** (`9e7cbe2`): `.card.blueprint`/`.nav` render translucent blurred surfaces
  (`rgba(255,255,255,0.55)` + `backdrop-filter: blur(12px)`); every text/UI color re-verified
  against the new glass surface (`--color-text` 15.19:1, `--color-accent` 5.94:1). Dark mode
  redeclares only inert glass tokens (`--glass-alpha: 1`, `--glass-blur: 0`) — pixel-identical to
  pre-spec. Mid-build, a genuine cross-spec test conflict was found and resolved properly: spec
  015's `colorTokens.test.ts` strict-`toEqual`'d the dark-mode block (rejecting any extra key),
  colliding with spec 017's need to add inert dark-mode glass tokens. Verified empirically (added
  a token, watched the test fail, reverted), then narrowly extended the guard to allow-list
  `--glass-*` keys specifically. 248/248 vitest, eslint/tsc clean.
- **Round 6 — dark-mode glass-alpha regression fix**: user supplied a screenshot showing dark mode
  broken post-spec-017 (solid white nav, unreadable card text). Root-caused from the actual CSS:
  `--glass-alpha: 1` in dark mode meant fully OPAQUE (not "inert" as spec 017 assumed) — the
  correct inert value is `0`. Both the implementation and its own tests had faithfully encoded the
  same wrong assumption. Fixed via TDD: Cypress corrected both test files' inert-value assertions
  (4 tests correctly flipped red against the still-buggy CSS first), then Magnolia flipped
  `--glass-alpha: 1` → `0` in both dark-mode blocks. 248/248 vitest. Committed (`d307eb7`) and
  pushed.
- **Round 7 — Vercel deploy fixed end-to-end**: user hit `Error: No python entrypoint found`.
  Root cause: no `vercel.json` existed, so Vercel auto-detected a framework from the repo root,
  found `pyproject.toml` (the backend's Python project file, never meant to be deployed) and tried
  to build it as a Python serverless function. Added a root `vercel.json` — did not fix it, since
  the Vercel dashboard's Root Directory was set to `frontend`, so Vercel looked for `vercel.json`
  *inside* `frontend/`, ignoring the root-level file entirely. Fixed by moving `vercel.json` into
  `frontend/` (paths simplified accordingly). Committed (`fbad320`) and pushed.
  App then reported as "doesn't populate." Diagnosed via `curl -I` (not guessed): a preview URL
  was 302-redirecting to Vercel's SSO wall (Deployment Protection, not a bug) — redirected the
  user to the production domain instead. Production returned `200` but rendered blank; diagnosed
  by pulling the built JS bundle and grepping it — no `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  values were baked in, confirming missing env vars at Vercel build time (Vite inlines
  `import.meta.env.*` at build time, not runtime). `frontend/src/lib/supabaseClient.ts:9` calls
  `createClient(undefined, undefined)` unguarded at module top level — throws before React mounts,
  silent blank page, no error boundary (flagged as a future-spec gap, not fixed this round).
  Directed the user to add both env vars to Vercel Settings → Environment Variables (Production)
  and redeploy. **User confirmed the app is now properly deployed.**
- **Round 8 — README refresh (doc-only)**: updated README's Stack and Status sections, stale
  since before round 7's deploy fix and specs 007–017. Verified current state first (read
  SESSION_STATE.md, listed `specs/` — 17 specs exist vs. README implying only 001–006 — ran
  frontend suite: 248/248 vitest, 17 test files). Added a Deploy row (Vercel, `frontend/
  vercel.json`, live at `https://looking-glass-zeta.vercel.app/`). Reworded Status to "built,
  live-verified, and deployed" and summarized specs 007–017. No code changed, no tests added.
  **Unresolved at archive time**: `playwright-core` (used for live screenshots) was installed
  `--no-save`, so it's not in `package.json` — reinstall (`npm install --no-save
  playwright-core@1.50.0`) if another live screenshot pass is needed. A live browser pass on round
  2's UI work, round 4's salary-premium phrasing, and round 5's contrast/wrapping fixes was never
  done — only automated tests. If resume upload is revisited, route through Cedar first for
  dependency authorization (pdf.js at minimum). Prefer synthetic resume text for manual
  verification (Zero-Trust "no real user PII").

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

### 2026-07-24 (round 2) — Whole-app UI/UX + dataviz pass, specs 008–010

- User asked for another whole-app UI/UX + data-viz pass and explicitly authorized relaxing the
  standing `Simplicity > Pattern purity` [FORCES] default. Routed through Cedar first (Workflow
  Rule 1). **Cedar investigated and declined to use the relaxed permission**: no genuine repeated
  variance in the frontend (one chart, one table, one donut) — all three specs kept
  `Design Pattern: none`.
- **Three SPECs written, user-approved, persisted, all shipped and merged**, each via Cypress (red
  tests) → Magnolia (implementation) → verify green:
  - **008** (`dd04372`): unified `--have-tone`/`--learn-tone` (+surface) tokens across the donut,
    scatter, and table, replacing the old disjoint `--color-accent`/`--gap-tone` vs.
    `--status-good`/`--status-critical` pair.
  - **009**: `.lg-results` now shows a Step-1 placeholder card when idle and a shaped,
    `aria-hidden` skeleton (scorecard/scatter/table blocks) while loading. Shimmer gated behind
    `prefers-reduced-motion`.
  - **010**: scatter gained an always-visible legend (color-tier + ✓/✕ glyph meaning), a
    tap-accessible reveal (`aria-pressed`/`data-revealed`, additive to hover/focus), and a
    settle-in position transition on role change (gated behind `prefers-reduced-motion`).
  - **Worktree note**: 009's and 010's Magnolia agents each got sandboxed into their own fresh
    worktree rather than the one Cypress used (harness isolation); verified byte-identical intent,
    rebased onto post-008 `main`, reran the full suite (147/147), fast-forward merged. All stale
    worktrees + branches removed after merge.
- `npx tsc --noEmit` surfaced a recurring gap: 9 errors ("Cannot find module 'node:fs'/'node:url'/
  'node:path'") across 3 new static-CSS-parsing test files. **Cedar authorized `@types/node`** as a
  devDependency (Rule 8) — rejected a hand-rolled shim (Node's builtin surface too large to
  hand-maintain, unlike spec 007's narrow jest-axe shim). Added `@types/node@^22.20.1` +
  `"node"` to `tsconfig.json`'s `types` array. `tsc --noEmit` 0 errors (was 9); 147/147 vitest,
  eslint clean. Committed (`4f35f4c`), pushed to `origin/main` (`369a20a`).
- User asked about a resume-upload option (PDF/DOCX) — **declined for this build**: a new
  client-side parsing dependency (pdf.js/mammoth) needs Cedar dependency authorization and expands
  the Zero-Trust surface. User chose to keep the paste-box as-is.
- **Font system swap (Poppins/Inter/JetBrains Mono), user-approved directly** (cosmetic-only, no
  Cedar SPEC needed): used the `ui-ux-pro-max` skill's typography domain to find the "Modern
  Professional" pairing; user picked Poppins (headings) + Inter (body), plus a third token
  **JetBrains Mono** applied only to digit-heavy table cells (rank, leverage-bar readout, demand/
  scarcity/salary-premium/days-to-fill). Replaces Barlow/Barlow Condensed. Preserved the existing
  `var(--font-heading, inherit)`/`var(--font-body, system-ui)` fallback chains. Committed
  (`a33d59b`), pushed.

### 2026-07-24 (round 3) — 15-role expansion + Coursera learning-resource scoping

- User asked what other Kaggle datasets/features could help career changers, and whether the DB
  supports more target roles. **Confirmed: yes, already does** — the ingest pipeline loads D3's
  full `skills-2026-by-role.csv` unfiltered (450 rows / 15 roles), and `role_skill_arbitrage` joins
  across all 15 with no role filter. The 6-role limit lived in exactly one place:
  `frontend/src/lib/roles.ts`'s `ROLES` const.
- User asked to add all 9 remaining roles and prioritize a skills → learning-resource mapping.
  **Routed the role expansion through Cedar** (Rule 1 — touches docs asserting a "6-role" ship
  gate). Cedar confirmed the backend was already fully tested for all 15 roles — pure frontend
  enum widening. Resolved one open design question without inventing new UI: the existing
  per-skill "demand only, scarcity unknown" flag already handles thin-coverage ("Weak" tier) roles
  role-agnostically.
  **Two SPECs (011, 012) written, approved, shipped**: widened `ROLES` to all 15 verbatim
  `role_family` strings (Cypress→Redwood, `f2998b2`); corrected README/AGENTS' stale "V1 ships six
  roles" framing (Redwood, `925c1a0`). 148/148 vitest, eslint/tsc clean.
- **Learning-resource mapping: investigated, then dropped.** User downloaded the Coursera 2025
  skills dataset (`data/raw/d4/Coursera.csv`, gitignored). Birch's first pass (proxy vocabulary)
  flagged concerns: messy row grain (courses cross-listed across `Subject`), no license file, and
  a naming-convention mismatch (D4 uses expanded forms — "Amazon Web Services" not "AWS" — that the
  case-fold-only `normalize_skill()` won't bridge).
  Pulled the **real 141-skill vocabulary live from Supabase's `skills_core` table** (anon-key REST
  endpoint, no new dependency) instead of asking the user to re-extract D1/D2, and had Birch re-run
  the join test for real:
  - Exact match: 33/141 (23.4%). Current normalization: 36/141 (25.5%).
  - + generic "strip trailing (Qualifier)" rule: 56/141 (39.7%).
  - + a hand-curated ~27-entry alias table: **83/141 (58.9%) — realistic ceiling.**
  - **41% of the core (58 skills) genuinely absent from D4 under any spelling** — concentrated in
    modern GenAI (`AI Agents`, `RAG`, `LangChain`), data-eng/observability tooling (`Airflow`,
    `dbt`, `MLflow`), and current cloud-native tools (`FastAPI`, `Next.js`, `GraphQL`).
  - Searched for a better alternative dataset — nothing found looked meaningfully better; the
    problem is structural (a static course scrape lags fast-moving GenAI/tooling vocabulary), not
    a matter of picking a different file.
  - **User decision: drop the feature for now.** `data/raw/d4/Coursera.csv` left in place
    (gitignored, harmless) in case a better dataset/approach surfaces later — no ingest code
    written, nothing to revert.
- Both rounds pushed to `origin/main`.

### 2026-07-24 (round 4) — Salary-premium clarity, specs 013–014

- User asked what a negative `salary_premium_pct` means. Explained: it's a raw D1 field (no floor
  clip in `src/scoring/arbitrage.py` — only `min(value, 100)` upper-clips), so a negative value is
  genuine evidence the skill pays *below* baseline, not a data error, and it genuinely pulls
  `scarcity_index` down, unlike a missing value (which renormalizes weights instead).
- User asked to make this concept clearer in the UI. Chose both plain-language reframing ("12%
  above typical pay" instead of bare "+12%") and an accessible baseline-definition affordance,
  applied consistently to the leverage table AND the narration text.
- **Routed through Cedar** (touches `narrate.ts`'s Bounded-AI narration logic + an accessibility-
  pattern decision). Cedar found the D1 dataset's own manifest (which would state the exact
  baseline) is gitignored and absent from this repo — chose conservative, sourced wording
  ("typical pay for that skill's job category") rather than inventing precision. Found no existing
  tooltip/disclosure pattern to reuse, ruled out native `title` (not WCAG-2.2-AA-sufficient) —
  spec'd an always-visible footnote + `aria-describedby` instead of a new interactive popover.
  Also caught a real risk before it became a bug: the frozen Bounded-AI provenance suite (spec
  005's `assertEveryNumberIsProvenanced`) would fail once negative values render via `Math.abs()`
  instead of their signed form — authorized a narrow, field-scoped extension of that check
  (salary_premium_pct only), not a general loosening.
  **Two SPECs (013, 014) written, approved, shipped**: `formatSalaryPremiumPhrase` helper +
  narrate.ts wiring (`362d080`, 162/162 vitest); table cell + accessible footnote (168/169,
  eslint/tsc clean, axe-clean).
- **Cross-spec regression found, fixed, and merged**: spec 009's App.test.tsx had a brittle
  assertion — "fewer than 3 `[aria-hidden=\"true\"]` descendants of `.lg-results`" — used as a
  proxy for "the loading skeleton is gone." Spec 014's legitimate new `aria-hidden` footnote
  marker coincidentally broke that threshold. Cypress rescoped all 5 affected assertions to the
  real `.lg-skeleton`/`.lg-skeleton-block` selectors spec 009 introduced, immune to future
  collisions. **169/169 vitest, eslint/tsc clean.** Committed (`04c6d91`), pushed.
