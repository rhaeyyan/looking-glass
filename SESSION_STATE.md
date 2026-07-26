# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-25 (round 18: the "black box" mystery finally solved — stuck touch-`:hover` row highlight, not a rendering glitch)

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
