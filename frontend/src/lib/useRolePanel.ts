import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoleSkillProfile, type RoleSkillRow } from './supabaseClient'
import { extractResumeSkills } from './resumeSkills'
import { computeSkillGap } from './gap'
import { narrateTopGaps } from './narrate'
import { normalizeSkillName } from './normalize'

export type RolePanelStatus = 'idle' | 'loading' | 'success' | 'error'
export type RolePanelTopGaps = ReturnType<typeof narrateTopGaps>

// Extraction's output, awaiting the user's confirm/edit pass (spec 038a) before it is allowed to
// feed `computeSkillGap`. `rows` is the exact row set extraction ran against, captured at
// `submitResume` time, so a later, in-flight `loadRole` can never make `confirmSkills` re-slice
// against a different role's rows.
export interface PendingConfirmation {
  rows: RoleSkillRow[]
  autoDetectedKeys: Set<string>
}

export interface UseRolePanelResult {
  status: RolePanelStatus
  rows: RoleSkillRow[]
  errorMessage: string
  haveSkillKeys: Set<string> | undefined
  topGaps: RolePanelTopGaps | undefined
  selectedGroup: string | null
  setSelectedGroup: (group: string | null) => void
  pendingConfirmation: PendingConfirmation | undefined
  submitResume: (resumeText: string) => void
  submitResumeAutoConfirm: (resumeText: string) => void
  confirmSkills: (checkedSkillKeys: Set<string>) => void
  cancelConfirmation: () => void
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
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | undefined>(
    undefined,
  )

  // Bumped on every effect run; a resolved/rejected fetch is only applied if this ref still
  // matches the generation it was issued under — discards a stale role's slow response after
  // `loadRole` has already moved this instance on to a newer one. The same generation bump also
  // guards `pendingConfirmation`: any draft outstanding when `loadRole` fires is stale by
  // construction (its captured `rows` belong to the role being left), so it is discarded here
  // alongside `haveSkillKeys`/`topGaps` rather than via a second, independently-drifting guard.
  const requestGenerationRef = useRef(0)

  useEffect(() => {
    const generation = ++requestGenerationRef.current

    setHaveSkillKeys(undefined)
    setTopGaps(undefined)
    setSelectedGroup(null)
    setPendingConfirmation(undefined)

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

  // Extraction-only phase (spec 038a): runs `extractResumeSkills` against this instance's own
  // `rows` and stores the result as a `pendingConfirmation` draft for the caller to review/edit.
  // Deliberately does NOT call `computeSkillGap`/`narrateTopGaps` — that is `confirmSkills`' job,
  // gated on the user's confirm step, never run implicitly on extraction alone.
  const submitResume = useCallback(
    (resumeText: string) => {
      const vocabulary = rows.map((row) => row.skill_name_raw)
      const extractedNames = extractResumeSkills(resumeText, vocabulary)
      const extractedNameSet = new Set(extractedNames)
      const autoDetectedKeys = new Set(
        rows
          .filter((row) => extractedNameSet.has(row.skill_name_raw))
          .map((row) => row.skill_key ?? normalizeSkillName(row.skill_name_raw)),
      )
      setPendingConfirmation({ rows, autoDetectedKeys })
    },
    [rows],
  )

  // Confirmation phase (spec 038a): pure re-slice of the draft's captured `rows` by the caller's
  // chosen key set — no scoring of its own — then the existing, unmodified
  // `computeSkillGap`/`narrateTopGaps` calls, exactly as the pre-split `submitResume` used to run
  // inline. Uses `pendingConfirmation.rows` (not the live `rows` state) so a confirm can never be
  // silently re-sliced against a role the fetch has since moved on to — though in practice
  // `loadRole` already clears `pendingConfirmation` outright before that could happen.
  const confirmSkills = useCallback(
    (checkedSkillKeys: Set<string>) => {
      if (!pendingConfirmation) return
      const confirmedNames = pendingConfirmation.rows
        .filter((row) => checkedSkillKeys.has(row.skill_key ?? normalizeSkillName(row.skill_name_raw)))
        .map((row) => row.skill_name_raw)
      const gap = computeSkillGap(pendingConfirmation.rows, confirmedNames)
      setHaveSkillKeys(gap.haveSkillKeys)
      setTopGaps(narrateTopGaps(gap.rows, gap.haveSkillKeys))
      setPendingConfirmation(undefined)
    },
    [pendingConfirmation],
  )

  const cancelConfirmation = useCallback(() => {
    setPendingConfirmation(undefined)
  }, [])

  // Permanent one-shot path (spec 038a amendment): App.tsx's compare-mode fan-out call sites,
  // which have no confirm-step UI to hand a draft to. Runs the exact same
  // extractResumeSkills → computeSkillGap → narrateTopGaps sequence `submitResume`/`confirmSkills`
  // run in two steps, but in the old one-shot order, and never stages (or needs to clear) a
  // `pendingConfirmation` draft.
  const submitResumeAutoConfirm = useCallback(
    (resumeText: string) => {
      const vocabulary = rows.map((row) => row.skill_name_raw)
      const extractedNames = extractResumeSkills(resumeText, vocabulary)
      const gap = computeSkillGap(rows, extractedNames)
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
    pendingConfirmation,
    submitResume,
    submitResumeAutoConfirm,
    confirmSkills,
    cancelConfirmation,
    loadRole,
  }
}
