# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-26 (round 20: development report)

- Wrote `DEVELOPMENT_REPORT.md` — full narrative history, initial commit → post-mortem, sourced
  from the commit log plus `SESSION_STATE.md`/`ARCHIVED_SESSIONS.md`. Linked from README under a
  new "How it was built" section.
- Doc-only round; no oracle applies. Measured stats re-derived from the log rather than quoted:
  154 commits, 45 ledger-only (29%), 68 code-touching (44%), 71 `docs:` vs 28 `feat:` + 21 `fix:`,
  28 commits touching `matrix.css`.
- Next: unchanged from round 19 — user still needs `supabase migration repair --status applied`
  + `db push` against the live project.

---

## Round 19 — 2026-07-25 (post-mortem + orchestration overhaul)

- Team post-mortem on agent orchestration. Root finding: ceremony was priced by *file type*, and the
  verification environment was never part of any contract — so the harness could not reproduce what
  the user's thumb could.
- Shipped all 11 approved fixes: committed Playwright oracle harness (4 named profiles) with round
  18's touch-`:hover` fix pinned as a regression spec; `Verification Oracle` now a required `[SPEC]`
  field; Pine re-cut to INVARIANT/OBSERVABLE/UNKNOWN; invariants de-prosed to point at
  `tests/test_data_invariants.py`; Stop hook inverted to gate on the oracle, not on ledger prose.
- Verified: 10/10 e2e, 622/622 vitest, eslint+tsc clean. Oracle proven to *catch* the bug (removing
  the `@media (hover: hover)` guard fails 4 touch tests, including light mode — the variant invisible
  to the eye for 3 rounds). 16 pytest failures are pre-existing: `data/raw/` CSVs are gitignored.
- **Correction to round 18 below:** it records the hover fix as "Not committed"; it landed as
  `a83c6c6`. Left in place per the new append-only rule.
- Pushed to `main` (`614e03f`, `d3f1d79`, `526fc8a`); branch deleted. Then added CI
  (`.github/workflows/ci.yml`) and fixed two latent problems it surfaced: the data-invariant skip
  guard checked only that `data/raw/` existed, which a leftover `d4/Coursera.csv` from the dropped
  learning-resource feature kept alive — so 16 tests half-ran and failed on missing CSVs; and a bare
  `ruff check .` was 147 errors deep in vendored `.claude/skills/` code, which would have failed
  every Cypress audit. Now 202 passed / 16 cleanly skipped, ruff green.
- **CI cannot verify the data invariants** — they need the gitignored Kaggle extracts. CI prints the
  skip reasons (`-rs`) so a green check never implies they ran. Open option: a Kaggle secret + a
  fetch step would close this.
- Diagnosed the recurring `skills_core already exists` (42P07): the schema was applied by pasting
  DDL into the Dashboard SQL Editor, which records nothing in
  `supabase_migrations.schema_migrations`, so the CLI reads an empty ledger and replays from the
  first migration. This is round 9's unanswered "why does the user keep re-running these files".
  Fix is `supabase migration repair --status applied`, not re-running DDL — documented in
  `supabase/README.md` with a pre-flight introspection check.
- Added `supabase/config.toml` (the project was never `supabase init`'d) and renamed the migrations
  to the CLI's timestamp format; `supabase/.temp/` gitignored so no project ref is ever committed.
- Next: user still needs to run `migration repair` + `db push` against the live project — untested
  here by design (no CLI installed, and no agent-run commands against their production DB).

---

## Round 18 — 2026-07-25 (the "black box" mystery finally solved — stuck touch-`:hover` row highlight, not a rendering glitch)

> Specs 001–022 and rounds 1–11.5/12–12.8 are archived in
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md). Rounds 13–17 (sticky-Status ghosting fix,
> mobile-friendly table redesign, breakpoint widening, Status-width fix, header-overlap/skill-
> crowding fix + a latent specificity bug — `62b01a5`, `e9bdb21`, `3ddbd9f`, `27554b4`, `5131405`,
> `316868e`, all pushed) are also archived there as of this round's ledger trim.

