import { describe, it, expect, beforeEach, vi } from 'vitest'
import { savePersistedState, loadPersistedState, clearPersistedState } from './localPersistence'

// specs/034-local-persistence.md — RED phase. `localPersistence.ts` does not exist yet, so every
// test below is expected to fail at the import step (module not found) until Redwood creates it.
//
// Storage key per the SPEC: `lookingglass:v1:state`, one JSON blob shaped
// `{ resumeText: string, selectedRole: string, selectedSeniority: 'entry' | 'mid' | 'senior' | '' }`.
// Whole-object validation: any single invalid field discards the ENTIRE stored blob back to
// `null`, never a partial hydration.

const STORAGE_KEY = 'lookingglass:v1:state'

function seed(value: unknown) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function validState(overrides: Partial<{ resumeText: string; selectedRole: string; selectedSeniority: string }> = {}) {
  return {
    resumeText: 'I know PostgreSQL and React.',
    selectedRole: 'Backend',
    selectedSeniority: 'mid',
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('savePersistedState / loadPersistedState — round trip', () => {
  it('round-trips resumeText, selectedRole, and selectedSeniority verbatim', () => {
    savePersistedState({
      resumeText: 'Built services with PostgreSQL and gRPC.',
      selectedRole: 'Backend',
      selectedSeniority: 'senior',
    })

    const loaded = loadPersistedState()
    expect(loaded).toEqual({
      resumeText: 'Built services with PostgreSQL and gRPC.',
      selectedRole: 'Backend',
      selectedSeniority: 'senior',
    })
  })

  it('round-trips an empty selectedSeniority ("") as a valid value, not treated as missing', () => {
    savePersistedState({
      resumeText: 'Some resume text',
      selectedRole: 'Frontend',
      selectedSeniority: '',
    })

    const loaded = loadPersistedState()
    expect(loaded).toEqual({
      resumeText: 'Some resume text',
      selectedRole: 'Frontend',
      selectedSeniority: '',
    })
  })

  it('writes under the versioned key "lookingglass:v1:state"', () => {
    savePersistedState({ resumeText: 'x', selectedRole: 'Backend', selectedSeniority: 'entry' })

    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toMatchObject({
      resumeText: 'x',
      selectedRole: 'Backend',
      selectedSeniority: 'entry',
    })
  })
})

describe('loadPersistedState — absence and corruption', () => {
  it('returns null when nothing is stored', () => {
    expect(loadPersistedState()).toBeNull()
  })

  it('returns null and never throws on malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json::')

    expect(() => loadPersistedState()).not.toThrow()
    expect(loadPersistedState()).toBeNull()
  })

  it('returns null on a version-tag mismatch (foreign/older schema under a different key shape)', () => {
    // Simulates a future v2 (or a pre-v1 foreign shape) stored under a key this version does not
    // recognize as its own — loadPersistedState must not attempt to interpret it.
    window.localStorage.setItem('lookingglass:v2:state', JSON.stringify(validState()))

    expect(loadPersistedState()).toBeNull()
  })

  it('discards the WHOLE blob when selectedRole is not a member of ROLES', () => {
    seed(validState({ selectedRole: 'Astronaut' }))

    expect(loadPersistedState()).toBeNull()
  })

  it('discards the whole blob when selectedRole is present but empty-string alongside otherwise-valid fields is still accepted', () => {
    // Empty-string selectedRole is a legitimate "no role chosen yet" state — must NOT be discarded.
    seed(validState({ selectedRole: '' }))

    expect(loadPersistedState()).toEqual({
      resumeText: 'I know PostgreSQL and React.',
      selectedRole: '',
      selectedSeniority: 'mid',
    })
  })

  it('discards the whole blob when selectedSeniority is outside {"", "entry", "mid", "senior"}', () => {
    seed(validState({ selectedSeniority: 'junior' }))

    expect(loadPersistedState()).toBeNull()
  })

  it('discards the whole blob when selectedSeniority is valid but selectedRole is invalid (whole-object, not per-field)', () => {
    seed(validState({ selectedRole: 'Not A Real Role', selectedSeniority: 'senior' }))

    expect(loadPersistedState()).toBeNull()
  })

  it('discards the whole blob when selectedRole is valid but selectedSeniority is invalid (whole-object, not per-field)', () => {
    seed(validState({ selectedRole: 'Backend', selectedSeniority: 'expert' }))

    expect(loadPersistedState()).toBeNull()
  })

  it('returns null when the stored value is valid JSON but not an object (e.g. a bare string or number)', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify('just a string'))
    expect(loadPersistedState()).toBeNull()

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(42))
    expect(loadPersistedState()).toBeNull()
  })

  it('returns null when resumeText or selectedRole is missing or the wrong type', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ selectedRole: 'Backend', selectedSeniority: 'mid' }),
    )
    expect(loadPersistedState()).toBeNull()

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ resumeText: 123, selectedRole: 'Backend', selectedSeniority: 'mid' }),
    )
    expect(loadPersistedState()).toBeNull()
  })
})

describe('localStorage unavailable/throwing (Safari private mode) — never throws back to the caller', () => {
  it('loadPersistedState returns null (not a thrown error) when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    expect(() => loadPersistedState()).not.toThrow()
    expect(loadPersistedState()).toBeNull()

    getItemSpy.mockRestore()
  })

  it('savePersistedState never throws when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    expect(() =>
      savePersistedState({ resumeText: 'x', selectedRole: 'Backend', selectedSeniority: '' }),
    ).not.toThrow()

    setItemSpy.mockRestore()
  })

  it('clearPersistedState never throws when localStorage.removeItem throws', () => {
    const removeItemSpy = vi
      .spyOn(window.localStorage.__proto__, 'removeItem')
      .mockImplementation(() => {
        throw new DOMException('Storage disabled.', 'SecurityError')
      })

    expect(() => clearPersistedState()).not.toThrow()

    removeItemSpy.mockRestore()
  })
})

describe('clearPersistedState', () => {
  it('removes the stored key so a subsequent load returns null', () => {
    savePersistedState({ resumeText: 'x', selectedRole: 'Backend', selectedSeniority: 'mid' })
    expect(loadPersistedState()).not.toBeNull()

    clearPersistedState()

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadPersistedState()).toBeNull()
  })
})
