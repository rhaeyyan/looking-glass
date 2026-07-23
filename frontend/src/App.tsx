import { useState } from 'react'
import { ROLES } from './lib/roles'
import { fetchRoleSkillProfile, type RoleSkillRow } from './lib/supabaseClient'
import { extractResumeSkills } from './lib/resumeSkills'
import { computeSkillGap } from './lib/gap'
import { narrateTopGap } from './lib/narrate'
import { SkillMatrix } from './components/matrix/SkillMatrix'
import { ArbitrageLadder } from './components/matrix/ArbitrageLadder'
import { TopGapNarration } from './components/matrix/TopGapNarration'

type Status = 'idle' | 'loading' | 'success' | 'error'
type ExtractStatus = 'idle' | 'loading' | 'success' | 'error'
type Narration = ReturnType<typeof narrateTopGap>

// Resume text is capped client-side to the edge function's own limit (spec 004, Task 6) so an
// oversized paste never round-trips to the server just to fail there.
const MAX_RESUME_LENGTH = 20000
const ROLE_REQUIRED_MESSAGE = 'Select a target role before finding your gaps.'
const RESUME_REQUIRED_MESSAGE = 'Paste your resume text before finding your gaps.'
// Locked verbatim (spec 005, Cypress's compliance report) — the authoritative wording, not the
// SPEC's example text. Never re-derive or paraphrase.
const NO_GAPS_MESSAGE = 'No gaps — you already have every skill this role needs.'

function App() {
  const [selectedRole, setSelectedRole] = useState('')
  const [rows, setRows] = useState<RoleSkillRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const [resumeText, setResumeText] = useState('')
  const [extractStatus, setExtractStatus] = useState<ExtractStatus>('idle')
  const [extractError, setExtractError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [haveSkillKeys, setHaveSkillKeys] = useState<Set<string> | undefined>(undefined)
  const [narration, setNarration] = useState<Narration | undefined>(undefined)

  async function handleRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const role = event.target.value
    setSelectedRole(role)
    setHaveSkillKeys(undefined)
    setNarration(undefined)

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

  async function handleResumeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError('')
    setExtractError('')

    if (!selectedRole) {
      setValidationError(ROLE_REQUIRED_MESSAGE)
      return
    }
    if (resumeText.trim() === '') {
      setValidationError(RESUME_REQUIRED_MESSAGE)
      return
    }

    setExtractStatus('loading')
    try {
      const skills = await extractResumeSkills(resumeText)
      const gap = computeSkillGap(rows, skills)
      setHaveSkillKeys(gap.haveSkillKeys)
      setNarration(narrateTopGap(gap.rows, gap.haveSkillKeys))
      setExtractStatus('success')
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Unknown error')
      setExtractStatus('error')
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

      {status === 'loading' && (
        <p role="status" aria-label="Loading skill profile">
          Loading skill profile…
        </p>
      )}

      {status === 'error' && (
        <p role="alert">Could not load skill profile: {errorMessage}</p>
      )}

      {status === 'success' && rows.length === 0 && (
        <p role="status" aria-label="No skills found for this role">
          No skills found for this role.
        </p>
      )}

      <form onSubmit={handleResumeSubmit}>
        <label htmlFor="resume-text">Resume text</label>
        <textarea
          id="resume-text"
          value={resumeText}
          maxLength={MAX_RESUME_LENGTH}
          onChange={(event) => setResumeText(event.target.value)}
        />
        <button type="submit">Find my gaps</button>
      </form>

      {validationError && <p role="alert">{validationError}</p>}

      {extractStatus === 'loading' && (
        <p role="status">Extracting skills from your resume…</p>
      )}

      {extractStatus === 'error' && (
        <p role="alert">Could not extract skills from your resume: {extractError}</p>
      )}

      {status === 'success' && rows.length > 0 && (
        <>
          <SkillMatrix rows={rows} haveSkillKeys={haveSkillKeys} />
          <ArbitrageLadder rows={rows} haveSkillKeys={haveSkillKeys} />
        </>
      )}

      {narration === null && <p role="status">{NO_GAPS_MESSAGE}</p>}

      {narration && (
        <TopGapNarration
          topGap={narration.topGap}
          runnerUpGap={narration.runnerUpGap}
          narrative={narration.narrative}
        />
      )}
    </main>
  )
}

export default App
