import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { formatNum } from '../../lib/format'
import { normalizeSkillName } from '../../lib/normalize'
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

export function SkillMatrix({
  rows,
  haveSkillKeys,
}: {
  rows: RoleSkillRow[]
  haveSkillKeys?: Set<string>
}) {
  const titleId = useId()
  const reduced = prefersReducedMotion()
  const scored = rows.filter(isScored)
  const caption = `Skill profile for ${rows[0]?.role_family ?? 'selected role'}`

  return (
    <section
      className="matrix-root card blueprint elev-md"
      aria-labelledby={titleId}
      data-testid="skill-matrix"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <h2 id={titleId} className="matrix-title">
        Where each skill sits
      </h2>
      <p className="matrix-hint">
        Each skill is placed by how many jobs want it (left to right) and how few people have it
        (bottom to top). The top-right corner is where a skill is both in demand and hard to hire
        for — the highest-leverage place to aim. Bubble size is how often the skill shows up in this
        role. Points are told apart by shape and label, not color alone, and the same numbers are in
        the table below.
      </p>

      <div className="matrix-canvas">
        <span className="matrix-axis-y">Fewer people have it &uarr;</span>
        <div className="matrix-plot">
          {scored.map((row, i) => {
            const shape = SHAPES[i % SHAPES.length]
            const size = Math.max(24, Math.min(64, 24 + row.pct_of_role * 0.5))
            const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
            const have = haveSkillKeys?.has(key)
            const haveSuffix =
              have === undefined
                ? ''
                : have
                  ? ', you already have this skill'
                  : ', worth learning — not on your resume yet'
            return (
              <button
                key={row.skill_key ?? row.skill_name_raw}
                type="button"
                data-testid="scatter-point"
                data-shape={shape}
                data-have={have === undefined ? undefined : have ? 'true' : 'false'}
                className="matrix-point"
                aria-label={`${row.skill_name_raw}: demand ${formatNum(row.demand_score)}, scarcity ${formatNum(row.scarcity_index)}, market share ${row.pct_of_role}% of role postings${
                  row.arbitrage_score !== null ? `, leverage score ${formatNum(row.arbitrage_score)}` : ''
                }${haveSuffix}`}
                style={{
                  left: `${row.demand_score}%`,
                  bottom: `${row.scarcity_index}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  clipPath: SHAPE_CLIP[shape],
                  background: SERIES_VARS[i % SERIES_VARS.length],
                }}
              >
                {have !== undefined && (
                  <span className="matrix-point-flag" data-testid="have-flag" aria-hidden="true">
                    {have ? 'Already have' : 'Worth learning'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <span className="matrix-axis-x">More jobs want it &rarr;</span>
      </div>

      <SkillDataTable rows={rows} caption={caption} haveSkillKeys={haveSkillKeys} />
    </section>
  )
}
