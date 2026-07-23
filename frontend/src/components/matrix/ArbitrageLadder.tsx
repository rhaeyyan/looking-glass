import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { formatNum } from '../../lib/format'
import './matrix.css'

// Arbitrage ladder: the ranked gap list — every role skill as a bar, ordered by the
// already-computed `arbitrage_score` (demand × scarcity, highest leverage first).
//
// Bounded-AI: the score is read verbatim; sorting for display is a presentation transform, not a
// new metric. The demand-only row (null score) is NEVER dropped — it sorts LAST and is flagged, so
// "we know it's in demand but scarcity is unknown" stays visible instead of vanishing.
//
// Bar width is a share of the top score (a display transform), so the ranking is legible at a
// glance while identity comes from the skill name + rank label, never color alone.

const DEMAND_ONLY_FLAG = 'Demand only, scarcity unknown'

function byArbitrageDesc(a: RoleSkillRow, b: RoleSkillRow): number {
  // Null scores sort last; otherwise descending by score.
  if (a.arbitrage_score === null && b.arbitrage_score === null) return 0
  if (a.arbitrage_score === null) return 1
  if (b.arbitrage_score === null) return -1
  return b.arbitrage_score - a.arbitrage_score
}

export function ArbitrageLadder({ rows }: { rows: RoleSkillRow[] }) {
  const titleId = useId()
  const ranked = [...rows].sort(byArbitrageDesc)
  const topScore = ranked.reduce((max, r) => Math.max(max, r.arbitrage_score ?? 0), 0)

  return (
    <section className="ladder-root" aria-labelledby={titleId}>
      <h2 id={titleId} className="ladder-title">
        Arbitrage ladder
      </h2>
      <p className="ladder-hint">
        Skills ranked by arbitrage score (highest leverage first). Bar length shows each score
        relative to the top move; the demand-only skill is listed last and flagged.
      </p>

      <ol className="ladder-list">
        {ranked.map((row, i) => {
          const demandOnly = row.arbitrage_score === null
          const widthPct = topScore > 0 && row.arbitrage_score !== null
            ? (row.arbitrage_score / topScore) * 100
            : 0
          const label = demandOnly
            ? `Rank ${i + 1}: ${row.skill_name_raw}, ${DEMAND_ONLY_FLAG}`
            : `Rank ${i + 1}: ${row.skill_name_raw}, arbitrage score ${formatNum(row.arbitrage_score)}`
          return (
            <li key={row.skill_key ?? row.skill_name_raw}>
              <button type="button" data-testid="ladder-item" className="ladder-item" aria-label={label}>
                <span className="ladder-rank" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="ladder-name">{row.skill_name_raw}</span>
                {demandOnly ? (
                  <span className="ladder-flag">{DEMAND_ONLY_FLAG}</span>
                ) : (
                  <span className="ladder-track" aria-hidden="true">
                    <span className="ladder-bar" style={{ width: `${widthPct}%` }} />
                  </span>
                )}
                {!demandOnly && (
                  <span className="ladder-score" aria-hidden="true">
                    {formatNum(row.arbitrage_score)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
