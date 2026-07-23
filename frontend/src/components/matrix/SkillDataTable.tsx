import type { RoleSkillRow } from '../../lib/supabaseClient'

// The mandated text alternative for the demand×scarcity matrix (WCAG 2.2 AA data-viz rule:
// the numbers a chart encodes must also be available as an accessible table). Every value is
// read VERBATIM off `RoleSkillRow` — no score, gap, or ranking is computed here (Bounded-AI).
//
// The demand-only row (null arbitrage fields) is NEVER dropped: its unknown numerics render as an
// em dash and it carries the explicit "Demand only, scarcity unknown" flag, so absence of data is
// visible, not silent.

const DEMAND_ONLY_FLAG = 'Demand only, scarcity unknown'

function num(value: number | null): string {
  return value === null ? '—' : String(value)
}

export function SkillDataTable({ rows, caption }: { rows: RoleSkillRow[]; caption: string }) {
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
          <th scope="col">Arbitrage score</th>
          <th scope="col">D3 corroborated</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const demandOnly = row.skill_key === null
          return (
            <tr key={row.skill_key ?? row.skill_name_raw}>
              <th scope="row">{row.skill_name_raw}</th>
              <td>{row.pct_of_role}%</td>
              <td>{row.postings_with_skill}</td>
              <td>{num(row.demand_score)}</td>
              <td>{num(row.scarcity_index)}</td>
              <td>{num(row.arbitrage_score)}</td>
              <td>
                {row.d3_corroborated === null ? '—' : row.d3_corroborated ? 'Yes' : 'No'}
              </td>
              <td>{demandOnly ? DEMAND_ONLY_FLAG : ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
