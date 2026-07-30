import { describe, it, expect, beforeEach, vi } from 'vitest'
import { savePersistedState, loadPersistedState, clearPersistedState } from './localPersistence'

// specs/034-local-persistence.md — RED-phase oracle, ORIGINALLY written against the v1 schema
// (`lookingglass:v1:state`, `{ resumeText, selectedRole, selectedSeniority }`). That schema shipped
// and these tests went green.
//
// specs/038b-skill-confirmation-checklist-ui.md bumps the schema to v2
// (`lookingglass:v2:state`), adding two new REQUIRED fields to the persisted shape:
//   - `confirmedSkillKeys: string[] | null` — the user's edited/confirmed skill-key set, or `null`
//     if nothing has been confirmed yet.
//   - `confirmedFingerprint: { resumeText: string; role: string } | null` — a verbatim snapshot of
//     the exact (resumeText, role) pair `confirmedSkillKeys` was confirmed against, captured once at
//     confirm time. This is deliberately NOT re-derived from the blob's own top-level
//     `resumeText`/`selectedRole` on every save: those two top-level fields keep changing on every
//     keystroke (spec 034's existing effect), while `confirmedFingerprint` is frozen at whatever it
//     was when `confirmSkills` last ran — that divergence, read back together in ONE loaded object,
//     is exactly what proves whether the confirmed set still applies to the resume/role currently
//     loaded (SPEC's Edge Cases: "edited resumeText or changed role after a confirmation invalidates
//     the persisted set via fingerprint mismatch — never silently reapplied to new input").
//   A "fingerprint" here is literally the (resumeText, role) pair itself, not a hash — no new
//   computation, per the SPEC's Bounded-AI boundary ("Zero new computation").
//
// `isValidPersistedState`'s existing whole-object-discard convention extends to these two new
// fields: BOTH are now required keys (their value may legitimately be `null`, but the key must be
// present with the right shape) — a blob missing them entirely (any v1 blob, or anything else that
// predates this schema) is invalid v2 shape and is discarded ENTIRELY, exactly like an invalid
// `selectedRole`/`selectedSeniority` already is. There is nothing safe to partially-migrate from a
// v1 blob (per the SPEC), so no fallback path ever reads a v1-shaped object as partially valid v2
// data.
//
// Everything below this comment through the original describe blocks is the SAME v1-era behavior,
// just pointed at the new v2 key/shape (a schema bump touches every existing call site by
// definition) — genuinely EXPECTED to go newly red today, alongside the new v2-specific describe
// blocks at the bottom, until Redwood lands the v2 bump. Nothing here is being "fixed" by loosening
// an assertion to dodge that red.

const STORAGE_KEY = 'lookingglass:v2:state'
const LEGACY_V1_STORAGE_KEY = 'lookingglass:v1:state'

