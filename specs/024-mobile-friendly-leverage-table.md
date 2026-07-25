[SPEC]
- **Objective**: On viewports ≤480px, shrink the leverage table's sticky-column footprint from
  20.75rem (~332px) to 8.25rem (~132px) so metric columns (Leverage, Demand, etc.) are visible
  without excessive horizontal scrolling, while keeping every number in the table — including
  Status — genuinely accessible (no data hidden with no fallback). No change to desktop/tablet
  behavior (>480px) and no change to the spec-023 sticky-translucency fix or the e9bdb21 metric
  <colgroup> widths.
- **Inputs/Outputs**:
  - Input: existing `SkillLeverageTable.tsx` render tree (rows, `haveSkillKeys`, `roleName`) —
    unchanged data contract.
  - Output: same DOM structure/columns, but at ≤480px: (1) `.lev-status`/`.lev-status-h` are no
    longer `position: sticky` — they scroll normally with the metric columns; (2)
    `.lev-skill`/`.lev-skill-h` width drops from `9rem` to `6rem`; (3) `.lev-num` stays `2.25rem`
    and stays sticky at `left: 0`; `.lev-skill`/`.lev-skill-h` stay sticky at `left: 2.25rem`
    (unchanged offset — only num's width feeds that calc, and num doesn't change); (4) the visible
    text label inside each Status cell (`"Already have"` / `"Worth learning"`) becomes
    visually-hidden (clip-rect technique, same as the existing `.visually-hidden` utility at
    matrix.css:336) — present in the DOM/accessibility tree, not `display:none`, not removed —
    leaving only the `✓`/`✕` glyph + color + `data-have` state visible, which is acceptable per
    the existing non-color-encoding pattern (the glyph itself is a second channel, matching the
    scatter's own `.matrix-point-flag` glyph+color pattern already in this file).
- **Design Pattern**: none — simple case (a breakpoint-scoped style override on an existing
  component; no new abstraction, control flow, or object earns a GoF pattern here).
- **Bounded-AI boundary**: N/A — this is a pure presentation/CSS task. No score, gap, or join is
  computed or altered; `arbitrage_score` and every other number continue to render verbatim from
  already-computed row data exactly as today.
- **UI Scope**: cosmetic — the table's DOM structure, column set, column order, and data contract
  do not change. This is a responsive style override (sticky positioning, one column width, one
  text-visibility toggle) on the existing layout, not a new layout.
- **Intellectual Control**: Reuses the exact mechanism already proven safe in this file twice this
  sprint — a `@media` breakpoint override on the same class selectors spec 023 and e9bdb21 already
  established (`.lev-status`, `.lev-status-h`, `.lev-skill`, `.lev-skill-h`), plus the existing
  `.visually-hidden` clip-rect utility (matrix.css:336) already used elsewhere in this same file for
  exactly this "keep it in the a11y tree, take it out of the visual layout" need. Nothing new is
  invented: no new sticky mechanism, no new hide-content mechanism, no new breakpoint convention
  (480px sits between the existing 560px scatter breakpoint and typical phone widths; it is chosen
  because it's below 560 but must still act at ~430px real-device widths — do not merge it into the
  existing 560px block, since the scatter's 560px rules are about plot sizing, an unrelated
  concern, and conflating them would make future mainteners unsure which rules serve which purpose).
  This will not break at scale because unpinning Status doesn't remove information — it just moves
  it from the pinned zone to the scrollable zone, and Status's text remaining accessibility-tree
  content means axe-core and screen readers keep working identically to today.
- **Constraints**:
  - Do not touch, revert, or restructure the spec-023 two-layer background composite
    (`.lev-status[data-have='true']`/`[data-have='false']` linear-gradient-over-`var(--surface-1)`
    rules) — those stay exactly as-is; they're harmless (and unnecessary but not wrong) on a
    non-sticky element too, so no need to conditionally strip them at the breakpoint.
  - Do not touch, resize, or restructure the e9bdb21 `<colgroup>` widths (`.lev-col-leverage`,
    `.lev-col-demand`, `.lev-col-scarcity`, `.lev-col-salary`, `.lev-col-days`,
    `.lev-col-pctrole`, `.lev-col-confirmed`) at any breakpoint.
  - Do not change `.lev-num`'s width (2.25rem) or its sticky `left: 0` at any breakpoint — it's the
    lightest column and is not the source of the crowding problem.
  - Do not use `display: none` or `visibility: hidden` for the Status text label (removes it from
    the accessibility tree) — use the clip-rect `.visually-hidden`-equivalent technique only.
  - Do not use a single shared 560px breakpoint for this — use a distinct `@media (max-width:
    480px)` block, kept visually adjacent to but not merged with the existing 560px scatter block,
    with a comment explaining why 480 (real-device phone crowding) is a different concern from 560
    (scatter plot sizing).
  - No new NPM dependency.
- **Edge Cases**:
  - `haveSkillKeys` undefined (Status column absent entirely, per existing `{haveSkillKeys && ...}`
    conditional): the new breakpoint rules on `.lev-status`/`.lev-status-h` simply have no matching
    elements to apply to — no guard needed, this already degrades safely today.
  - Very long skill names at the new 6rem width: `.lev-skill` already has `overflow-wrap: anywhere`
    and `white-space: normal` (unchanged) — long names wrap to more lines at 6rem than at 9rem; this
    is acceptable (same mechanism, just more wrapping) and does not truncate or hide any character.
  - Demand-only skills' `.lev-demandonly` flag text inside `.lev-skill`: unaffected, continues to
    render below the skill name inside the now-narrower cell.
  - Users with `prefers-reduced-motion` or forced-colors: no motion or color-only channel is
    introduced by this change; the `✓`/`✕` glyph channel already satisfies non-color-encoding, and
    that data-have state is completely unaffected by this SPEC — this task does not change the
    icon, its color, or its meaning, only its label's visibility and its sticky/pinned status.
  - Table still scrolls horizontally at ≤480px (this SPEC does not eliminate horizontal scroll,
    only shrinks the pinned zone that was blocking useful content) — that residual scroll is
    expected and acceptable; `overflow-x: auto` on `.leverage-tablewrap` is unchanged.
- **Files**:
  1. `frontend/src/components/matrix/matrix.css` — add the `@media (max-width: 480px)` block with
     the sticky-unpin, width, and label-visibility rules described above.
  2. `frontend/src/components/matrix/SkillLeverageTable.tsx` — add a `className="lev-status-label"`
     to the existing `<span>{have ? 'Already have' : 'Worth learning'}</span>` (line ~122) so the
     CSS in file 1 has a stable selector to target; no other JSX change.
  3. `frontend/src/components/matrix/SkillLeverageTable.test.tsx` (if it exists; Cypress confirms
     path) — new/amended assertions per the Cypress task below.
- **Tipping Point**: If a future round needs to unpin or reflow more than Status (e.g. also
  dropping Skill from the sticky set, or introducing per-breakpoint column reordering), that's a
  strong signal this table has outgrown "shrink the pinned zone" and needs the card/stacked-layout
  restructure explicitly rejected in this SPEC — re-open with Cedar at that point rather than
  stacking a third breakpoint-scoped patch onto this one.

[FORCES]
1. Fit real metric data on a real phone viewport > preserving all 3 sticky columns at full width
2. Simplicity > Pattern purity

## Rejected alternative (explicitly, with rationale)

A card/stacked-layout restructure for mobile (each skill rendered as a vertical card instead of a
table row) was considered and rejected: it would touch far more files, change the DOM structure of
the WCAG-mandated accessible table alternative, and risks breaking the accessibility guarantee this
table exists to provide — when a narrower sticky footprint fully solves the stated problem (seeing
metric data on a real phone) with a two-file, breakpoint-scoped CSS + one-attribute change.

## Ordered tasks

1. **Cypress** (tests first) — Given the SPEC above, write/amend failing tests in
   `SkillLeverageTable.test.tsx` asserting: (a) at a simulated ≤480px viewport, `.lev-status`/
   `.lev-status-h` computed `position` is not `sticky`; (b) `.lev-skill` computed width resolves to
   `6rem`'s pixel equivalent at that viewport; (c) the Status label text (`"Already have"`/
   `"Worth learning"`) remains present and query-able in the DOM/accessibility tree (e.g. via
   `getByText` or `toBeInTheDocument`, not filtered out) even when visually clipped; (d) axe-core
   reports no new violations at the ≤480px viewport. Files:
   `frontend/src/components/matrix/SkillLeverageTable.test.tsx` (≤1 file).

2. **Magnolia** (UI/matrix ownership) — Implement exactly the CSS and one-attribute TSX change
   specified above against Cypress's now-red tests, touching only
   `frontend/src/components/matrix/matrix.css` and
   `frontend/src/components/matrix/SkillLeverageTable.tsx`. Do not touch spec-023 or e9bdb21 rules
   per Constraints. Run `tsc`/`eslint`/full test suite; produce `[COMPLETION-REPORT]`.

3. **Cypress** (audit) — Verify `[COMPLETION-REPORT]` against the SPEC's Edge Cases and
   Constraints (especially: text still in a11y tree, no `display:none`, spec-023/e9bdb21 rules
   untouched, 560px block left separate from the new 480px block); produce `[COMPLIANCE-REPORT]`.

Files referenced: `frontend/src/components/matrix/SkillLeverageTable.tsx`,
`frontend/src/components/matrix/matrix.css`,
`frontend/src/components/matrix/SkillLeverageTable.test.tsx`.