### Accomplished (round 18, this section)
- User sent a FIFTH real-device screenshot: same recurring black rectangle (now visible on TWO
  rows in one screenshot — "next.js" and "responsive design"), plus a claim that "demand only,
  scarcity unknown" text was overlapping into other cells. Asked the user to confirm which issue
  they meant; they pointed specifically at the demand-only text.
- Investigated the text-overlap claim first: reproduced locally in light mode, dark mode (found the
  real theme toggle is a radio `<input>`, not a `<button>` — my first dark-mode attempt silently
  failed to switch themes), and directly against the LIVE production site with the user's exact
  role ("Frontend") — **could not reproduce any text overlap anywhere**; `.lev-demandonly`
  correctly inherits `white-space: normal`/`overflow-wrap: anywhere` from round 17's specificity
  fix and wraps cleanly in every render.
- **While testing in dark mode, personally reproduced the "black box" for the first time this
  session** (rows "redux" and "frontend"), finally making it investigable. Used
  `document.elementFromPoint()` plus a full ancestor-chain style dump at the black box's exact
  pixel coordinates — found the `<tr>` itself had `background: rgb(13, 13, 13)`, an exact match
  for `var(--page-plane)` (`#0d0d0d`) in dark mode. That's the value `.leverage-table tbody
  tr:hover` sets. Confirmed with certainty by explicitly hovering the ORIGINAL "css3" row (from
  round 16's very first report) and getting the identical `rgb(13, 13, 13)` — not a coincidence.
  **Root cause**: touch devices trigger a synthetic `:hover` on tap that never clears without a
  real pointer-leave event a mouse would send, "sticking" the hover highlight on whichever row was
  last touched. It only appeared in the non-sticky columns (Leverage/Demand/etc.) because the
  sticky Rank/Skill cells paint their own opaque background on top, masking it there — exactly
  matching every occurrence across 4 rounds: different arbitrary rows each time (wherever the
  user's finger last was), dark-mode-only visually dramatic (light mode's `--page-plane` is
  near-white, barely visible), always confined to non-sticky cells. This was never a rendering
  glitch, a data bug, or device-specific — it was a real, well-known category of CSS bug (stuck
  `:hover` on touch) that a headless-navigation Playwright script could never trigger, which is
  exactly why 3 prior investigation attempts failed to reproduce it.
- **Fixed directly** (diagnosis was airtight — exact color match, mechanism confirmed by explicit
  hover reproduction): wrapped `.leverage-table tbody tr:hover` in `@media (hover: hover)`, the
  standard fix so touch-only devices (which report `hover: none`) never receive the rule at all.
  622/622 tests still pass (nothing tests this exact rule). Verified with an actual
  touch-emulated Playwright context (`hasTouch: true, isMobile: true`, confirmed
  `matchMedia('(hover: hover)').matches === false`): hovering the "css3" row now leaves its
  background `rgba(0, 0, 0, 0)` — transparent, no stuck highlight — and a full-table screenshot on
  that touch device shows zero black boxes anywhere.
- **Not committed** — asking the user before committing, per this session's established pattern.

### Unfinished / blocked
- **Round 18's `@media (hover: hover)` fix is implemented and independently verified but not
  committed.** File: `frontend/src/components/matrix/matrix.css` only.
- The "demand only, scarcity unknown" text-overlap report could not be reproduced anywhere (light
  mode, dark mode, live production site, user's exact role) — most likely what the user actually
  saw was the black-box highlight sitting adjacent to/behind that italic subtext, visually reading
  as overlap. Round 18's hover fix should resolve this too; worth a fresh look from the user once
  deployed rather than treating it as a separate open issue.

### Next steps
1. Get the user's go-ahead, then commit (and likely push, per this session's pattern) round 18's
   `@media (hover: hover)` fix.
2. Ask the user to confirm on their actual device once deployed — this was the root cause of
   every "black box"/"overlap" report since round 16, so if it recurs after this fix, that would be
   a genuinely new and different symptom, not the same bug again.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