function seed(value: unknown, key: string = STORAGE_KEY) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function validState(
  overrides: Partial<{
    resumeText: string
    selectedRole: string
    selectedSeniority: string
    confirmedSkillKeys: string[] | null
    confirmedFingerprint: { resumeText: string; role: string } | null
  }> = {},
) {
  return {
    resumeText: 'I know PostgreSQL and React.',
    selectedRole: 'Backend',
    selectedSeniority: 'mid',
    confirmedSkillKeys: null,
    confirmedFingerprint: null,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('savePersistedState / loadPersistedState — round trip (v2 shape, confirmedSkillKeys unset)', () => {
  it('round-trips resumeText, selectedRole, and selectedSeniority verbatim, with confirmedSkillKeys/confirmedFingerprint both null', () => {
    savePersistedState({
      resumeText: 'Built services with PostgreSQL and gRPC.',
      selectedRole: 'Backend',
      selectedSeniority: 'senior',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    const loaded = loadPersistedState()
    expect(loaded).toEqual({
      resumeText: 'Built services with PostgreSQL and gRPC.',
      selectedRole: 'Backend',
      selectedSeniority: 'senior',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })
  })

  it('round-trips an empty selectedSeniority ("") as a valid value, not treated as missing', () => {
    savePersistedState({
      resumeText: 'Some resume text',
      selectedRole: 'Frontend',
      selectedSeniority: '',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    const loaded = loadPersistedState()
    expect(loaded).toEqual({
      resumeText: 'Some resume text',
      selectedRole: 'Frontend',
      selectedSeniority: '',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })
  })

  it('writes under the versioned key "lookingglass:v2:state" (bumped from v1 by spec 038b)', () => {
    savePersistedState({
      resumeText: 'x',
      selectedRole: 'Backend',
      selectedSeniority: 'entry',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })

    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw, 'expected a blob under "lookingglass:v2:state" — the v1 key must no longer be written').not.toBeNull()
    expect(JSON.parse(raw!)).toMatchObject({
      resumeText: 'x',
      selectedRole: 'Backend',
      selectedSeniority: 'entry',
    })

    // The old v1 key must NOT also be written — this is a bump, not an additional/duplicate write.
    expect(window.localStorage.getItem(LEGACY_V1_STORAGE_KEY)).toBeNull()
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

  it('returns null on a version-tag mismatch (a hypothetical future/foreign schema under a key this version does not recognize)', () => {
    // Mirrors the pre-038b test's intent (a schema under a key this version doesn't read must never
    // be interpreted), just with the labels swapped now that v2 is the current schema: this seeds a
    // foreign key this version has no reason to read, and loadPersistedState (now v2-based) must
    // still return null rather than reaching for it.
    window.localStorage.setItem('lookingglass:v3:state', JSON.stringify(validState()))

    expect(loadPersistedState()).toBeNull()
  })

  it('discards the WHOLE blob when selectedRole is not a member of ROLES', () => {
    seed(validState({ selectedRole: 'Astronaut' }))

    expect(loadPersistedState()).toBeNull()
  })

  it('accepts an empty-string selectedRole alongside otherwise-valid fields ("no role chosen yet" is legitimate, not discarded)', () => {
    seed(validState({ selectedRole: '' }))

    expect(loadPersistedState()).toEqual({
      resumeText: 'I know PostgreSQL and React.',
      selectedRole: '',
      selectedSeniority: 'mid',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
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
      JSON.stringify({
        selectedRole: 'Backend',
        selectedSeniority: 'mid',
        confirmedSkillKeys: null,
        confirmedFingerprint: null,
      }),
    )
    expect(loadPersistedState()).toBeNull()

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        resumeText: 123,
        selectedRole: 'Backend',
        selectedSeniority: 'mid',
        confirmedSkillKeys: null,
        confirmedFingerprint: null,
      }),
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
      savePersistedState({
        resumeText: 'x',
        selectedRole: 'Backend',
        selectedSeniority: '',
        confirmedSkillKeys: null,
        confirmedFingerprint: null,
      }),
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
    savePersistedState({
      resumeText: 'x',
      selectedRole: 'Backend',
      selectedSeniority: 'mid',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })
    expect(loadPersistedState()).not.toBeNull()

    clearPersistedState()

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadPersistedState()).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------
// RED phase (spec 038b) — v2-specific behavior: confirmedSkillKeys/confirmedFingerprint round-trip,
// fingerprint-mismatch discard (fail-open to fresh confirmation, never silently reapplied), and
// stale-v1-blob discard. None of this exists in `localPersistence.ts` yet (it is still on v1's
// 3-field shape with no such fields at all), so every test in this section is expected to fail —
// either as a "confirmedSkillKeys not present on returned object" mismatch, or (for the v1-key test)
// as a false green that would only occur if a migration path wrongly starts reading the legacy key.
// ---------------------------------------------------------------------------------------------
describe('confirmedSkillKeys / confirmedFingerprint — v2 round trip (spec 038b)', () => {
  it('round-trips confirmedSkillKeys and a matching confirmedFingerprint verbatim via the public save/load API', () => {
    savePersistedState({
      resumeText: 'Built services with PostgreSQL and gRPC.',
      selectedRole: 'Backend',
      selectedSeniority: 'senior',
      confirmedSkillKeys: ['postgresql', 'grpc'],
      confirmedFingerprint: {
        resumeText: 'Built services with PostgreSQL and gRPC.',
        role: 'Backend',
      },
    })

    const loaded = loadPersistedState()
    expect(loaded).toEqual({
      resumeText: 'Built services with PostgreSQL and gRPC.',
      selectedRole: 'Backend',
      selectedSeniority: 'senior',
      confirmedSkillKeys: ['postgresql', 'grpc'],
      confirmedFingerprint: {
        resumeText: 'Built services with PostgreSQL and gRPC.',
        role: 'Backend',
      },
    })
  })

  it('round-trips an empty confirmedSkillKeys array (every vocabulary skill unconfirmed) distinctly from null', () => {
    savePersistedState({
      resumeText: 'Some resume text',
      selectedRole: 'Frontend',
      selectedSeniority: '',
      confirmedSkillKeys: [],
      confirmedFingerprint: { resumeText: 'Some resume text', role: 'Frontend' },
    })

    const loaded = loadPersistedState()
    expect(loaded?.confirmedSkillKeys).toEqual([])
    expect(loaded?.confirmedSkillKeys).not.toBeNull()
  })
})

describe('confirmedFingerprint mismatch — fail-open to fresh confirmation (spec 038b)', () => {
  it('discards ONLY confirmedSkillKeys/confirmedFingerprint (not the whole blob) when the fingerprint resumeText differs from the blob\'s current resumeText', () => {
    // Simulates: user confirmed against "Old resume text.", then edited the textarea to "New resume
    // text." without re-confirming — App.tsx's existing per-keystroke persist effect (spec 034)
    // re-saves resumeText on every change, but confirmedFingerprint is only ever updated by a fresh
    // confirmSkills() call, so it stays frozen at the stale snapshot inside this same blob.
    seed(
      validState({
        resumeText: 'New resume text.',
        confirmedSkillKeys: ['postgresql'],
        confirmedFingerprint: { resumeText: 'Old resume text.', role: 'Backend' },
      }),
    )

    const loaded = loadPersistedState()
    expect(
      loaded,
      'a stale confirmedFingerprint must never silently discard resumeText/selectedRole/selectedSeniority too — only the confirmed set falls back to needing fresh confirmation',
    ).toEqual({
      resumeText: 'New resume text.',
      selectedRole: 'Backend',
      selectedSeniority: 'mid',
      confirmedSkillKeys: null,
      confirmedFingerprint: null,
    })
  })

  it('discards confirmedSkillKeys when the fingerprint role differs from the blob\'s current selectedRole (role switched after confirming)', () => {
    seed(
      validState({
        resumeText: 'I know PostgreSQL and React.',
        selectedRole: 'Frontend',
        confirmedSkillKeys: ['postgresql'],
        confirmedFingerprint: { resumeText: 'I know PostgreSQL and React.', role: 'Backend' },
      }),
    )

    const loaded = loadPersistedState()
    expect(loaded?.selectedRole).toBe('Frontend')
    expect(
      loaded?.confirmedSkillKeys,
      'confirmedSkillKeys confirmed against "Backend" must never be silently reapplied once the role has changed to "Frontend"',
    ).toBeNull()
    expect(loaded?.confirmedFingerprint).toBeNull()
  })

  it('preserves confirmedSkillKeys when the fingerprint matches the blob\'s own resumeText AND selectedRole exactly', () => {
    seed(
      validState({
        resumeText: 'I know PostgreSQL and React.',
        selectedRole: 'Backend',
        confirmedSkillKeys: ['postgresql', 'react'],
        confirmedFingerprint: { resumeText: 'I know PostgreSQL and React.', role: 'Backend' },
      }),
    )

    const loaded = loadPersistedState()
    expect(loaded?.confirmedSkillKeys).toEqual(['postgresql', 'react'])
    expect(loaded?.confirmedFingerprint).toEqual({
      resumeText: 'I know PostgreSQL and React.',
      role: 'Backend',
    })
  })
})

describe('stale v1 blob discard — nothing is safe to migrate (spec 038b)', () => {
  it('a genuine pre-038b v1 blob, still sitting under "lookingglass:v1:state", is never read by v2\'s loadPersistedState', () => {
    // The exact shape v1 (specs/034) wrote — no confirmedSkillKeys/confirmedFingerprint fields
    // exist in this shape at all, because that schema predates the concept entirely.
    window.localStorage.setItem(
      LEGACY_V1_STORAGE_KEY,
      JSON.stringify({
        resumeText: 'A resume saved before 038b shipped.',
        selectedRole: 'Backend',
        selectedSeniority: 'mid',
      }),
    )

    expect(
      loadPersistedState(),
      'loadPersistedState must read only "lookingglass:v2:state" — a v1 blob under the old key must never be found, migrated, or partially interpreted',
    ).toBeNull()
  })

  it('a v1-shaped object (missing confirmedSkillKeys/confirmedFingerprint entirely) found under the v2 key is discarded ENTIRELY, not just missing-fields-defaulted', () => {
    // Defense in depth: even if a v1-shaped blob somehow ended up under the NEW v2 key (a bug, a
    // race, a manually-edited devtools value), it must be treated exactly like any other
    // unrecognized/invalid schema — the whole blob discarded, never partially accepted with
    // confirmedSkillKeys silently defaulted to null. This is what makes it correct to also discard a
    // genuine v1 blob "entirely" rather than salvaging its otherwise-valid resumeText/selectedRole.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        resumeText: 'A resume saved before 038b shipped.',
        selectedRole: 'Backend',
        selectedSeniority: 'mid',
        // confirmedSkillKeys / confirmedFingerprint deliberately absent.
      }),
    )

    expect(loadPersistedState()).toBeNull()
  })
})
