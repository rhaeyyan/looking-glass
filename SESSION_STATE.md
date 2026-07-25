# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-25 (round 13: sticky-Status ghosting fix + metric-column crowding fix, both via the real pipeline; cleared 2 stale ledger items)

> Specs 001–022 and rounds 1–11.5 are archived in [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).
> Rounds 12–12.8 (glass-parity cleanup, visual polish, hover/motion, sticky-column fixes —
> `c043929`, `d4ad589`, `1188418`, `d5ba193` — all pushed) are also archived there.

### Accomplished (round 13, this section)
- **Sticky-Status ghosting, real fix**: round 12.8's `@media (max-width: 560px)` mobile-unpin only
  masked the bug below that breakpoint; user proved via screenshot it still ghosts at full desktop
  width and asked for the actual multi-agent pipeline instead of another direct patch. Ran it for
  real: **Pine** classified COMPLEX (2 failed patches = Rule 9 circuit breaker) → **Cedar**
  diagnosed the true root cause (a sticky element's translucent `background` is a single paint
  layer; a two-layer composite — translucent tint over opaque `var(--surface-1)`, same
  declaration, same already-locked selector — fixes it at every width unconditionally, no DOM
  change needed) and persisted `specs/023-fix-leverage-table-sticky-status-opacity.md`; user
  approved via `AskUserQuestion` (HITL) → **Cypress** amended 2 assertions in
  `SkillLeverageTable.test.tsx` first, confirmed they failed red against the old CSS → **Redwood**
  implemented the fix and deleted the now-redundant 560px stopgap. 608/608 passing. Independently
  re-verified (not just trusting reports): reran the suite myself, diffed the CSS, and
  screenshotted 1280px desktop mid-scroll before/after via `git stash`. **Committed + pushed**:
  `62b01a5`.
- **Metric-column crowding, separate bug spotted during the above verification**: Salary
  Premium/Days-to-fill/%-of-Role columns ran text together when scrolled — `table-layout: fixed`
  only had explicit widths on the sticky lead columns, so the undeclared metric columns split
  leftover space evenly regardless of content length, and Salary Premium's prose-length phrase
  (`formatSalaryPremiumPhrase()`) had nowhere to go under `nowrap`. Routed via **Pine** → **Magnolia**
  (UI/matrix ownership, no Cedar SPEC needed — first attempt, not a circuit-breaker case). Magnolia
  added an explicit `<colgroup>` with per-column widths and let the two prose-like cells (Salary
  Premium, "Confirmed across postings" header) wrap instead of overflowing. 608/608 passing,
  `tsc`/`eslint` clean. Independently re-verified: diffed the CSS, screenshotted 1280px scrolled to
  max — confirmed clean, non-overlapping columns. Cleaned up a stray "(spec 024)" comment reference
  Magnolia left behind (no such spec file exists — this went direct, not through Cedar). **Committed
  + pushed**: `e9bdb21`.
- **Cleared 2 stale "still open" ledger items** carried forward unverified across several rounds
  (per CLAUDE.md: treat the ledger as a hint, the repo as source of truth):
  - **README Stack/Status refresh (round 8)**: `git log -- README.md` shows it was already
    committed as `fc69f21` back in round 8 and is on `origin/main` — the ledger's repeated "not yet
    committed" note was simply wrong, never re-verified before being copied forward. Nothing to do.
  - **Favicon visual confirmation (round 10)**: only ever machine-verified via `curl`. Actually
    read `frontend/public/favicon-16x16.png`/`favicon-32x32.png` directly this round — both render
    a clean "LG" monogram on the app's blue accent, legible at both sizes. Confirmed.

### Unfinished / blocked
- None from this session — both bugs fixed, verified, committed, and pushed; both stale ledger
  items resolved.

### Next steps
1. Nothing outstanding from this session. Normal development can resume next session.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
