import './matrix.css'

// specs/030-filter-status-bar.md: a small, fully controlled status line announcing whether the
// matrix/table below are showing all skills or a skill-group-filtered subset. Every prop
// (`selectedGroup`, `filteredCount`, `totalCount`) is passed in verbatim by the caller
// (Array.length, existing state) — this component performs no computation, join, or ranking of
// its own, and makes no LLM call. Bounded-AI boundary, enforced structurally: no scoring-shaped
// prop exists here for a scoring bug to leak through — the only "logic" is the two-branch string
// template the SPEC's Tipping Point already anticipates growing into a lookup.
//
// A11y (WCAG 2.2 AA): the root carries role="status" + aria-live="polite" so the count change is
// announced to screen-reader users without stealing focus (README "Interactions & behavior").
// The ✓/✕ glyphs are wrapped in their own aria-hidden spans — mirroring the existing
// `.matrix-legend-chip`, `.lev-status-icon`, and `.breakdown-entry-selected-badge` idiom already
// in matrix.css — so the surrounding sentence text (never the bare glyph) carries the announced/
// accessible meaning. The sentence itself is never split across nested elements (no inline
// <strong>/<span> inside it), so both a screen reader's continuous read and
// testing-library's/DOM text-node matching see one unbroken string.
export function FilterStatusBar({
  selectedGroup,
  filteredCount,
  totalCount,
  onClear,
  roleName,
}: {
  selectedGroup: string | null
  filteredCount: number
  totalCount: number
  onClear: () => void
  // spec 036: optional, mirrors SkillLeverageTable's existing `roleName` prop naming. Provided
  // (non-empty) only by RoleResultsPanel when compareMode is true — every other/earlier call site
  // omits it, so the base "Skill filter status" label is unchanged there.
  roleName?: string
}) {
  const isFiltered = selectedGroup !== null

  return (
    <div
      className="filter-status-root filter-status-bar"
      role="status"
      aria-live="polite"
      aria-label={roleName ? `Skill filter status — ${roleName}` : 'Skill filter status'}
      data-filtered={isFiltered || undefined}
    >
      {isFiltered ? (
        <>
          <span className="filter-status-icon" aria-hidden="true">
            ✓
          </span>
          <span className="filter-status-text">
            {selectedGroup} — the matrix and table below show {filteredCount} of {totalCount}{' '}
            skills
          </span>
          <button type="button" className="filter-status-clear" onClick={onClear}>
            <span aria-hidden="true">✕</span> Clear filter
          </button>
        </>
      ) : (
        <span className="filter-status-text">
          Showing all {totalCount} skills — select a group above to narrow the matrix and table
        </span>
      )}
    </div>
  )
}
