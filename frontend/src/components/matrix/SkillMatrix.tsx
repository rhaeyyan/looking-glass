import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { SkillDataTable } from './SkillDataTable'
import './matrix.css'

// Quadrant scatter: x = demand_score, y = scarcity_index, bubble size = market share (pct_of_role).
// Grounded in the `dataviz` skill — a hand-rolled DOM/CSS plot (no charting dep) so we fully control
// the strict a11y bar this form requires:
//   • Identity is NEVER color-alone. Each point carries a distinct SHAPE (`data-shape`), an
//     accessible label (skill + raw numbers), and a unique POSITION; color is reinforcement only.
//     Per dataviz, a bubble/scatter is an "all-pairs" form where only slots 1–3 clear the CVD
//     floors, which is exactly why shape + label are the load-bearing channels here.
//   • Only rows with numeric (demand, scarcity) coordinates are plotted; the demand-only row has no
//     coordinate and is excluded from the scatter — but it still appears in the table below.
//   • Motion is opt-in via CSS (`prefers-reduced-motion: no-preference`); nothing is written to
//     inline style, and the root advertises `data-reduced-motion` when reduce is set.
//
// Bounded-AI: coordinate/size mapping is a presentation transform of already-computed fields — no
// new metric is invented in this layer.

// Non-color encoding channel: a fixed shape per point, cycled by index. clip-path renders the glyph.
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const
const SHAPE_CLIP: Record<(typeof SHAPES)[number], string> = {
  circle: 'circle(50%)',
  square: 'inset(0)',
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
}
// Reinforcement colors — the first slots that clear the dataviz all-pairs CVD gate.
const SERIES_VARS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isScored(
  row: RoleSkillRow,
): row is RoleSkillRow & { demand_score: number; scarcity_index: number } {
  return row.demand_score !== null && row.scarcity_index !== null
}

export function SkillMatrix({ rows }: { rows: RoleSkillRow[] }) {
  const titleId = useId()
  const reduced = prefersReducedMotion()
  const scored = rows.filter(isScored)
  const caption = `Skill profile for ${rows[0]?.role_family ?? 'selected role'}`

  return (
    <section
      className="matrix-root"
      aria-labelledby={titleId}
      data-testid="skill-matrix"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <h2 id={titleId} className="matrix-title">
        Demand versus scarcity matrix
      </h2>
      <p className="matrix-hint">
        Each skill is plotted by market demand (left to right) and talent scarcity (bottom to top);
        bubble size is its share of role postings. Points are distinguished by shape and label, not
        color alone. The same figures are listed in the table below.
      </p>

      <div className="matrix-canvas">
        <span className="matrix-axis-y">Scarcity index &uarr;</span>
        <div className="matrix-plot">
          {scored.map((row, i) => {
            const shape = SHAPES[i % SHAPES.length]
            const size = Math.max(24, Math.min(64, 24 + row.pct_of_role * 0.5))
            return (
              <button
                key={row.skill_key ?? row.skill_name_raw}
                type="button"
                data-testid="scatter-point"
                data-shape={shape}
                className="matrix-point"
                aria-label={`${row.skill_name_raw}: demand ${row.demand_score}, scarcity ${row.scarcity_index}, market share ${row.pct_of_role}% of role postings${
                  row.arbitrage_score !== null ? `, arbitrage score ${row.arbitrage_score}` : ''
                }`}
                style={{
                  left: `${row.demand_score}%`,
                  bottom: `${row.scarcity_index}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  clipPath: SHAPE_CLIP[shape],
                  background: SERIES_VARS[i % SERIES_VARS.length],
                }}
              />
            )
          })}
        </div>
        <span className="matrix-axis-x">Demand score &rarr;</span>
      </div>

      <SkillDataTable rows={rows} caption={caption} />
    </section>
  )
}
