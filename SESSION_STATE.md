# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-25 (round 14: mobile-friendly leverage table via Pine→Cedar→Cypress→Magnolia; round 13 sticky-Status + crowding fixes, both via the real pipeline)

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

### Accomplished (round 14, this section)
- User supplied a REAL-DEVICE mobile screenshot (~430 CSS px viewport, not simulated) showing the
  three sticky/pinned columns (`.lev-num` 2.25rem + `.lev-skill` 9rem + `.lev-status` 9.5rem ≈
  20.75rem/332px) eating almost the entire phone width — only a sliver of the Leverage column
  visible, everything else requiring heavy horizontal scroll. User: "it looks very bad in mobile,
  this table needs to be mobile friendly."
- Routed via **Pine** → **Cedar** (COMPLEX — a real design tradeoff with multiple viable
  approaches, not a cosmetic tweak, on a table with a recent track record of under-solved ad hoc
  patches). Cedar read the current TSX/CSS, explicitly rejected a full card/stacked-layout mobile
  restructure (too much DOM/a11y risk for the gain), and specced a decisive, minimal fix: below
  **480px**, unpin only Status from the sticky set (keep Rank+Skill pinned — the minimum to not
  lose your place scrolling 30 rows), shrink `.lev-skill`/`.lev-skill-h` from 9rem→6rem, and
  visually-hide (clip-rect, NOT `display:none`) the Status label text so only the ✓/✕ glyph shows
  — dropping the pinned footprint to ~8.25rem (~132px). Persisted
  `specs/024-mobile-friendly-leverage-table.md`; user approved via `AskUserQuestion` (HITL).
- **Cypress** wrote the failing tests first (position/width assertions targeting a not-yet-existing
  `@media (max-width: 480px)` block, plus a DOM-presence regression guard for the label text and an
  axe-core check — honest in its report about jsdom's inability to actually simulate a browser
  reflowing at a real viewport width, so it scoped its claims accordingly) and added the one
  `className="lev-status-label"` JSX attribute spec 024 explicitly authorized as its file to touch.
  613/618 → confirmed exactly the 5 intended RED failures.
- **Magnolia** implemented Cedar's exact spec: new, separate `@media (max-width: 480px)` block
  (deliberately not merged into the existing 560px scatter-sizing block — different concern),
  reusing the existing `.visually-hidden` clip-rect declarations verbatim for `.lev-status-label`.
  618/618 passing, `tsc`/`eslint` clean.
- Independently re-verified all of it myself: reran the full suite (618/618), diffed the CSS (one
  clean, isolated block, nothing else touched), and screenshotted both a 428px viewport (matching
  the user's real device) and a 768px desktop viewport. Confirmed: at 428px the Leverage column
  and its full bar chart are now clearly visible with room to spare, Status renders icon-only, and
  `page.evaluate` confirmed the label span (`"Already have"`) is still connected to the DOM, just
  visually clipped — never removed. At 768px, confirmed byte-for-byte unaffected (Status stays
  sticky with full text, Skill stays 9rem).
- **Not committed** — asking the user before committing, per this session's established pattern.

### Unfinished / blocked
- **Round 14's fix is implemented and independently verified but not committed.** Files:
  `frontend/src/components/matrix/matrix.css`, `frontend/src/components/matrix/
  SkillLeverageTable.tsx` (one `className` addition), `frontend/src/components/matrix/
  SkillLeverageTable.test.tsx`, plus the new `specs/024-mobile-friendly-leverage-table.md`
  (untracked).
- Round 13's two fixes (sticky-Status ghosting, metric-column crowding) are already committed +
  pushed (`62b01a5`, `e9bdb21`) — no action needed there.

### Next steps
1. Get the user's go-ahead, then commit (and likely push, per this session's pattern) round 14's
   mobile-friendly leverage-table fix and the new spec file.

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
