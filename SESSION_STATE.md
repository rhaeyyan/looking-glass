# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-25 (round 12.8: leverage-table sticky-column overlap, scroll case)

> Specs 001–022 and rounds 1–11.5 are archived in [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).
> Rounds 12–12.7 (glass-parity cleanup, visual polish, hover/motion, and the sticky-column
> overlap-at-rest fix — committed as `c043929`, `d4ad589`, `1188418`, `d5ba193`, all pushed to
> `origin/main`) are also archived there as of this session's ledger trim.

### Accomplished (round 12.8, this section)
- User reported the round-12.7 fix was incomplete: on mobile, scrolling the leverage table
  horizontally still showed the Status column overlapping the Leverage/Demand columns.
- Reproduced with a scripted Playwright horizontal scroll + `getComputedStyle` inspection (ruled
  out a screenshot-timing artifact via double-rAF before capture — the ghosting was real).
  `.lev-status`'s resolved background was `rgba(138, 59, 18, 0.14)`: the pill's tint tokens
  (`--status-good-surface`/`--status-critical-surface`, aliased from spec-018's `--have-soft`/
  `--learn-soft`) are intentionally translucent, but declared directly as the *sticky* column's own
  `background` — so non-sticky columns scrolling underneath it show through.
- First attempt (move the tint to an inner `.lev-status-pill` span via the compound selector
  `.lev-status[data-have='true'] .lev-status-pill`) satisfied `SkillLeverageTable.test.tsx`'s
  tolerant selector matcher, but broke a stricter spec-008 test hard-regexing the exact literal
  rule `.lev-status[data-have='true'] {`, duplicated across 6 test files (`colorTokens.test.ts`,
  `glass-v2-tokens.test.ts`, `glassmorphism.test.ts`, `nav-sidebar-glass-restyle.test.ts`,
  `scorecard-glass-restyle.test.ts`, `SkillMatrix.test.tsx`). Reverted — there's no way to relocate
  that background off the exact locked selector without a test-contract change.
- **Landed fix**: inside the existing `@media (max-width: 560px)` block, unpin
  `.lev-num`/`.lev-skill`/`.lev-skill-h`/`.lev-status`/`.lev-status-h` to
  `position: static; left: auto` — sidesteps the translucency-vs-sticky-scroll conflict below the
  mobile breakpoint (trade-off: no pinned columns on mobile while scrolling; judged acceptable
  since mobile is already a narrow, one-section-at-a-time scanning context). A real fix at wider
  viewports would need a Cypress/SDET call to amend the locked contract — not made unilaterally.
- Verified: `npx vitest run` — 608/608 passing. Re-screenshotted the 390px mobile view both at rest
  and horizontally-scrolled (Playwright, driven directly — no `chromium-cli` binary in this
  environment; used the `run` skill's generic dev-server + Playwright fallback pattern) — no
  bleed-through in either state.
- **Not committed** — asking the user before committing, per this session's established pattern.

### Unfinished / blocked
- **Round 12.8 (this section) is implemented and verified but not committed.** File:
  `frontend/src/components/matrix/matrix.css` only.
- Favicon visual confirmation (round 10) and the README Stack/Status refresh commit (round 8) are
  still open from prior rounds — see [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for detail.

### Next steps
1. Get the user's go-ahead, then commit (and likely push, per this session's pattern) round 12.8's
   `matrix.css` mobile-unpin fix.
2. Confirm with the user that the new favicon design actually looks right once they've seen it
   live (Vercel auto-deploys `origin/main`).
3. Commit the `README.md` Stack/Status refresh from round 8 (still not yet committed).

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
