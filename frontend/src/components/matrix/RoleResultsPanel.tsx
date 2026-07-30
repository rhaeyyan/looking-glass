import { formatNum } from '../../lib/format'
import { normalizeSkillName } from '../../lib/normalize'
import { getSeniorityFraming, type SeniorityLevel } from '../../lib/seniorityFraming'
import type { Role } from '../../lib/roles'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import type { RolePanelTopGaps } from '../../lib/useRolePanel'
import { SkillMatrix } from './SkillMatrix'
import { SkillLeverageTable } from './SkillLeverageTable'
import { SkillGroupBreakdown } from './SkillGroupBreakdown'
import { FilterStatusBar } from './FilterStatusBar'
import { TopGapNarration } from './TopGapNarration'
import { SeniorityFraming } from './SeniorityFraming'

// Locked verbatim (spec 005, Cypress's compliance report) — the authoritative wording, not the
// SPEC's example text. Never re-derive or paraphrase. Moved from App.tsx (spec 035), unchanged.
const NO_GAPS_MESSAGE = 'No gaps — you already have every skill this role needs.'

// Display-only ranking: descending by the already-computed arbitrage_score, null-score rows last —
// the exact rule computeSkillGap/ArbitrageLadder use. Reads the score verbatim (Bounded-AI: a
// presentation sort, never a new metric). Moved from App.tsx (spec 035), unchanged.
function byArbitrageDesc(a: RoleSkillRow, b: RoleSkillRow): number {
  if (a.arbitrage_score === null && b.arbitrage_score === null) return 0
  if (a.arbitrage_score === null) return 1
  if (b.arbitrage_score === null) return -1
  return b.arbitrage_score - a.arbitrage_score
}

export interface RoleResultsPanelProps {
  role: string
  selectedSeniority: SeniorityLevel | ''
  rows: RoleSkillRow[]
  haveSkillKeys: Set<string> | undefined
  topGaps: RolePanelTopGaps | undefined
  selectedGroup: string | null
  setSelectedGroup: (group: string | null) => void
  // spec 036: required (not optional) — the single-panel call site in App.tsx passes `false`
  // explicitly, so there is never an ambiguous "was this just forgotten" state. When `true`, the
  // no-gaps status paragraph's `aria-label` is qualified with `role`, and `role` is threaded down
  // to `FilterStatusBar` as `roleName` — both gated so the already-audited compareMode === false
  // path stays byte-identical to specs 035/037's shipped shape.
  compareMode: boolean
}

/**
 * Pure presentational wrapper (spec 035) around one `useRolePanel` instance's return shape: the
 * results-column's two sibling cards, `standing-root` (role heading, tags, `SeniorityFraming`, and
 * — once analyzed — the donut + narration) and `evidence-root` (`SkillGroupBreakdown`,
 * `FilterStatusBar`, `SkillMatrix`, `SkillLeverageTable`), extracted verbatim from `App.tsx`
 * (post-spec-033/037 shape). No new state, no new derived math beyond what `App.tsx` already
 * computed. Renders both cards as top-level fragment siblings so `.lg-results`'s existing
 * "each card is one direct child" structure (spec 033) is unaffected by this extraction.
 */
