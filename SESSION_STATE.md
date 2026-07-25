# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-25 (round 13: leverage-table sticky-Status ghosting, real fix via Pine→Cedar→Cypress→Redwood pipeline)

> Specs 001–022 and rounds 1–11.5 are archived in [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).
> Rounds 12–12.7 (glass-parity cleanup, visual polish, hover/motion, sticky-column overlap-at-rest
> fix — `c043929`, `d4ad589`, `1188418`, `d5ba193`, all pushed) are also archived there.

### Accomplished (round 13, this section)
- **Round 12.8 (this session's prior entry) is superseded** — its `@media (max-width: 560px)`
  mobile-unpin "fix" only masked the sticky-Status-column translucency ghosting below that
  breakpoint. User sent a fresh screenshot proving it still ghosts at full desktop width
  (~1280px) and, fairly, called two same-session ad hoc patches "shoddy" and asked for the actual
  multi-agent pipeline instead of another direct patch.
- Ran the real pipeline this time: **Pine** classified it COMPLEX (2 failed direct-patch attempts
  = Rule 9's circuit breaker) and routed to **Cedar**. Cedar diagnosed the true root cause — the
  sticky `.lev-status[data-have='true'/'false']`'s translucent (~14%-alpha) `background` is a
  SINGLE paint layer; anything scrolling underneath a sticky element shows through unless that
  layer is opaque — and designed a fix that needs no DOM change: make `background` a two-layer
  composite (`linear-gradient(var(--status-X-surface), var(--status-X-surface))` on top, opaque
  `var(--surface-1)` underneath, same declaration, same already-locked selector). This also meant
  the 560px stopgap could be deleted outright, since the fix holds at every width unconditionally.
  Persisted as `specs/023-fix-leverage-table-sticky-status-opacity.md`; user approved via
  `AskUserQuestion` before dispatch (HITL checkpoint).
  - Cedar's spec also explicitly authorized a narrow amendment to 2 assertions in
    `SkillLeverageTable.test.tsx` (loosening an exact-value match to a contains-match, since the
    background becomes multi-layer) — confirmed none of the other 5 "locked" test files
    (`glass-v2-tokens.test.ts`, `glassmorphism.test.ts`, `nav-sidebar-glass-restyle.test.ts`,
    `scorecard-glass-restyle.test.ts`, `SkillMatrix.test.tsx`, `colorTokens.test.ts`) reference
    `.lev-status` at all, so only one test file needed touching.
  - **Cypress** applied the amendment first (TDD — red before green): confirmed the two new/
    amended assertions correctly FAILED against the still-unfixed CSS (606/608), proving they
    test the real mechanism, before any implementation changed.
  - **Redwood** then implemented Cedar's exact two-layer CSS fix and deleted the now-redundant
    560px stopgap. 608/608 passing, `tsc`/`eslint` clean.
- Independently re-verified all of this myself rather than trusting the reports: reran
  `npx vitest run` (608/608), diffed the actual CSS change (net negative line count — a value swap
  plus a deletion, no new selectors/tokens), and screenshotted a 1280px desktop viewport
  mid-horizontal-scroll before and after (via `git stash`/`stash pop` to compare against the
  pre-fix code) — confirmed the Status pill ghosting is genuinely gone post-fix and was genuinely
  present pre-fix. Noted a separate, pre-existing text-crowding issue in the non-sticky Salary
  Premium/Days-to-fill/% of Role columns, present in both before/after shots — out of scope for
  this spec, flagged to the user as a distinct issue, not fixed here.
- **Not committed** — asking the user before committing, per this session's established pattern.

### Unfinished / blocked
- **Round 13's fix is implemented and independently verified but not committed.** Files:
  `frontend/src/components/matrix/matrix.css`, `frontend/src/components/matrix/
  SkillLeverageTable.test.tsx`, plus the new `specs/023-fix-leverage-table-sticky-status-opacity.md`
  (untracked).
- **Separate, out-of-scope bug spotted but not fixed**: the Salary Premium / Days-to-fill / % of
  Role columns have their own text-crowding/overflow issue when the table is scrolled, visible in
  both the before- and after-fix screenshots from this round — pre-existing, unrelated to the
  sticky-Status ghosting this round fixed. Not yet reported as its own task.
- Favicon visual confirmation (round 10) and the README Stack/Status refresh commit (round 8) are
  still open from prior rounds — see [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for detail.

### Next steps
1. Get the user's go-ahead, then commit (and likely push, per this session's pattern) round 13's
   `matrix.css` + `SkillLeverageTable.test.tsx` fix and the new spec file.
2. Ask the user whether the Salary Premium/Days-to-fill/% of Role column crowding (spotted this
   round, out of scope) should become its own follow-up task.
3. Confirm with the user that the new favicon design actually looks right once they've seen it
   live (Vercel auto-deploys `origin/main`).
4. Commit the `README.md` Stack/Status refresh from round 8 (still not yet committed).

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
