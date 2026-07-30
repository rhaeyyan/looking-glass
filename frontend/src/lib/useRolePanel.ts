import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoleSkillProfile, type RoleSkillRow } from './supabaseClient'
import { extractResumeSkills } from './resumeSkills'
import { computeSkillGap } from './gap'
import { narrateTopGaps } from './narrate'

export type RolePanelStatus = 'idle' | 'loading' | 'success' | 'error'
export type RolePanelTopGaps = ReturnType<typeof narrateTopGaps>

export interface UseRolePanelResult {
  status: RolePanelStatus
  rows: RoleSkillRow[]
  errorMessage: string
  haveSkillKeys: Set<string> | undefined
  topGaps: RolePanelTopGaps | undefined
  selectedGroup: string | null
  setSelectedGroup: (group: string | null) => void
  submitResume: (resumeText: string) => void
  loadRole: (role: string) => void
}

/**
 * Owns one role's entire results-panel state slice — `rows`/`status`/`errorMessage`/
 * `haveSkillKeys`/`topGaps`/`selectedGroup` — moved verbatim from App.tsx's former
 * `loadRoleProfile`/`runGapPipeline` (spec 035).
 *
 * `role` is consumed only as this instance's *initial* role (React's `useState(initialValue)`
 * convention): later role changes go through the returned `loadRole`, never by re-rendering this
 * hook with a new `role` argument. This keeps the caller's own role state (which still drives a
 * `<select>` and any `role`-labelled UI) decoupled from this hook's internal refetch trigger.
 *
 * Isolation is provable by construction: every call site is a lexically distinct closure over its
 * own `useState`/`useRef` calls, so one instance's role change can never read or write a sibling
 * instance's slot. The per-instance request-generation ref discards any fetch that settles after
 * a newer `loadRole` call has already superseded it — the out-of-order hazard spec 036's
 * multi-instance compare mode will otherwise hit.
 */
export function useRolePanel(role: string): UseRolePanelResult {
  const [currentRole, setCurrentRole] = useState(role)
  const [status, setStatus] = useState<RolePanelStatus>(currentRole ? 'loading' : 'idle')
  const [rows, setRows] = useState<RoleSkillRow[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [haveSkillKeys, setHaveSkillKeys] = useState<Set<string> | undefined>(undefined)
  const [topGaps, setTopGaps] = useState<RolePanelTopGaps | undefined>(undefined)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  // Bumped on every effect run; a resolved/rejected fetch is only applied if this ref still
  // matches the generation it was issued under — discards a stale role's slow response after
  // `loadRole` has already moved this instance on to a newer one.
  const requestGenerationRef = useRef(0)

  useEffect(() => {
    const generation = ++requestGenerationRef.current

    setHaveSkillKeys(undefined)
    setTopGaps(undefined)
    setSelectedGroup(null)

    if (!currentRole) {
      setStatus('idle')
      setRows([])
      return
    }

    setStatus('loading')
    fetchRoleSkillProfile(currentRole)
      .then((result) => {
        if (requestGenerationRef.current !== generation) return
        setRows(result)
        setStatus('success')
      })
      .catch((err) => {
        if (requestGenerationRef.current !== generation) return
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      })
  }, [currentRole])

  const loadRole = useCallback((newRole: string) => {
    setCurrentRole(newRole)
  }, [])

  // Hook-instance-local equivalent of the former `runGapPipeline`: reads only this instance's own
  // `rows`, calls the existing (unchanged, unmoved) `computeSkillGap`/`narrateTopGaps`, and writes
  // only this instance's own `haveSkillKeys`/`topGaps`.
  const submitResume = useCallback(
    (resumeText: string) => {
      const vocabulary = rows.map((row) => row.skill_name_raw)
      const skills = extractResumeSkills(resumeText, vocabulary)
      const gap = computeSkillGap(rows, skills)
      setHaveSkillKeys(gap.haveSkillKeys)
      setTopGaps(narrateTopGaps(gap.rows, gap.haveSkillKeys))
    },
    [rows],
  )

  return {
    status,
    rows,
    errorMessage,
    haveSkillKeys,
    topGaps,
    selectedGroup,
    setSelectedGroup,
    submitResume,
    loadRole,
  }
}
