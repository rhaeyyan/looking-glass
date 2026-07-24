# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-24 (round 3: 15-role expansion + Coursera learning-resource scoping)

> Specs 001–007, the same-day earlier round (redesign, de-jargon, top-3 moves, table merge,
> dark-theme desync fix), and the 2026-07-23 milestone session are archived in
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

### Accomplished (round 3, this section)
- User asked what other Kaggle datasets/features could help career changers, and whether the DB
  supports more target roles. **Investigated and confirmed: yes, already does.** The ingest
  pipeline loads D3's full `skills-2026-by-role.csv` unfiltered (450 rows / 15 roles) into
  `skill_role_profile`, and `role_skill_arbitrage` joins across all 15 with no role filter. The
  6-role limit lives in exactly one place: `frontend/src/lib/roles.ts`'s `ROLES` const.
- User asked to add all 9 remaining roles (Frontend, Data Analyst/BI, Mobile, Security, QA,
  Business Analyst, Designer, Product Manager, Project/Program Mgr — confirmed PM and
  Project/Program Mgr are distinct role_family rows, not duplicates) and to prioritize a
  skills → learning-resource mapping feature.
- **Routed the role expansion through Cedar** (Rule 1 — touches docs asserting a "6-role" ship
  gate, not just cosmetic). Cedar confirmed via `tests/test_data_invariants.py` that the
  backend/ingest layer is already fully tested for all 15 roles — this is pure frontend enum
  widening, zero scoring/schema changes. Resolved one open design question without inventing new
  UI: the existing per-skill "demand only, scarcity unknown" flag already handles thin-coverage
  ("Weak" tier) roles role-agnostically, so no role-level coverage-tier badge is needed.
  **Two SPECs written, user-approved, persisted**:
  [specs/011](specs/011-widen-roles-to-fifteen.md) (widen `ROLES` to all 15 verbatim
  `role_family` strings, Cypress→Redwood) and
  [specs/012](specs/012-correct-role-coverage-docs.md) (correct README/AGENTS' stale "V1 ships
  six roles" framing, Redwood, sequenced after 011 lands). Committed (`fed6f8b`).
- **Spec 011: Cypress's failing tests landed** — `roles.test.ts` rewritten to a 15-role
  set-equality/no-duplicates/slash-spacing/Designer-parenthetical contract, `App.test.tsx`'s
  option-count assertion updated 7→16. 5 red (as expected — `roles.ts` still only has 6), 29
  pre-existing App tests unaffected, eslint clean. **Redwood now dispatched** to widen
  `roles.ts`; not yet returned.
- **Learning-resource mapping scoped as a separate, much bigger track** — it needs a new Kaggle
  dataset not yet in this repo. Recommended candidates via web search (Coursera 2025/2024 skill-
  tagged datasets, Udemy as fallback); user downloaded **Coursera 2025**
  (`data/raw/d4/Coursera.csv`, gitignored, same pattern as D1/D2/D3).
- **Dispatched Birch to validate D4** against the exact same rigor as the original
  `data/schema-notes.md` D1/D2/D3 pass: real column names, grain, null audit, and critically
  whether D4's skill representation actually joins against the existing 141-skill vocabulary
  (exact match + the documented normalization scheme). Not yet returned as of this write — this
  result gates whether Cedar can even write a viable ingest spec; no ingest spec exists yet and
  none should be written before Birch reports back.

### Accomplished (round 2 — whole-app UI/UX + dataviz pass, specs 008–010)
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
- **Spec 011**: Redwood implementing (widening `roles.ts` to 15 roles) against Cypress's 5 red
  tests; not yet returned. **Spec 012** (docs correction) is blocked on 011 landing.
- **Coursera D4 validation**: Birch dispatched to audit `data/raw/d4/Coursera.csv`'s real schema
  and test the join against the 141-skill core; not yet returned. No ingest spec exists yet and
  none should be written until this lands — it determines whether the learning-resource mapping
  is even viable with this dataset.
- Round 2 (specs 008/009/010, `@types/node`, font swap) remains fully merged/pushed — no
  carryover blockers from that part of the day.

### Next Steps
1. Check on the backgrounded Redwood agent (spec 011); when it returns, verify 147+5-ish tests
   green (confirm exact new total), eslint/tsc clean, then commit and dispatch Redwood for
   spec 012 (docs correction).
2. Check on the backgrounded Birch agent (D4 schema/join audit); when it returns, relay findings
   to Cedar only if the join is viable — do not write an ingest spec on a bad/thin join without
   surfacing that to the user first.
3. If resume upload is revisited later: route through Cedar first for dependency authorization
   (pdf.js at minimum) before any implementation.
4. Prefer synthetic resume text for any manual verification (Zero-Trust "no real user PII").
5. Note: `playwright-core` (headless Chromium driver used for live screenshots in an earlier
   session) was installed `--no-save`, so it is **not** in `package.json` — reinstall it
   (`npm install --no-save playwright-core@1.50.0`) if another live screenshot pass is needed. A
   live browser pass on round 2's UI work (empty/loading states, scatter legend/tap-reveal/motion,
   new typography) hasn't been done yet — only automated tests — worth doing before considering
   that round fully verified.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
