import { describe, it, expect } from 'vitest'
import type { RoleSkillRow } from './supabaseClient'
import { normalizeSkillName } from './normalize'

// RED phase (spec 040a): `confirmedSkillMemory.ts` does not exist yet — Redwood builds it next to
// make these tests pass. This file locks the contract:
//
//   type ConfirmedSkillMemory = ReadonlyMap<string, boolean>
//   recordConfirmedDecisions(memory, rows, checkedSkillKeys) -> ConfirmedSkillMemory
//   isRoleFullyCovered(memory, rows) -> boolean
//   deriveCheckedKeysFromMemory(memory, rows) -> Set<string>
//   mergeInitialCheckedKeys(memory, rows, autoDetectedKeys) -> Set<string>
//
// Key derivation is `row.skill_key ?? normalizeSkillName(row.skill_name_raw)` — the SAME
// convention gap.ts/useRolePanel.ts/SkillConfirmationChecklist.tsx already use, never re-derived
// differently (spec 040a's Tipping Point note: this is the 4th independent copy of that idiom).
// A key's ABSENCE from `memory` means "never decided" — never a third enum value.
import {
  recordConfirmedDecisions,
  isRoleFullyCovered,
  deriveCheckedKeysFromMemory,
  mergeInitialCheckedKeys,
  type ConfirmedSkillMemory,
} from './confirmedSkillMemory'

function makeRow(role: string, skillName: string, overrides: Partial<RoleSkillRow> = {}): RoleSkillRow {
  return {
    role_family: role,
    skill_name_raw: skillName,
    skill_key: skillName.toLowerCase(),
    pct_of_role: 50,
    postings_with_skill: 100,
    demand_score: 50,
    scarcity_index: 50,
    arbitrage_score: 5,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 5,
    ...overrides,
  }
}

const PYTHON_ROW = makeRow('Backend', 'Python', { skill_key: 'python' })
const DOCKER_ROW = makeRow('Backend', 'Docker', { skill_key: 'docker' })
const SQL_ROW = makeRow('Backend', 'SQL', { skill_key: 'sql' })
const RUST_ROW = makeRow('Backend', 'Rust', { skill_key: 'rust' })

// Demand-only row shape (the same `skill_key: null` shape as gap.ts's GAP_MATCH_ROWS 'gRPC' row /
// SkillConfirmationChecklist's handling of it): key derivation must fall back to
// normalizeSkillName(skill_name_raw), never key by the raw name or by `null`.
const GRPC_ROW_NULL_KEY = makeRow('Backend', 'gRPC', { skill_key: null })

describe('confirmedSkillMemory — recordConfirmedDecisions', () => {
  it('writes true for checked keys and false for every OTHER row in rows, not just the toggled ones', () => {
    const memory: ConfirmedSkillMemory = new Map()
    const rows = [PYTHON_ROW, DOCKER_ROW, SQL_ROW]
    const checkedSkillKeys = new Set(['python'])

    const result = recordConfirmedDecisions(memory, rows, checkedSkillKeys)

    expect(result.get('python')).toBe(true)
    expect(result.get('docker')).toBe(false)
    expect(result.get('sql')).toBe(false)
  })

  it('returns a new Map instance, does not mutate the input memory, and carries prior entries forward', () => {
    const memory: ConfirmedSkillMemory = new Map([['docker', true]])
    const rows = [PYTHON_ROW]
    const checkedSkillKeys = new Set(['python'])

    const result = recordConfirmedDecisions(memory, rows, checkedSkillKeys)

    expect(result).not.toBe(memory)
    expect(result).toBeInstanceOf(Map)
    // The input memory is untouched: still only its original entry, no 'python' key added to it.
    expect(memory.size).toBe(1)
    expect(memory.has('python')).toBe(false)
    expect(memory.get('docker')).toBe(true)
    // This is an ACCUMULATING record (Objective): the new map carries the prior, untouched-by-this
    // -call entry forward alongside the newly-written one.
    expect(result.get('docker')).toBe(true)
    expect(result.get('python')).toBe(true)
  })

  it('last-confirmed-wins: a later call for the same key under a different role overwrites the prior decision', () => {
    // Confirm python=true under role A.
    const afterRoleA = recordConfirmedDecisions(new Map(), [PYTHON_ROW, DOCKER_ROW], new Set(['python']))
    expect(afterRoleA.get('python')).toBe(true)

    // Confirm under a later role B whose vocabulary also contains python — python is present in
    // this call's `rows` but NOT in this call's `checkedSkillKeys`, so it is written false,
    // unconditionally overwriting the prior `true`.
    const roleBPythonRow = makeRow('Data Engineer', 'Python', { skill_key: 'python' })
    const afterRoleB = recordConfirmedDecisions(afterRoleA, [roleBPythonRow, RUST_ROW], new Set())

    expect(afterRoleB.get('python')).toBe(false)
    // The prior call's own returned map is a separate, untouched snapshot (fresh Map each call).
    expect(afterRoleA.get('python')).toBe(true)
    // Docker, decided false under role A (it was in role A's `rows` but NOT in its
    // `checkedSkillKeys`), survives untouched into role B's result — role B's rows never mention
    // it, so it is neither re-decided nor dropped.
    expect(afterRoleB.get('docker')).toBe(false)
    expect(afterRoleB.get('rust')).toBe(false)
  })

  it('derives the key for a null-skill_key row via normalizeSkillName(skill_name_raw), same as gap.ts/useRolePanel.ts', () => {
    const result = recordConfirmedDecisions(
      new Map(),
      [GRPC_ROW_NULL_KEY],
      new Set([normalizeSkillName('gRPC')]),
    )

    expect(normalizeSkillName('gRPC')).toBe('grpc')
    expect(result.get('grpc')).toBe(true)
    // Never keyed by the raw, unnormalized name or literally by `null`.
    expect(result.has('gRPC')).toBe(false)
  })
})

