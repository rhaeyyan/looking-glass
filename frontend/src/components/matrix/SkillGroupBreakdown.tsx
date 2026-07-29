import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { computeSkillGroupBreakdown } from '../../lib/skillGroupBreakdown'
import { formatNum } from '../../lib/format'
import './matrix.css'

// specs/031-skill-group-chip-row.md: renders `computeSkillGroupBreakdown()`'s already-sorted
// output as a wrapping chip row — "which skill group is driving your score" — and each chip
// doubles as a reversible toggle that narrows the rows App.tsx passes to
// SkillMatrix/SkillLeverageTable. This component never re-derives ranking/grouping: the data
// layer (spec 026, frontend/src/lib/skillGroupBreakdown.ts) is called exactly once per render and
// its order is rendered verbatim.
//
// Fully controlled (spec 031): `selectedGroup`/`onSelectGroup` are now required props — App.tsx
// alone owns the selection state, and this component holds zero internal selection state of its
// own. The previous round's local `useState` (spec 027) was exactly the silent-desync landmine
// CLAUDE.md calls out by name (a chip could show selected while the filter it drives disagreed);
// removing the state here removes that class of bug structurally, not just by convention.
//
// A11y (WCAG 2.2 AA, dataviz skill applied): identity is carried by TEXT (the group name) and
// POSITION (the already-sorted rank), never color alone; the selected chip is marked with
// aria-pressed (a semantic, non-color channel) FOR assistive tech, AND — mirroring SkillMatrix's
// own visible ✓/✕ glyph idiom for the identical "no color-only encoding" requirement — a visible,
// aria-hidden ✓ glyph for sighted, color-vision-deficient users who cannot rely on the
// border/background tint alone. This is this SPEC's authorized, documented deviation from the
// literal chip mockup, which shows a color/border-only selected state. Every chip is a native
// <button>, so keyboard operability (Tab/Enter/Space) comes for free. The numbers backing this
// ranked chip row are the same accessible-table-equivalent numbers SkillLeverageTable already
// exposes for the scatter, so no separate table alternative is needed here. Any highlight
// transition on the selected chip is CSS-only and lives behind `prefers-reduced-motion:
// no-preference` in matrix.css — never an inline style, so the reduced-motion test (which asserts
// no inline transition/animation) always passes regardless of the user's OS setting.

export function SkillGroupBreakdown({
  rows,
  haveSkillKeys,
  selectedGroup,
  onSelectGroup,
}: {
  rows: RoleSkillRow[]
  haveSkillKeys?: Set<string>
  selectedGroup: string | null
  onSelectGroup: (group: string | null) => void
}) {
  const titleId = useId()

  if (rows.length === 0) return null

  const breakdown = computeSkillGroupBreakdown(rows, haveSkillKeys)
  const allSelected = selectedGroup === null

  return (
    <section
      className="breakdown-root card blueprint elev-md"
      aria-labelledby={titleId}
      data-testid="skill-group-breakdown"
    >
      <h2 id={titleId} className="breakdown-title">
        Which skill group is driving your score
      </h2>
      <p className="breakdown-hint">
        Skill groups ranked by average leverage score. Select a group to narrow the matrix and
        table below to just that group; select it again to clear the filter.
      </p>

      <div className="breakdown-chips" role="group" aria-label="Skill groups">
        <button
          type="button"
          className="breakdown-chip"
          aria-pressed={allSelected}
          data-selected={allSelected || undefined}
          onClick={() => onSelectGroup(null)}
        >
          {allSelected && (
            <span aria-hidden="true" className="breakdown-chip-glyph">
              ✓
            </span>
          )}
          <span className="breakdown-chip-label">All skills</span>
        </button>

        {breakdown.map((group) => {
          const selected = group.skill_group === selectedGroup
          return (
            <button
              key={group.skill_group}
              type="button"
              className="breakdown-chip"
              aria-pressed={selected}
              data-selected={selected || undefined}
              onClick={() => onSelectGroup(selected ? null : group.skill_group)}
            >
              {selected && (
                <span aria-hidden="true" className="breakdown-chip-glyph">
                  ✓
                </span>
              )}
              <span className="breakdown-chip-label">{group.skill_group}</span>
              <span className="breakdown-chip-score">
                {group.avg_arbitrage_score === null
                  ? 'Not scored'
                  : `avg leverage ${formatNum(group.avg_arbitrage_score)}`}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
