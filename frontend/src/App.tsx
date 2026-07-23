import { useState } from 'react'
import { ROLES } from './lib/roles'
import { fetchRoleSkillProfile, type RoleSkillRow } from './lib/supabaseClient'
import { SkillMatrix } from './components/matrix/SkillMatrix'
import { ArbitrageLadder } from './components/matrix/ArbitrageLadder'

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
        <>
          <SkillMatrix rows={rows} />
          <ArbitrageLadder rows={rows} />
        </>
      )}
    </main>
  )
}

export default App
