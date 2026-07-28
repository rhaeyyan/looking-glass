import { useId, useState } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { computeSkillGroupBreakdown } from '../../lib/skillGroupBreakdown'
import { formatNum } from '../../lib/format'
import './matrix.css'

// specs/027-skill-group-breakdown-ui.md: renders `computeSkillGroupBreakdown()`'s already-sorted
// output as a scrollable, filterable ranked list — "which skill group is driving your score" —
// and doubles each entry as a reversible toggle that narrows the rows App.tsx passes to
// SkillMatrix/SkillLeverageTable. This component never re-derives ranking/grouping: the data
// layer (spec 026, frontend/src/lib/skillGroupBreakdown.ts) is called exactly once per render and
// its order is rendered verbatim.
//
// A11y (WCAG 2.2 AA, dataviz skill applied): identity is carried by TEXT (the group name) and
// POSITION (the already-sorted rank), never color alone; the selected entry is marked with
// aria-pressed (a semantic, non-color channel) FOR assistive tech, AND — mirroring SkillMatrix's
// own visible ✓/✕ glyph + accessible-name-suffix idiom for the identical "no color-only encoding"
// requirement — a visible ✓ glyph plus "Selected" text badge for sighted, color-vision-deficient
// users who cannot rely on the border/background tint alone. The filter is a native
// <input type="search"> with an associated label; every group entry is a native <button>,
// so keyboard operability (Tab/Enter/Space) comes for free; the numbers backing this ranked list
// are the same accessible-table-equivalent numbers SkillLeverageTable already exposes for the
// scatter, so no separate table alternative is needed here. Any highlight transition on the
// selected entry is CSS-only and lives behind `prefers-reduced-motion: no-preference` in
// matrix.css (mirrors SkillMatrix's existing convention) — never an inline style, so the reduced-
// motion test (which asserts no inline transition/animation) always passes regardless of the
// user's OS setting.

function haveGapLabel(
  haveSkillKeys: Set<string> | undefined,
  have: number | null,
  gap: number | null,
): string {
  if (haveSkillKeys === undefined || have === null || gap === null) return 'Not analyzed yet'
  return `${have} already have · ${gap} worth learning`
}

export function SkillGroupBreakdown({
  rows,
  haveSkillKeys,
  onSelectGroup,
}: {
  rows: RoleSkillRow[]
  haveSkillKeys?: Set<string>
  onSelectGroup?: (group: string | null) => void
}) {
  const titleId = useId()
  const filterId = useId()
  const [filterText, setFilterText] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  if (rows.length === 0) return null

  const breakdown = computeSkillGroupBreakdown(rows, haveSkillKeys)
  const query = filterText.trim().toLowerCase()
  const filtered = query
    ? breakdown.filter((g) => g.skill_group.toLowerCase().includes(query))
    : breakdown

  function handleToggle(group: string) {
    const next = selectedGroup === group ? null : group
    setSelectedGroup(next)
    onSelectGroup?.(next)
  }

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

      <div className="breakdown-filter">
        <label htmlFor={filterId} className="breakdown-filter-label">
          Filter skill groups
        </label>
        <input
          id={filterId}
          type="search"
          className="input breakdown-filter-input"
          value={filterText}
          placeholder="Filter skill groups…"
          onChange={(event) => setFilterText(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="breakdown-empty" role="status">
          No skill groups match &ldquo;{filterText}&rdquo;.
        </p>
      ) : (
        <ul className="breakdown-list" data-testid="skill-group-breakdown-list">
          {filtered.map((group) => {
            const selected = selectedGroup === group.skill_group
            return (
              <li key={group.skill_group} className="breakdown-item">
                <button
                  type="button"
                  className="breakdown-entry"
                  aria-pressed={selected}
                  data-selected={selected || undefined}
                  onClick={() => handleToggle(group.skill_group)}
                >
                  <span className="breakdown-entry-name">
                    {group.skill_group}
                    {selected && (
                      <span className="breakdown-entry-selected-badge">
                        <span aria-hidden="true">✓</span> Selected
                      </span>
                    )}
                  </span>
                  <span className="breakdown-entry-meta">
                    <span className="breakdown-entry-score">
                      {group.avg_arbitrage_score === null
                        ? 'Not scored'
                        : `avg leverage ${formatNum(group.avg_arbitrage_score)}`}
                    </span>
                    <span className="breakdown-entry-havegap">
                      {haveGapLabel(haveSkillKeys, group.have_skills, group.gap_skills)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
