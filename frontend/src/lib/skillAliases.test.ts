import { describe, it, expect } from 'vitest'
import { normalizeSkillName } from './normalize'
// This module does not exist yet — that is the RED for spec 025 Task "Cypress": Redwood must
// author `ALIAS_TABLE: Record<string, string[]>` in frontend/src/lib/skillAliases.ts, keyed by
// normalizeSkillName(canonical), valued by an array of raw alias surface forms. Until then this
// entire file fails to even resolve its import.
import { ALIAS_TABLE } from './skillAliases'

// Spec 025, Edge Case 8 — alias-table structural invariants. These are real, independently
// meaningful assertions about the shape of ALIAS_TABLE itself, not just "the module exists":
//   - every key is already in normalizeSkillName's canonical output form (idempotent)
//   - no alias string is empty/whitespace-only
//   - no alias string is identical to its own canonical key (redundant entry)
//   - no two different canonical keys share the exact same alias string (ambiguous alias)

describe('ALIAS_TABLE structural invariants', () => {
  it('is a non-empty table', () => {
    expect(Object.keys(ALIAS_TABLE).length).toBeGreaterThan(0)
  })

  it('every key is already normalizeSkillName-idempotent (normalizing a key again is a no-op)', () => {
    for (const key of Object.keys(ALIAS_TABLE)) {
      expect(normalizeSkillName(key)).toBe(key)
    }
  })

  it('no alias string is empty or whitespace-only', () => {
    for (const [key, aliases] of Object.entries(ALIAS_TABLE)) {
      for (const alias of aliases) {
        expect(alias.trim().length, `alias for "${key}" must not be empty/whitespace`).toBeGreaterThan(0)
      }
    }
  })

  it('no alias string is identical to its own canonical key (redundant entry)', () => {
    for (const [key, aliases] of Object.entries(ALIAS_TABLE)) {
      for (const alias of aliases) {
        expect(
          normalizeSkillName(alias) === key,
          `alias "${alias}" for "${key}" is redundant with its own canonical key`,
        ).toBe(false)
      }
    }
  })

  it('no two different canonical keys share the exact same alias string (ambiguous alias)', () => {
    const ownerOf = new Map<string, string>()

    for (const [key, aliases] of Object.entries(ALIAS_TABLE)) {
      for (const alias of aliases) {
        const normalizedAlias = normalizeSkillName(alias)
        const existingOwner = ownerOf.get(normalizedAlias)

        expect(
          existingOwner === undefined || existingOwner === key,
          `alias "${alias}" is claimed by both "${existingOwner}" and "${key}"`,
        ).toBe(true)

        ownerOf.set(normalizedAlias, key)
      }
    }
  })
})
