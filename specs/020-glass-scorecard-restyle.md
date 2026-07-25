[SPEC]
- **Objective**: Restyle the scorecard section (donut + `TopGapNarration`) to the new glass
  design-language: glass panel (`--glass-2`), donut ring restyled with `--have`/`--learn`/neutral
  segments (same math), a row of stat chips using `--chip-bg`/`--chip-fg`, and the existing
  `TopGapNarration` ranked list restyled into a "next moves" mini-grid layout.
- **Inputs/Outputs**: CSS-only changes to `.lg-scorecard`/`.lg-donut*`/`.lg-swatch` (in
  `looking-glass.css`) and to `.topmoves-list`/`.topmove*` (in `matrix.css`), plus swapping
  `App.tsx`'s inline donut-gradient/swatch style literals (`var(--have-tone)`, `var(--learn-tone)`,
  `var(--color-neutral-400)`) to the new `--have`/`--learn` tokens directly (no longer via the
  spec-018 alias, since this task is a natural migration point). No change to `donutGradient`'s
  math, `havePct`/`haveCount`/`gapCount`/`unscoredCount` computation, or `narrateTopGaps`'s output
  shape.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — presentation only. Confirmed by inspection: `TopGapNarration.tsx`
  and `App.tsx`'s donut math are unchanged by this task; the "next moves" grid is a **restyle of
  the existing ranked list** (`narrateTopGaps`'s `TOP_MOVES_LIMIT`-bounded `moves` array, already
  rendered by `TopGapNarration.tsx` with rank badge + name + note + stat chips) — **not new UI**,
  confirmed against current code before writing this SPEC. `lib/narrate.ts` is not touched.
- **UI Scope**: cosmetic — `.topmoves-list`/`.topmove` become a CSS grid instead of a flex column
  and gain card-style chrome (background/border/radius per item); the DOM structure
  (`<ol>`/`<li>`/rank span/name span/note/stat chips) is unchanged.
- **Intellectual Control**: Because the "next moves" content was verified pre-existing (not
  invented for this redesign), this task is scoped purely to `.topmove*`/`.lg-scorecard*` CSS plus
  the small, mechanical inline-style token swap in `App.tsx` — no risk of silently duplicating or
  diverging from `narrateTopGaps`'s output contract, since no new consumer of that data is added.
- **Constraints**: Scorecard card radius: `--radius-card: 15px` (new token, scoped to
  `.lg-scorecard`/matrix/table cards per the design — introduced here, reused verbatim by specs
  021/022 rather than redefined). Donut hole background (`.lg-donut-hole`) must use the theme's
  `--page`/`--glass-2` combination correctly so it doesn't look like a flat cutout against the new
  glass card. Stat chips (`.topmove-stat`) restyle to `--chip-bg`/`--chip-fg` in both themes — must
  clear AA text contrast (`--chip-fg` on `--chip-bg`, both themes, via `contrastRatio`).
- **Edge Cases**: The donut's non-color-only guarantee (percentage text + legend text carry the
  meaning, ring is reinforcement — see existing `.lg-donut-pct`/`.lg-donut-legend` comment) must
  survive the restyle unchanged — do not let the new gradient/glass treatment become the only
  differentiator. `showNoGaps`'s "No gaps" message (locked verbatim per spec 005) renders inside
  the same glass card — verify it still clears AA against the new `--glass-2` background. Mobile
  breakpoint (`@media max-width: 520px`, scorecard collapses to one column) must still work with
  the new grid-based next-moves layout — the mini-grid should collapse to fewer/1 column(s), not
  overflow.
- **Files** (4):
    - `frontend/src/App.tsx`
    - `frontend/src/styles/looking-glass.css`
    - `frontend/src/components/matrix/matrix.css`
    - `frontend/src/components/matrix/TopGapNarration.test.tsx` (extend — assert grid restyle
      doesn't change rendered move count/order/content, only presentation)
- **Tipping Point**: If `TOP_MOVES_LIMIT` ever grows large enough that the mini-grid needs
  pagination/scrolling to stay usable, that's a new SPEC (virtualized or paginated list) — this
  task assumes the current small, fixed limit.

[FORCES]
1. Verified-existing content reused as-is > re-deriving "next moves" as new UI
2. Simplicity > Pattern purity
