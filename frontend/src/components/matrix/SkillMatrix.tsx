import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { formatNum } from '../../lib/format'
import { normalizeSkillName } from '../../lib/normalize'
import './matrix.css'

// Demand×scarcity bubble scatter (matches the approved design mockup): x = demand, y = scarcity,
// bubble size = market share (pct_of_role); the top-right is the high-leverage zone.
//
// A11y (WCAG 2.2 AA, non-color-only) is carried by:
//   • POSITION (demand/scarcity) + SIZE (market share) — the load-bearing, fully non-color channels.
//   • A ✓ / ✕ GLYPH badge for the have/"worth learning" state (a symbol channel, not color).
//   • A per-point accessible NAME with the raw numbers, and the full accessible TABLE below.
// Color is reinforcement only. (The earlier per-index clip-path "shapes" encoded no real variable
// and hurt legibility — removed in favour of the mockup's cleaner glyph + hover-label scheme.)
//
// Only rows with numeric (demand, scarcity) coordinates are plotted; the demand-only row has no
// coordinate and is excluded from the scatter — but it still appears in the table below.
//
// Bounded-AI: coordinate/size mapping is a presentation transform of already-computed fields — no
// new metric is invented here. Axes are MIN-MAX NORMALIZED to fill the plot (the raw scores span a
// narrow low range), but every number in the label/table stays the verbatim raw value.

// Pad normalized coordinates into [PAD, 100 - PAD]% so bubbles never clip the plot edges.
const PAD = 8

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isScored(
  row: RoleSkillRow,
): row is RoleSkillRow & { demand_score: number; scarcity_index: number } {
  return row.demand_score !== null && row.scarcity_index !== null
}

/** Min-max scale `v` from [min,max] into [PAD, 100-PAD]. Collapses to the centre if the axis has
 *  no spread (all rows share one value). Presentation-only — never mutates the underlying score. */
function scaleToPlot(v: number, min: number, max: number): number {
  if (max === min) return 50
  return PAD + ((v - min) / (max - min)) * (100 - 2 * PAD)
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

  // Axis extents (raw), used only to normalize positions for display.
  const demands = scored.map((r) => r.demand_score)
  const scarcities = scored.map((r) => r.scarcity_index)
  const dMin = Math.min(...demands)
  const dMax = Math.max(...demands)
  const sMin = Math.min(...scarcities)
  const sMax = Math.max(...scarcities)
  const maxArb = scored.reduce((m, r) => Math.max(m, r.arbitrage_score ?? 0), 0)

  // Points closer than this (in normalized % space) to another point are "crowded": their name
  // label only reveals on hover/focus, so overlapping pills don't pile into unreadable text.
  const CROWD_DIST = 9
  const coords = scored.map((r) => ({
    x: scaleToPlot(r.demand_score, dMin, dMax),
    y: scaleToPlot(r.scarcity_index, sMin, sMax),
  }))
  const crowded = scored.map((_, i) =>
    coords.some((c, j) => i !== j && Math.hypot(coords[i].x - c.x, coords[i].y - c.y) < CROWD_DIST),
  )

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
        (bottom to top). The top-right corner is the high-leverage zone — in demand and hard to hire
        for. Bubble size is how often the skill shows up in this role; the same numbers are in the
        table below. Hover a crowded point to see its name.
      </p>

      <div className="matrix-canvas">
        <span className="matrix-axis-y">&larr; Harder to hire &nbsp;·&nbsp; Scarcity</span>
        <div className="matrix-plot">
          <span className="matrix-zone-hi">
            High-leverage zone
            <br />
            learn these first &rarr;
          </span>
          <span className="matrix-zone-lo">Low demand, easy to hire</span>
          {scored.map((row, i) => {
            const size = Math.max(20, Math.min(52, 20 + row.pct_of_role * 0.5))
            const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
            const have = haveSkillKeys?.has(key)
            const haveSuffix =
              have === undefined
                ? ''
                : have
                  ? ', you already have this skill'
                  : ', worth learning — not on your resume yet'

            // Colour: green = have, amber = worth learning, else a leverage-tier accent (darker =
            // higher). Reinforcement only — position/size/glyph/label already carry the meaning.
            let background: string
            if (have === true) background = 'var(--status-good)'
            else if (have === false) background = 'var(--status-critical)'
            else {
              const t = maxArb > 0 ? (row.arbitrage_score ?? 0) / maxArb : 0
              background =
                t > 0.66
                  ? 'var(--series-1)'
                  : t > 0.33
                    ? 'color-mix(in srgb, var(--series-1) 68%, var(--surface-1))'
                    : 'color-mix(in srgb, var(--series-1) 42%, var(--surface-1))'
            }

            return (
              <button
                key={row.skill_key ?? row.skill_name_raw}
                type="button"
                data-testid="scatter-point"
                data-have={have === undefined ? undefined : have ? 'true' : 'false'}
                className="matrix-point"
                aria-label={`${row.skill_name_raw}: demand ${formatNum(row.demand_score)}, scarcity ${formatNum(row.scarcity_index)}, market share ${row.pct_of_role}% of role postings${
                  row.arbitrage_score !== null ? `, leverage score ${formatNum(row.arbitrage_score)}` : ''
                }${haveSuffix}`}
                style={{
                  left: `${coords[i].x}%`,
                  bottom: `${coords[i].y}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  background,
                }}
              >
                {have !== undefined && (
                  <span className="matrix-point-flag" data-testid="have-flag" aria-hidden="true">
                    {have ? '✓' : '✕'}
                  </span>
                )}
                <span
                  className={crowded[i] ? 'matrix-point-label' : 'matrix-point-label matrix-label-always'}
                  aria-hidden="true"
                >
                  {row.skill_name_raw}
                </span>
              </button>
            )
          })}
        </div>
        <span className="matrix-axis-x">Demand &nbsp;·&nbsp; more jobs want it &rarr;</span>
      </div>

      <p className="matrix-alt-note">
        Prefer the numbers? Every skill&rsquo;s figures are in the ranked table below.
      </p>
    </section>
  )
}
