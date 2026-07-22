import { useState } from 'react'
import { ROLES } from './lib/roles'
import { fetchRoleSkillProfile, type RoleSkillRow } from './lib/supabaseClient'

type Status = 'idle' | 'loading' | 'success' | 'error'

function App() {
  const [selectedRole, setSelectedRole] = useState('')
  const [rows, setRows] = useState<RoleSkillRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const role = event.target.value
    setSelectedRole(role)

    if (!role) {
      setStatus('idle')
      setRows([])
      return
    }

    setStatus('loading')
    try {
      const result = await fetchRoleSkillProfile(role)
      setRows(result)
      setStatus('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <main>
      <h1>Looking Glass</h1>

      <label htmlFor="role-picker">Target role</label>
      <select id="role-picker" value={selectedRole} onChange={handleRoleChange}>
        <option value="">Select a role</option>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>

      {status === 'loading' && <p role="status">Loading skill profile…</p>}

      {status === 'error' && (
        <p role="alert">Could not load skill profile: {errorMessage}</p>
      )}

      {status === 'success' && rows.length === 0 && (
        <p role="status">No skills found for this role.</p>
      )}

      {status === 'success' && rows.length > 0 && (
        <table>
          <caption>Skill profile for {selectedRole}</caption>
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
            {rows.map((row) => (
              <tr key={row.skill_key ?? row.skill_name_raw}>
                <th scope="row">{row.skill_name_raw}</th>
                <td>{row.pct_of_role}%</td>
                <td>{row.postings_with_skill}</td>
                <td>{row.demand_score ?? '—'}</td>
                <td>{row.scarcity_index ?? '—'}</td>
                <td>{row.arbitrage_score ?? '—'}</td>
                <td>
                  {row.d3_corroborated === null
                    ? '—'
                    : row.d3_corroborated
                      ? 'Yes'
                      : 'No'}
                </td>
                <td>{row.skill_key === null ? 'Demand only, scarcity unknown' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

export default App
