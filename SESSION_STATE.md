# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-24 (round 2: whole-app UI/UX + dataviz pass, specs 008–010)

> Specs 001–007, the same-day earlier round (redesign, de-jargon, top-3 moves, table merge,
> dark-theme desync fix), and the 2026-07-23 milestone session are archived in
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

### Accomplished
- User asked for another whole-app UI/UX + data-viz pass and explicitly authorized relaxing the
  standing `Simplicity > Pattern purity` [FORCES] default. Routed through Cedar first (Workflow
  Rule 1). **Cedar investigated and declined to use the relaxed permission**: no genuine repeated
  variance in the frontend (one chart, one table, one donut) — all three specs kept
  `Design Pattern: none`. Rule 7 working as intended.
- **Three [SPEC]s written, user-approved, persisted**: [specs/008](specs/008-unify-status-color-tokens.md),
  [specs/009](specs/009-results-empty-loading-states.md), [specs/010](specs/010-scatter-legend-touch-motion.md).
- **All three specs shipped and merged to `main`**, each via Cypress (red tests) → Magnolia
  (implementation) → verify green:
  - **008** (`dd04372`): unified `--have-tone`/`--learn-tone` (+surface) tokens across the donut,
    scatter, and table, replacing the old disjoint `--color-accent`/`--gap-tone` vs.
    `--status-good`/`--status-critical` pair.
  - **009**: `.lg-results` now shows a Step-1 placeholder card when idle and a shaped,
    `aria-hidden` skeleton (scorecard/scatter/table blocks) while loading, instead of blank
    space / a bare sentence. Shimmer gated behind `prefers-reduced-motion`.
  - **010**: scatter gained an always-visible legend (color-tier + ✓/✕ glyph meaning), a
    tap-accessible reveal (`aria-pressed`/`data-revealed`, additive to hover/focus) for crowded
    point labels, and a settle-in position transition on role change (gated behind
    `prefers-reduced-motion`).
  - **Worktree note**: 009's and 010's Magnolia agents each got sandboxed into their own fresh
    worktree rather than the one Cypress used (harness isolation), and independently
    recreated/copied the test files to build against — both original Cypress worktrees also
    branched before 008 merged. Verified byte-identical intent, rebased the working commits onto
    post-008 `main`, reran the full suite (129/129 then 147/147), confirmed eslint clean, then
    fast-forward merged. All four stale worktrees + branches removed after merge.
  - **Final state on `main`: 147/147 vitest, eslint clean.**
- `npx tsc --noEmit` had surfaced a recurring gap: 9 errors ("Cannot find module 'node:fs'/
  'node:url'/'node:path'") across the 3 new static-CSS-parsing test files. **Cedar authorized
  `@types/node` as a devDependency** (Rule 8) — rejected a hand-rolled shim (unlike spec 007's
  narrow jest-axe shim, Node's builtin surface is too large to hand-maintain). Redwood implemented:
  added `@types/node@^22.20.1` to devDependencies (full-semver pin, matching the existing
  `@types/react*` convention already in this file) and `"node"` to `tsconfig.json`'s `types` array
  (required — one is already explicitly declared as `["vite/client"]`, so TS won't auto-include
  new `@types/*` packages without being listed). **`tsc --noEmit` now 0 errors (was 9); vitest
  147/147 and eslint stayed clean.** Committed (`4f35f4c`).
- All of the above pushed to `origin/main` (`369a20a`).
- User asked about a resume-upload option (PDF/DOCX) as a low-lift check — **declined for this
  build**: a new client-side parsing dependency (pdf.js/mammoth) needs Cedar dependency
  authorization (Rule 8) and expands the Zero-Trust surface (parsing untrusted file content), so
  it's a real feature, not a quick swap. User chose to keep the paste-box as-is.
- **Font system swap (Poppins/Inter/JetBrains Mono), user-approved directly** (cosmetic-only, no
  Cedar SPEC needed): used the `ui-ux-pro-max` skill's typography domain to find the "Modern
  Professional" pairing, user picked **Poppins (headings) + Inter (body)** over the recommended
  Open Sans body, then approved a third token, **JetBrains Mono**, applied only to digit-heavy
  table cells (rank, leverage-bar readout, demand/scarcity/salary-premium/days-to-fill — NOT
  headings/body/categorical columns). Replaces the old Barlow/Barlow Condensed pair. Preserves the
  `var(--font-heading, inherit)`/`var(--font-body, system-ui)` fallback chains verbatim. Magnolia
  built it (3 files: looking-glass.css, matrix.css, SkillLeverageTable.tsx); verified independently
  (147/147 vitest, eslint clean, tsc clean, zero remaining "Barlow" references). Committed
  (`a33d59b`) and pushed to `origin/main`.

### Unfinished / blocked
- None outstanding from this round. All three UI/UX specs (008/009/010), the `@types/node`
  cleanup, and the font-system swap are merged, pushed, and green. Whole tree: 147/147 vitest,
  eslint clean, tsc clean.

### Next Steps
- No specific next step queued — this round's scope (whole-app UI/UX + data-viz pass, plus the
  font swap) is complete. Future work would be new/unspecced.
- If resume upload is revisited later: route through Cedar first for dependency authorization
  (pdf.js at minimum) before any implementation.
- Prefer synthetic resume text for any manual verification (Zero-Trust "no real user PII").
- Note: `playwright-core` (headless Chromium driver used for live screenshots in an earlier
  session) was installed `--no-save`, so it is **not** in `package.json` — reinstall it
  (`npm install --no-save playwright-core@1.50.0`) if another live screenshot pass is needed. A
  live browser pass on 009/010/font-swap (empty/loading states, scatter legend/tap-reveal/motion,
  new typography) hasn't been done yet this round — only automated tests — worth doing before
  considering this fully verified.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
