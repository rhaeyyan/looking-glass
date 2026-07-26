# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-25 (round 17: mobile header-overlap + skill-crowding fix, plus a genuine pre-existing CSS specificity bug found & fixed; round 16 Status-width fix)

> Specs 001–022 and rounds 1–11.5/12–12.8 are archived in
> [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md). Rounds 13–15 (sticky-Status ghosting fix, mobile-
> friendly table redesign, breakpoint widening 480px→640px — `62b01a5`, `e9bdb21`, `3ddbd9f`,
> `27554b4`, all pushed) are also archived there as of this round's ledger trim.

### Accomplished (round 16, this section)
- User sent a THIRD real-device screenshot: round 15's breakpoint fix DID take effect (Status
  correctly rendered icon-only, confirming 640px now covers their device) but flagged two new
  issues: "better but this is still not a good look."
  1. **Status column still a huge, mostly-empty capsule.** Root cause (confirmed by reading the
     code before touching anything): the 640px media block hides Status's text label and unpins
     it, but never overrides its WIDTH — it stayed at the base `9.5rem` (sized to fit the
     now-hidden text), so the pill (whose `border-radius`/`padding` live on the `<td>` itself per
     the spec-023 locked contract) rendered as a near-empty colored block around one tiny icon.
  2. **A solid black box glitch** in the Leverage column at one specific row ("css3") in the
     screenshot. Asked the user directly whether it was reproducible before spending any effort:
     confirmed "happens every time." Investigated by rendering the exact same role ("Frontend")
     and skill data locally and diffing the DOM: `css3`'s row markup was byte-identical to its
     neighboring demand-only rows (css, html, html5, ai) — same em-dash fallback, no distinguishing
     data. Could not reproduce the black box at all in a clean render. Concluded it's most likely a
     device-specific paint/compositing artifact, not a code bug — reported this finding back rather
     than guessing at a fix with no reproducible symptom.
  - This is technically the third real-device mobile report on this table (a prior round flagged a
    third report as the signal to stop patching numbers and revisit a full card-layout redesign) —
    but unlike the first two, this issue had a clean, fully-diagnosable root cause (a missing width
    override, not a design-tradeoff ambiguity), so a full redesign wasn't warranted; routed as a
    normal SIMPLE fix instead.
- Routed via **Pine** (SIMPLE — a value addition inside the already-approved spec-024 mechanism,
  independent of the spec-023 locked contract) → **Magnolia**, who added `width: 2.75rem` to
  `.lev-status`/`.lev-status-h` inside the existing 640px block, sized to comfortably fit the icon
  + existing padding with no text. 618/618 passing, `tsc`/`eslint` clean.
- Independently re-verified: reran the suite, diffed the CSS (one clean 7-line addition, nothing
  else touched), and screenshotted the actual "Frontend" role (matching the user's screenshot) at
  487px — Status is now a compact icon-sized pill, and Leverage/Demand/Scarcity are all visible on
  one screen with zero scrolling. Confirmed 768px desktop is byte-for-byte unaffected (`152px`/
  `9.5rem`, still sticky).
- User said "commit and push": **committed + pushed** as `5131405`.

### Accomplished (round 17, this section)
- User sent a FOURTH real-device screenshot: "this is an improvement, but we can do better."
  Confirmed via reproduced-locally computed geometry (not eyeballing): (1) the "STATUS"/"LEVERAGE"
  headers visually ran together — `.lev-status-h`'s 44px box had zero geometric overlap with its
  neighbor per `getBoundingClientRect()`, yet the rendered "STATUS" glyphs painted past the
  boundary since nothing clipped overflowing header text; (2) long skill names ("data
  visualization", "data engineering", "attention to detail", "data governance") visually crowded
  into the neighboring Status icon.
- This being the 4th consecutive round of real-device mobile issues (the exact trigger a prior
  round flagged for reconsidering the bigger card-layout redesign), asked the user directly via
  `AskUserQuestion` rather than unilaterally deciding: keep refining the table, or switch to a
  card/stacked mobile layout. **User chose: keep refining the table**, explicitly wanting a
  properly-validated fix this time, not another single-screenshot spot-check.
- Routed via **Pine** → **Cypress-first this time** (breaking the pattern): wrote a regression
  test asserting (a) `.lev-status-h` has `overflow: hidden`/`text-overflow: ellipsis` so header
  text can't bleed, and (b) `.lev-skill`'s available content width (declared width minus padding)
  is mathematically ≥ the longest real skill name's longest word ("visualization", ~93px) —
  honest in its report that both are heuristic proxies computed from the file's own real declared
  CSS numbers, not real browser rendering (jsdom applies no cascade/layout in this project's
  vitest config). Confirmed RED (619/621) before any implementation. **Magnolia** then fixed both:
  visually-hid the header's "Status" text the same clip-rect way body cells already are (rather
  than a meaningless truncated "S…"), and widened `.lev-skill`/`.lev-skill-h` from 6rem→8rem with
  documented margin math. This required Cypress to correct one now-stale test from round 14 that
  hardcoded `.lev-skill`'s width as exactly `'6rem'` — a legitimate update (the old value was an
  unvalidated guess, the new one is content-derived), not a shortcut. 621/621 passing.