describe('confirmedSkillMemory — isRoleFullyCovered', () => {
  it('is false when any row key is absent from memory', () => {
    const memory: ConfirmedSkillMemory = new Map([['python', true]])
    const rows = [PYTHON_ROW, DOCKER_ROW]

    expect(isRoleFullyCovered(memory, rows)).toBe(false)
  })

  it('is true when every row key is present in memory, regardless of true/false value', () => {
    const memory: ConfirmedSkillMemory = new Map([
      ['python', true],
      ['docker', false],
    ])
    const rows = [PYTHON_ROW, DOCKER_ROW]

    expect(isRoleFullyCovered(memory, rows)).toBe(true)
  })

  it('is vacuously true for an empty rows array, regardless of memory contents', () => {
    expect(isRoleFullyCovered(new Map(), [])).toBe(true)
    expect(isRoleFullyCovered(new Map([['python', true]]), [])).toBe(true)
  })

  it('derives the key for a null-skill_key row when checking coverage', () => {
    const covered = new Map([['grpc', false]])
    expect(isRoleFullyCovered(covered, [GRPC_ROW_NULL_KEY])).toBe(true)
    expect(isRoleFullyCovered(new Map(), [GRPC_ROW_NULL_KEY])).toBe(false)
  })
})

describe('confirmedSkillMemory — deriveCheckedKeysFromMemory', () => {
  it('returns exactly the true-valued subset, excluding false-valued keys and keys outside rows', () => {
    const memory: ConfirmedSkillMemory = new Map([
      ['python', true],
      ['docker', false],
      ['sql', true],
      // 'rust' is true in memory but NOT one of `rows` below — must not leak into the result.
      ['rust', true],
    ])
    const rows = [PYTHON_ROW, DOCKER_ROW, SQL_ROW]

    const result = deriveCheckedKeysFromMemory(memory, rows)

    expect(result).toEqual(new Set(['python', 'sql']))
    expect(result.has('docker')).toBe(false)
    expect(result.has('rust')).toBe(false)
  })
})

describe('confirmedSkillMemory — mergeInitialCheckedKeys', () => {
  it('falls back to autoDetectedKeys.has(key) for a key with no memory entry', () => {
    const memory: ConfirmedSkillMemory = new Map()
    const rows = [PYTHON_ROW, DOCKER_ROW]
    const autoDetectedKeys = new Set(['python'])

    const result = mergeInitialCheckedKeys(memory, rows, autoDetectedKeys)

    expect(result).toEqual(new Set(['python']))
  })

  it('includes a memory-true key regardless of autoDetectedKeys', () => {
    const memory: ConfirmedSkillMemory = new Map([['python', true]])
    const rows = [PYTHON_ROW]
    const autoDetectedKeys = new Set<string>() // auto-detection did NOT flag it this time

    const result = mergeInitialCheckedKeys(memory, rows, autoDetectedKeys)

    expect(result.has('python')).toBe(true)
  })

  it('CORE CASE (requirement #3): excludes a memory-false key even when autoDetectedKeys also contains it', () => {
    // Simulates a re-extraction false-positive on a skill the user already explicitly said they
    // don't have — the explicit "don't have" decision must win, never be silently re-offered as
    // checked.
    const memory: ConfirmedSkillMemory = new Map([['python', false]])
    const rows = [PYTHON_ROW]
    const autoDetectedKeys = new Set(['python'])

    const result = mergeInitialCheckedKeys(memory, rows, autoDetectedKeys)

    expect(result.has('python')).toBe(false)
  })

  it('combines all three rules correctly across a mixed row set in one call', () => {
    const memory: ConfirmedSkillMemory = new Map([
      ['python', false], // explicit don't-have -> excluded even though auto-detected
      ['sql', true], // explicit have -> included even though NOT auto-detected
    ])
    const rows = [PYTHON_ROW, SQL_ROW, DOCKER_ROW, RUST_ROW]
    // docker: no memory entry, auto-detected -> included
    // rust: no memory entry, not auto-detected -> excluded
    const autoDetectedKeys = new Set(['python', 'docker'])

    const result = mergeInitialCheckedKeys(memory, rows, autoDetectedKeys)

    expect(result).toEqual(new Set(['sql', 'docker']))
  })

  it('does not mutate memory or autoDetectedKeys, and returns a fresh Set', () => {
    const memory: ConfirmedSkillMemory = new Map([['python', true]])
    const autoDetectedKeys = new Set(['docker'])
    const rows = [PYTHON_ROW, DOCKER_ROW]

    const result = mergeInitialCheckedKeys(memory, rows, autoDetectedKeys)

    expect(result).not.toBe(autoDetectedKeys)
    expect(autoDetectedKeys).toEqual(new Set(['docker']))
    expect(memory.size).toBe(1)
  })

  it('derives the key for a null-skill_key row via normalizeSkillName(skill_name_raw) when merging', () => {
    const memory: ConfirmedSkillMemory = new Map()
    const autoDetectedKeys = new Set(['grpc'])

    const result = mergeInitialCheckedKeys(memory, [GRPC_ROW_NULL_KEY], autoDetectedKeys)

    expect(result.has('grpc')).toBe(true)
  })
})
