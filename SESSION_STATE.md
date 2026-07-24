# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-24 (UI redesign + de-jargon copy pass + top-3 moves)

> Specs 001–006 (ingest through the deterministic-extraction pivot) are complete and archived —
> see [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for the full build narrative.

### Accomplished
- **Fixed the lint hook** (`post-edit-lint.sh`): it now resolves `node` from `~/.local/bin` or
  nvm under the hook's bare PATH and guards `set -u` on `$NVM_DIR`. Verified end-to-end (catches a
  real eslint error → exit 2). This clears a long-standing session-carried gap.
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
  desktop widths, silently scrolling the Status column out of view (the exact "texts properly
  contained" failure mode flagged earlier) — fixed by reordering columns (#, Skill, Status pinned
  first) and making those three `position: sticky` so they never scroll out of view regardless of
  viewport width; the deeper metric columns scroll. Verified via screenshot at 1440px and 390px,
  light + dark. Also discovered (not fixed, flagged as a separate pre-existing gap): `matrix.css`'s
  dark-theme tokens only key off `prefers-color-scheme: dark`, never the app's own `data-theme`
  toggle in `looking-glass.css` — all prior "dark mode" screenshots set the OS color scheme in the
  browser context, which happened to match and masked this; a user clicking the in-app Dark toggle
  while their OS is in light mode would see a dark page shell with light-styled data tables/scatter.
  105/105 (net -3 from deleting Ladder's 10-test file + adding LeverageTable's 8-test file, minus
  removed table-alt tests in SkillMatrix), tsc/eslint/build clean.
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
- Spec 007 (jest-axe local type shim, no new dependency) and the Magnolia UI-polish pass are both
  committed and pushed to `main` earlier this session (see `git log`).

### Unfinished / blocked
- None outstanding from this session — the table merge, the sticky-column overflow fix, and the
  dark-theme desync fix are all committed and verified (105/105, tsc/eslint/build clean, live
  screenshots in light/dark/mobile).
- No Claude-in-Chrome connection in this environment; live verification this session used a
  scripted headless-Chromium (`playwright-core`) driver instead — see the note below.

### Next Steps
- No specific next step is queued. Future work would be new/unspecced (further polish, or a
  genuinely new feature).
- Prefer synthetic resume text for any manual verification (Zero-Trust "no real user PII").
- Note: to screenshot the SPA this session, `playwright-core` + a headless Chromium were installed
  via `npx playwright install` (cached under `~/.cache/ms-playwright`). `playwright-core` was
  installed `--no-save`, so it is **not** in `package.json` — reinstall it (`npm install --no-save
  playwright-core@1.50.0`) if another live screenshot pass is needed.

---

## History

### Session 2026-07-23 — README's full MVP scope live-verified (milestone)

**Accomplished**
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

**Unfinished / blocked (as of that session)**
- Two documented, intentionally-not-fixed residual limitations in the deterministic extractor (by
  design, not bugs — pinned by frozen tests): a single-letter vocabulary entry (e.g. `r`) still
  false-matches inside an unrelated abbreviation that tokenizes identically (`R&D`); a negation
  cue further back than the fixed scan window fails to suppress a match.
- `@types/jest-axe` still not authorized/added — frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime). Needs
  Cedar's sign-off (new devDependency) before adding.
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- No Claude-in-Chrome connection in this environment — any future live-browser verification still
  depends on the user driving it themselves (screenshots) or the extension getting connected.

### Next Steps
- No specific next step is queued — README's MVP scope is done and live-verified. Future work
  would be new, unspecced (polish/hardening, or a genuinely new feature), not a numbered MVP step.
- If the user wants `@types/jest-axe` resolved, route it to Cedar for dependency authorization
  first (Workflow Rule 8) — don't add it directly.
- Steer future manual verification toward synthetic/placeholder resume text where practical,
  consistent with the project's Zero-Trust "no real user PII" posture — the `screenshot/` folder
  already has one real resume in it (gitignored, not committed, but worth avoiding going forward).
