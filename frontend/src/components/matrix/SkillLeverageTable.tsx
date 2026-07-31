import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { formatNum, formatSalaryPremiumPhrase } from '../../lib/format'
import { normalizeSkillName } from '../../lib/normalize'
import './matrix.css'

// The combined "every skill, ranked by leverage" table — merges the former standalone data table
// ("Skill profile for {role}") and the arbitrage ladder into ONE ranked, detailed view, and also
// serves as the demand×scarcity scatter's accessible numeric alternative (WCAG 2.2 AA data-viz
// rule: the numbers a chart encodes must also be available as an accessible table).
//
// Bounded-AI: the sort is a presentation transform of the already-computed `arbitrage_score` (read
// verbatim, null-score rows last); the inline leverage bar's width is `score / topScore`, a display
// transform — no new metric is computed here.

const DEMAND_ONLY_FLAG = 'Demand only, scarcity unknown'

function byArbitrageDesc(a: RoleSkillRow, b: RoleSkillRow): number {
  if (a.arbitrage_score === null && b.arbitrage_score === null) return 0
  if (a.arbitrage_score === null) return 1
  if (b.arbitrage_score === null) return -1
  return b.arbitrage_score - a.arbitrage_score
}

export function SkillLeverageTable({
  rows,
  haveSkillKeys,
  roleName,
}: {
  rows: RoleSkillRow[]
  haveSkillKeys?: Set<string>
  roleName: string
}) {
  const titleId = useId()
  const salaryFootnoteId = useId()
  // The scroll wrapper below needs its OWN accessible name — reusing `titleId` here would give it
  // the exact same computed name as the ancestor `<section aria-labelledby={titleId}>`, so a
  // screen-reader user landmark-navigating would hear two nested regions announce identically. A
  // distinct `aria-label` (not a shared id) sidesteps that collision entirely.
  const scrollRegionLabel = `Scrollable table: ${roleName} — every skill, ranked by leverage`
  const ranked = [...rows].sort(byArbitrageDesc)
  const topScore = ranked.reduce((max, r) => Math.max(max, r.arbitrage_score ?? 0), 0)

  return (
    <section className="leverage-root" aria-labelledby={titleId}>
      <h3 id={titleId} className="ladder-title">
        {roleName} — every skill, ranked by leverage
      </h3>
      <p className="ladder-hint">
        Every skill this role needs, ranked by leverage score (most worth learning first). The bar
        shows each score next to the top move; skills we only have demand data for are listed last
        and flagged.
      </p>

      {/* WCAG 2.2 AA `scrollable-region-focusable`: this wrapper is the horizontally-scrolling
          region (matrix.css: `overflow-x: auto`). `tabIndex={0}` + `role="region"` +
          `aria-label` put it in the tab order with its own accessible name distinct from both the
          table's <caption> and the outer <section>'s heading, so a keyboard-only user can actually
          tab to it and scroll it (native arrow-key scrolling on a focused, overflowing block —
          no keydown handler needed). */}
      <div
        className="leverage-tablewrap"
        // This is the WAI-ARIA APG "scrollable region" pattern (w3.org/WAI/tutorials/tables), not
        // a stray tabindex on a static container: this region must be keyboard-focusable so it can
        // be scrolled, and `role="region"` + `aria-label` give it a real accessible name/role. The
        // lint rule's role allowlist has no "scrollable container" case.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={scrollRegionLabel}
      >
        <table className="matrix-table leverage-table">
          <caption className="visually-hidden">
            Skill profile for {roleName}, ranked by leverage score
          </caption>
          <colgroup>
            {/* The sticky lead columns (#, Skill, Status) intentionally have no <col> width here —
                their widths already come from .lev-num/.lev-skill/.lev-status (spec 023) and must
                stay exactly as-is. Every metric column below gets its own explicit width so none
                of them split the leftover space evenly regardless of content length. */}
            <col span={haveSkillKeys ? 3 : 2} />
            <col className="lev-col-leverage" />
            <col className="lev-col-demand" />
            <col className="lev-col-scarcity" />
            <col className="lev-col-salary" />
            <col className="lev-col-days" />
            <col className="lev-col-pctrole" />
            <col className="lev-col-confirmed" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="lev-num">
                #
              </th>
              <th scope="col" className="lev-skill-h">
                Skill
              </th>
              {haveSkillKeys && (
                <th scope="col" className="lev-status-h">
                  <span className="lev-status-h-label">Status</span>
                </th>
              )}
              <th scope="col">Leverage</th>
              <th scope="col">Demand</th>
              <th scope="col">Scarcity</th>
              <th scope="col" aria-describedby={salaryFootnoteId}>
                Salary premium
                <span aria-hidden="true" className="lev-footnote-marker">
                  *
                </span>
              </th>
              <th scope="col">Days to fill</th>
              <th scope="col">% of role</th>
              <th scope="col" className="lev-confirmed-h">
                Confirmed across postings
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, i) => {
              const demandOnly = row.arbitrage_score === null
              const widthPct =
                topScore > 0 && row.arbitrage_score !== null
                  ? (row.arbitrage_score / topScore) * 100
                  : 0
              const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
              const have = haveSkillKeys?.has(key)
              return (
                <tr key={row.skill_key ?? row.skill_name_raw} data-demand-only={demandOnly || undefined}>
                  <td className="lev-num lev-rank">{i + 1}</td>
                  <th scope="row" className="lev-skill">
                    {row.skill_name_raw}
                    {demandOnly && <span className="lev-demandonly">{DEMAND_ONLY_FLAG}</span>}
                  </th>
                  {haveSkillKeys && (
                    <td
                      className="lev-status"
                      data-have={have === undefined ? undefined : have ? 'true' : 'false'}
                    >
                      <span aria-hidden="true" className="lev-status-icon">
                        {have ? '✓' : '✕'}
                      </span>
                      <span className="lev-status-label">{have ? 'Already have' : 'Worth learning'}</span>
                    </td>
                  )}
                  <td className="lev-leverage">
                    {demandOnly ? (
                      <span className="lev-bar-val" aria-hidden="true">
                        —
                      </span>
                    ) : (
                      <span className="lev-bar-wrap">
                        <span className="lev-bar-track" aria-hidden="true">
                          <span className="lev-bar" style={{ width: `${widthPct}%` }} />
                        </span>
                        <span className="lev-bar-val">{formatNum(row.arbitrage_score)}</span>
                      </span>
                    )}
                  </td>
                  <td className="lev-metric">{formatNum(row.demand_score)}</td>
                  <td className="lev-metric">{formatNum(row.scarcity_index)}</td>
                  <td className="lev-salary">
                    {row.salary_premium_pct == null
                      ? '—'
                      : formatSalaryPremiumPhrase(row.salary_premium_pct)}
                  </td>
                  <td className="lev-metric">
                    {row.median_days_open == null ? '—' : formatNum(row.median_days_open)}
                  </td>
                  <td className="lev-metric">{row.pct_of_role}%</td>
                  <td>{row.d3_corroborated == null ? '—' : row.d3_corroborated ? 'Yes' : 'No'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p id={salaryFootnoteId} className="ladder-hint lev-footnote">
        * Salary premium is the dataset&rsquo;s own metric, comparing this skill&rsquo;s pay against
        typical pay for that skill&rsquo;s job category.
      </p>
    </section>
  )
}
