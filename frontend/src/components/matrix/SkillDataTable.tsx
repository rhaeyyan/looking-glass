import type { RoleSkillRow } from '../../lib/supabaseClient'
import { formatNum } from '../../lib/format'
import { normalizeSkillName } from '../../lib/normalize'

// The mandated text alternative for the demand×scarcity matrix (WCAG 2.2 AA data-viz rule:
// the numbers a chart encodes must also be available as an accessible table). Every value is
// read VERBATIM off `RoleSkillRow` — no score, gap, or ranking is computed here (Bounded-AI).
//
// The demand-only row (null arbitrage fields) is NEVER dropped: its unknown numerics render as an
// em dash and it carries the explicit "Demand only, scarcity unknown" flag, so absence of data is
// visible, not silent.
//
// `haveSkillKeys` (spec 004, Task 6) is additive and optional: omitted -> byte-identical rendering
// to before this prop existed (no extra column). Provided -> an explicit "Have or gap" text column,
// never color-only, keyed by the same identifier `computeSkillGap` produces
// (`row.skill_key ?? normalizeSkillName(row.skill_name_raw)`).

const DEMAND_ONLY_FLAG = 'Demand only, scarcity unknown'

export function SkillDataTable({
  rows,
  caption,
  haveSkillKeys,
}: {
  rows: RoleSkillRow[]
  caption: string
  haveSkillKeys?: Set<string>
}) {
  return (
    <table className="matrix-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">% of role postings</th>
          <th scope="col">Postings with skill</th>
          <th scope="col">Demand score</th>
          <th scope="col">Scarcity index</th>
          <th scope="col">Leverage score</th>
          <th scope="col">Confirmed across postings</th>
          <th scope="col">Notes</th>
          {haveSkillKeys && <th scope="col">Status</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const demandOnly = row.skill_key === null
          const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
          const have = haveSkillKeys?.has(key) ?? false
          return (
            <tr key={row.skill_key ?? row.skill_name_raw}>
              <th scope="row">{row.skill_name_raw}</th>
              <td>{row.pct_of_role}%</td>
              <td>{row.postings_with_skill}</td>
              <td>{formatNum(row.demand_score)}</td>
              <td>{formatNum(row.scarcity_index)}</td>
              <td>{formatNum(row.arbitrage_score)}</td>
              <td>
                {row.d3_corroborated === null ? '—' : row.d3_corroborated ? 'Yes' : 'No'}
              </td>
              <td>{demandOnly ? DEMAND_ONLY_FLAG : ''}</td>
              {haveSkillKeys && <td>{have ? 'Already have' : 'Worth learning'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
