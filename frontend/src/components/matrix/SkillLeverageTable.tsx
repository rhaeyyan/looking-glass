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
  const ranked = [...rows].sort(byArbitrageDesc)
  const topScore = ranked.reduce((max, r) => Math.max(max, r.arbitrage_score ?? 0), 0)

  return (
    <section className="card blueprint elev-md leverage-root" aria-labelledby={titleId}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <h2 id={titleId} className="ladder-title">
        {roleName} — every skill, ranked by leverage
      </h2>
      <p className="ladder-hint">
        Every skill this role needs, ranked by leverage score (most worth learning first). The bar
        shows each score next to the top move; skills we only have demand data for are listed last
        and flagged.
      </p>

      <div className="leverage-tablewrap">
        <table className="matrix-table leverage-table">
          <caption className="visually-hidden">
            Skill profile for {roleName}, ranked by leverage score
          </caption>
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
                  Status
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
              <th scope="col">Confirmed across postings</th>
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
                      {have ? 'Already have' : 'Worth learning'}
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
                  <td className="lev-metric">
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
