// specs/034-local-persistence.md — thin, directly-called localStorage wrapper for the three raw
// user inputs (resumeText, selectedRole, selectedSeniority). No pattern: the storage backend is
// not expected to vary (SPEC's Design Pattern: "none — simple case").
//
// specs/038b-skill-confirmation-checklist-ui.md bumps the schema to v2
// (`lookingglass:v2:state`), adding `confirmedSkillKeys` and `confirmedFingerprint` — see those
// fields' doc comments below for the fingerprint-mismatch fail-open semantics. There is nothing
// safe to migrate from a v1 blob (v1 never had confirmation semantics), so v1 blobs — whether
// still under the old key or somehow shaped like v1 under the new key — are discarded wholesale,
// never partially read.
//
// One versioned key, one JSON blob, whole-object validation: any single invalid field discards
// the ENTIRE stored blob back to `null` rather than partially hydrating (see SPEC's Edge Cases).
// Never throws — every localStorage access here is wrapped so a throwing/unavailable store
// (Safari private mode, disabled storage) degrades to "nothing stored," identical to today.
import { ROLES } from './roles'
import type { SeniorityLevel } from './seniorityFraming'

const STORAGE_KEY = 'lookingglass:v2:state'

const VALID_SENIORITIES: ReadonlySet<string> = new Set(['', 'entry', 'mid', 'senior'])

/** A verbatim snapshot of the (resumeText, role) pair `confirmedSkillKeys` was confirmed
 * against, captured once at confirm time — not re-derived from the blob's own top-level
 * resumeText/selectedRole, which keep changing on every keystroke. */
export interface ConfirmedFingerprint {
  resumeText: string
  role: string
}

export interface PersistedState {
  resumeText: string
  selectedRole: string
  selectedSeniority: SeniorityLevel | ''
  confirmedSkillKeys: string[] | null
  confirmedFingerprint: ConfirmedFingerprint | null
}

function isValidConfirmedSkillKeys(value: unknown): value is string[] | null {
  if (value === null) return true
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isValidConfirmedFingerprint(value: unknown): value is ConfirmedFingerprint | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const keys = Object.keys(candidate)
  if (keys.length !== 2) return false
  return typeof candidate.resumeText === 'string' && typeof candidate.role === 'string'
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

  // Both keys must be present (value may legitimately be `null`) — a blob missing either key
  // entirely (any v1 blob, or anything else that predates this schema) is invalid v2 shape and
  // is discarded wholesale rather than partially hydrated with these two defaulted.
  if (!('confirmedSkillKeys' in candidate) || !('confirmedFingerprint' in candidate)) return false
  if (!isValidConfirmedSkillKeys(candidate.confirmedSkillKeys)) return false
  if (!isValidConfirmedFingerprint(candidate.confirmedFingerprint)) return false

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

  const { resumeText, selectedRole, selectedSeniority, confirmedSkillKeys, confirmedFingerprint } = parsed

  // Fingerprint mismatch: a narrower, separate discard than whole-blob-shape validation above —
  // only the confirmed-set fields fail open to `null`, never resumeText/selectedRole/
  // selectedSeniority (SPEC's Edge Cases: a stale confirmed set must never silently reapply to
  // new input, but that must not cost the user their in-progress resumeText/role/seniority too).
  if (
    confirmedFingerprint !== null &&
    (confirmedFingerprint.resumeText !== resumeText || confirmedFingerprint.role !== selectedRole)
  ) {
    return {
      resumeText,
      selectedRole,
      selectedSeniority,
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    }
  }

  return {
    resumeText,
    selectedRole,
    selectedSeniority,
    confirmedSkillKeys,
    confirmedFingerprint,
  }
}

export function clearPersistedState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Never throws back to the caller — see savePersistedState's rationale.
  }
}
