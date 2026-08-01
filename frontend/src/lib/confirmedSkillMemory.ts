import type { RoleSkillRow } from './supabaseClient'
import { normalizeSkillName } from './normalize'

// Session-only, cross-role, cross-panel accumulating record of which skill keys the user has
// explicitly confirmed as "have" (`true`) or "don't have" (`false`) this session. A key's
// ABSENCE means "never decided" — never a third enum value for "undecided".
//
// Key derivation everywhere in this module: `row.skill_key ?? normalizeSkillName(row.skill_name_raw)`
// — the SAME convention gap.ts/useRolePanel.ts/SkillConfirmationChecklist.tsx already use, never
// re-derived differently (spec 040a's Tipping Point note: this is the 4th independent copy).
export type ConfirmedSkillMemory = ReadonlyMap<string, boolean>

function keyOf(row: RoleSkillRow): string {
  return row.skill_key ?? normalizeSkillName(row.skill_name_raw)
}

// Returns a NEW map (never mutates `memory`) with every row in `rows` set to
// `checkedSkillKeys.has(key)` — i.e. records BOTH true and false decisions for the role's FULL
// vocabulary, not just the checked subset. Last-confirmed-wins: a key already present in
// `memory` is unconditionally overwritten with this call's value.
export function recordConfirmedDecisions(
  memory: ConfirmedSkillMemory,
  rows: RoleSkillRow[],
  checkedSkillKeys: ReadonlySet<string>,
): ConfirmedSkillMemory {
  const next = new Map(memory)
  for (const row of rows) {
    const key = keyOf(row)
    next.set(key, checkedSkillKeys.has(key))
  }
  return next
}

// True iff every row in `rows` has a key present in `memory` (regardless of true/false).
// Vacuously true for `rows = []`.
export function isRoleFullyCovered(memory: ConfirmedSkillMemory, rows: RoleSkillRow[]): boolean {
  return rows.every((row) => memory.has(keyOf(row)))
}

// The subset of `rows`' keys whose memory entry is exactly `true`. Used only once coverage is
// already confirmed full — a key with no memory entry at all must never reach this function's
// output silently as `false` (that is a distinct, unchecked-coverage case the caller is
// responsible for verifying via `isRoleFullyCovered` first).
export function deriveCheckedKeysFromMemory(
  memory: ConfirmedSkillMemory,
  rows: RoleSkillRow[],
): Set<string> {
  const result = new Set<string>()
  for (const row of rows) {
    const key = keyOf(row)
    if (memory.get(key) === true) {
      result.add(key)
    }
  }
  return result
}

// For each row: if `memory` has a decision for its key, use that decision (true → include,
// false → exclude) UNCONDITIONALLY — even if `autoDetectedKeys` also has that key. Only a key
// absent from `memory` falls back to `autoDetectedKeys.has(key)`. This is the exact mechanism
// that satisfies "an explicit prior 'don't have' must not be silently re-offered as
// auto-detected-checked" (Done-means #3).
export function mergeInitialCheckedKeys(
  memory: ConfirmedSkillMemory,
  rows: RoleSkillRow[],
  autoDetectedKeys: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>()
  for (const row of rows) {
    const key = keyOf(row)
    const decided = memory.get(key)
    const checked = decided !== undefined ? decided : autoDetectedKeys.has(key)
    if (checked) {
      result.add(key)
    }
  }
  return result
}