- **Independently re-verifying this round caught a real bug the pipeline missed**: rendering
  "business intelligence" at 487px showed it still visually overlapping the Status icon despite
  the width fix. Investigated with real Playwright computed-style/`getClientRects()` inspection
  (not jsdom, which can't see this): `.lev-skill`'s computed `white-space` was `nowrap`, not the
  `normal` its own CSS declares — a previously-latent, PRE-EXISTING specificity bug (a more
  specific shared rule, `.leverage-table th, .leverage-table td { white-space: nowrap }`, has
  always silently outranked `.lev-skill`'s own `white-space: normal`, invisible until the mobile
  breakpoint narrowed the column enough to actually need wrapping). Fixed directly by raising
  `.lev-skill`/`.lev-skill-h`'s base-rule selector specificity (`.leverage-table .lev-skill` — two
  classes now outranks the shared rule's one-class-plus-element). This immediately broke the
  640px width override for the same reason (the override needed matching specificity too) —
  caught and fixed that regression myself before it ever reached a report. Cypress updated one
  test whose selector-matching regex needed to follow the new selector text, and added a new
  specificity-guard regression test (comparing class-token counts between the two competing rules)
  specifically so this exact bug class can't silently recur. Final: 622/622 passing, `tsc`/`eslint`
  clean.
- Verified thoroughly via real Playwright rendering (not just tests) at 487px (mobile) and 768px
  (desktop): headers no longer overlap, all previously-crowded skill names ("business
  intelligence" included) now wrap cleanly onto their own line inside the Skill column with clear
  separation from the status icon, and desktop is confirmed correct (and, as a side effect of the
  specificity fix, *more* correct than before — the same wrapping bug silently affected desktop
  too, just less visibly at the wider 9rem column).
- **Not committed** — asking the user before committing, per this session's established pattern.

### Unfinished / blocked
- **Round 17's fixes are implemented and independently verified but not committed.** Files:
  `frontend/src/components/matrix/matrix.css`,
  `frontend/src/components/matrix/SkillLeverageTable.tsx` (header label wrapped in a span),
  `frontend/src/components/matrix/SkillLeverageTable.test.tsx`.
- **Black-box glitch (round 16) remains unresolved and likely unfixable from our end** — confirmed
  reproducible by the user, but could not be reproduced locally with identical data/DOM. If it
  recurs, the next useful piece of evidence would be the user's specific device/browser (not just
  another screenshot), since the DOM/CSS itself checks out clean.

### Next steps
1. Get the user's go-ahead, then commit (and likely push, per this session's pattern) round 17's
   header/crowding/specificity fixes.
2. This was round 4 of real-device mobile issues, and the user already explicitly chose to keep
   refining rather than redesign — respect that choice, but if a 5th round surfaces, raise the
   card-layout redesign question again rather than assuming another narrow patch is still right.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