export function RoleResultsPanel({
  role,
  selectedSeniority,
  rows,
  haveSkillKeys,
  topGaps,
  selectedGroup,
  setSelectedGroup,
  compareMode,
}: RoleResultsPanelProps) {
  const analyzed = haveSkillKeys !== undefined

  // Derived, not stored (spec 029): recomputes automatically on role/seniority change. Independent
  // of `analyzed` — visible as soon as Step 1 is complete, before or after Step 2.
  const seniorityNote = selectedSeniority ? getSeniorityFraming(role as Role, selectedSeniority) : null

  // Ranked-for-display (top move chip). Never mutates `rows`.
  const ranked = [...rows].sort(byArbitrageDesc)
  const topMove = ranked[0]
  const scoredCount = rows.filter((r) => r.demand_score !== null && r.scarcity_index !== null).length

  // Donut partition — only meaningful once a resume has been analyzed.
  let haveCount = 0
  let gapCount = 0
  let unscoredCount = 0
  if (haveSkillKeys) {
    for (const row of rows) {
      const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
      if (haveSkillKeys.has(key)) haveCount++
      else if (row.arbitrage_score === null) unscoredCount++
      else gapCount++
    }
  }

  // A plain array `.filter()` over the already-fetched rows — SkillMatrix/SkillLeverageTable never
  // learn about `selectedGroup` themselves.
  const filteredRows = selectedGroup
    ? rows.filter((r) => (r.skill_group ?? 'Uncategorized') === selectedGroup)
    : rows

  const havePct = rows.length ? Math.round((haveCount / rows.length) * 100) : 0
  const goodDeg = rows.length ? (haveCount / rows.length) * 360 : 0
  const gapDeg = rows.length ? (gapCount / rows.length) * 360 : 0
  const donutGradient = `conic-gradient(var(--have) 0deg ${goodDeg}deg, var(--learn) ${goodDeg}deg ${
    goodDeg + gapDeg
  }deg, var(--color-neutral-400) ${goodDeg + gapDeg}deg 360deg)`

  const showNoGaps = analyzed && topGaps === null

  return (
    <>
      <section className="card blueprint elev-md standing-root">
        <header className="lg-results-head">
          <span className="card-kicker">Target role</span>
          <h2 className="lg-role-heading">{role}</h2>
          <div className="lg-summary-tags">
            <span className="tag tag-neutral">
              {scoredCount} of {rows.length} scored
            </span>
            {topMove && (
              <span className="tag tag-outline">
                Start here: {topMove.skill_name_raw}
                {topMove.arbitrage_score !== null &&
                  ` · leverage ${formatNum(topMove.arbitrage_score)}`}
              </span>
            )}
          </div>
          <SeniorityFraming note={seniorityNote} />
        </header>

        {analyzed && (
          <div className="lg-scorecard lg-fade">
            <div className="lg-donut-wrap">
              <div className="lg-donut" style={{ background: donutGradient }} aria-hidden="true">
                <div className="lg-donut-hole">
                  <div className="lg-donut-pct">{havePct}%</div>
                  <div className="lg-donut-label">ready</div>
                </div>
              </div>
              <div className="lg-donut-legend">
                <div>
                  <span className="lg-swatch" style={{ background: 'var(--have)' }} />
                  Already have {haveCount}
                </div>
                <div>
                  <span className="lg-swatch" style={{ background: 'var(--learn)' }} />
                  Worth learning {gapCount}
                </div>
                <div>
                  <span className="lg-swatch" style={{ background: 'var(--color-neutral-400)' }} />
                  Not scored yet {unscoredCount}
                </div>
              </div>
            </div>
            <div className="lg-scorecard-narration">
              {topGaps && <TopGapNarration moves={topGaps.moves} />}
              {showNoGaps && (
                <p
                  role="status"
                  aria-label={compareMode ? `Skill gap result — ${role}` : 'Skill gap result'}
                  style={{ fontSize: '14px', opacity: 0.8, margin: 0 }}
                >
                  {NO_GAPS_MESSAGE}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="card blueprint elev-md evidence-root">
        <SkillGroupBreakdown
          rows={rows}
          haveSkillKeys={haveSkillKeys}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
        />
        <FilterStatusBar
          selectedGroup={selectedGroup}
          filteredCount={filteredRows.length}
          totalCount={rows.length}
          onClear={() => setSelectedGroup(null)}
          roleName={compareMode ? role : undefined}
        />
        <SkillMatrix rows={filteredRows} haveSkillKeys={haveSkillKeys} />
        <SkillLeverageTable rows={filteredRows} haveSkillKeys={haveSkillKeys} roleName={role} />
      </div>
    </>
  )
}
