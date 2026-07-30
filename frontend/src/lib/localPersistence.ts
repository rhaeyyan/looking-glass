// specs/034-local-persistence.md — thin, directly-called localStorage wrapper for the three raw
// user inputs (resumeText, selectedRole, selectedSeniority). No pattern: the storage backend is
// not expected to vary (SPEC's Design Pattern: "none — simple case").
//
// One versioned key, one JSON blob, whole-object validation: any single invalid field discards
// the ENTIRE stored blob back to `null` rather than partially hydrating (see SPEC's Edge Cases).
// Never throws — every localStorage access here is wrapped so a throwing/unavailable store
// (Safari private mode, disabled storage) degrades to "nothing stored," identical to today.
import { ROLES } from './roles'
import type { SeniorityLevel } from './seniorityFraming'

const STORAGE_KEY = 'lookingglass:v1:state'

const VALID_SENIORITIES: ReadonlySet<string> = new Set(['', 'entry', 'mid', 'senior'])

export interface PersistedState {
  resumeText: string
  selectedRole: string
  selectedSeniority: SeniorityLevel | ''
}

function isValidPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>

  if (typeof candidate.resumeText !== 'string') return false
  if (typeof candidate.selectedRole !== 'string') return false
  if (candidate.selectedRole !== '' && !(ROLES as readonly string[]).includes(candidate.selectedRole)) {
    return false
  }
  if (typeof candidate.selectedSeniority !== 'string' || !VALID_SENIORITIES.has(candidate.selectedSeniority)) {
    return false
  }

  return true
}

export function savePersistedState(state: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Safari private mode / quota exceeded / storage disabled — silently no-op, same as never
    // having persisted at all.
  }
}

export function loadPersistedState(): PersistedState | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isValidPersistedState(parsed)) return null

  return {
    resumeText: parsed.resumeText,
    selectedRole: parsed.selectedRole,
    selectedSeniority: parsed.selectedSeniority,
  }
}

export function clearPersistedState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Never throws back to the caller — see savePersistedState's rationale.
  }
}
