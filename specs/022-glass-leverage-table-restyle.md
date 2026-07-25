[SPEC]
- **Objective**: Restyle `SkillLeverageTable`'s Status column into pill-shaped badges
  (`--chip-bg`/`--chip-fg` treatment, reusing `--have`/`--learn`) and polish the already-existing
  progress-bar leverage column (`.lev-bar-track`/`.lev-bar`) to the new token system, plus the
  table card's 15px radius.
- **Inputs/Outputs**: CSS-only changes to `.lev-status`, `.lev-bar-track`, `.lev-bar`,
  `.lev-bar-val` in `matrix.css`. No change to `SkillLeverageTable.tsx`'s markup, sort order, or
  `widthPct`/`formatNum` computations.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — presentation only. Confirmed by inspection: the progress-bar
  leverage column (`widthPct = arbitrage_score / topScore`, a documented presentation transform)
  is **already implemented** in `SkillLeverageTable.tsx` — this task restyles its CSS only, it does
  not add the bar. No file under `lib/` is touched; the sort (`byArbitrageDesc`) and `widthPct`
  formula are unchanged.
- **UI Scope**: cosmetic — same table markup/columns/sort, only `.lev-status`'s box shape
  (pill: padding + full border-radius + background chip) and `.lev-bar*`'s token values change.
- **Intellectual Control**: Scoped narrowly to two already-correct visual elements (status text,
  progress bar) getting new token values — no new column, no new interactive control, so the risk
  surface is just "did contrast survive the new chip background," which is explicitly tested below.
- **Constraints**: Reuse spec 020's `--radius-card: 15px` on the table's `.card.blueprint`
  wrapper (`leverage-root`). Pill status badges must use `--have`/`--have-soft` and
  `--learn`/`--learn-soft` (not raw `--status-good`/`--status-critical` hex) so they inherit spec
  018's already-verified dark-mode contrast math — do not introduce new unchecked color literals.
  The sticky-column backgrounds (`.lev-num`, `.lev-skill`, `.lev-status` — `position: sticky`,
  `background: var(--surface-1)`) must still visually match the (now possibly glass-backed) table
  card so the sticky seam doesn't look like a rendering glitch when scrolling horizontally.
- **Edge Cases**: Pill badges must still carry the have/gap meaning through TEXT ("Already have"/
  "Worth learning"), never color alone — this is already true today (existing text content) and
  must not regress. Progress bar's `width: 0%` case (a `demandOnly` row, which renders `—` instead
  of a bar per existing code) is unaffected by this restyle — verify the em-dash fallback still
  renders correctly with the new token set. AA contrast: `--chip-fg` on `--chip-bg` (already
  verified by spec 020 for the scorecard's stat chips) reused here — confirm it also holds against
  the table's own `--surface-1`-based sticky-column backgrounds if the chip sits inside a sticky
  cell.
- **Files** (2):
    - `frontend/src/components/matrix/matrix.css`
    - `frontend/src/components/matrix/SkillLeverageTable.test.tsx` (extend — assert Status cell
      still renders "Already have"/"Worth learning" text per row, assert bar width formula
      unchanged, assert demand-only em-dash fallback unchanged)
- **Tipping Point**: If the table ever needs a THIRD status state (e.g. "partially have" or
  "verified externally"), the two-tone pill CSS (built for exactly have/learn) needs a third
  variant and a SPEC update — do not overload `--have`/`--learn` to represent a third meaning.

[FORCES]
1. Verified-existing bar/status logic preserved untouched > convenience of re-deriving them
2. Simplicity > Pattern purity
