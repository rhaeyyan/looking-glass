[SPEC] 040a — Shared confirmed-skill memory: pure primitive module

- **Objective**: Add a new, dependency-free module owning the *type* and *pure functions* for a
  session-only, cross-role, cross-panel accumulating record of which skill keys the user has
  explicitly confirmed as "have" (`true`) or "don't have" (`false`) this session. This task adds
  zero wiring into `App.tsx` or `useRolePanel.ts` — it is a standalone, currently-uncalled module,
  exactly like spec 035's `gap.ts`/`normalize.ts` siblings, built and unit-tested in isolation
  before 040b consumes it.

- **Inputs/Outputs**:
  ```ts
  // frontend/src/lib/confirmedSkillMemory.ts
  import type { RoleSkillRow } from './supabaseClient'
  import { normalizeSkillName } from './normalize'

  // key = row.skill_key ?? normalizeSkillName(row.skill_name_raw) — the SAME key derivation
  // gap.ts/useRolePanel.ts/SkillConfirmationChecklist.tsx already use, never re-derived
  // differently. value: true = explicitly confirmed "have", false = explicitly confirmed
  // "don't have". A key's ABSENCE means "never decided" — never encode "undecided" as a third
  // enum value; absence IS the undecided state.
  export type ConfirmedSkillMemory = ReadonlyMap<string, boolean>

  // Returns a NEW map (never mutates `memory`) with every row in `rows` set to
  // `checkedSkillKeys.has(key)` — i.e. records BOTH true and false decisions for the role's FULL
  // vocabulary, not just the checked subset. Last-confirmed-wins: a key already present in
  // `memory` is unconditionally overwritten with this call's value (Edge Cases).
  export function recordConfirmedDecisions(
    memory: ConfirmedSkillMemory,
    rows: RoleSkillRow[],
    checkedSkillKeys: ReadonlySet<string>,
  ): ConfirmedSkillMemory

  // True iff every row in `rows` has a key present in `memory` (regardless of true/false).
  // Vacuously true for `rows = []` (Edge Cases).
  export function isRoleFullyCovered(memory: ConfirmedSkillMemory, rows: RoleSkillRow[]): boolean

  // The subset of `rows`' keys whose memory entry is exactly `true`. Used only once coverage is
  // already confirmed full — a key with no memory entry at all must never reach this function's
  // output silently as `false` (that is a distinct, unchecked-coverage case the caller is
  // responsible for verifying via `isRoleFullyCovered` first).
  export function deriveCheckedKeysFromMemory(
    memory: ConfirmedSkillMemory,
    rows: RoleSkillRow[],
  ): Set<string>

  // For each row: if `memory` has a decision for its key, use that decision (true → include,
  // false → exclude) UNCONDITIONALLY — even if `autoDetectedKeys` also has that key. Only a key
  // absent from `memory` falls back to `autoDetectedKeys.has(key)`. This is the exact mechanism
  // that satisfies "an explicit prior 'don't have' must not be silently re-offered as
  // auto-detected-checked" (Done-means #3).
  export function mergeInitialCheckedKeys(
    memory: ConfirmedSkillMemory,
    rows: RoleSkillRow[],
    autoDetectedKeys: ReadonlySet<string>,
  ): Set<string>
  ```

- **Design Pattern**: none — simple case. One accumulating key→boolean map and four pure
  query/update functions over it; no polymorphism, no family of interchangeable algorithms, no
  variance to encapsulate. A GoF pattern here (e.g. Memento for map snapshots) would add
  indirection with nothing to justify it.

- **Bounded-AI boundary**: Zero LLM. Pure, deterministic Set/Map bookkeeping — no score, gap, or
  join computation of any kind; `computeSkillGap`/`gap.ts` is never imported here and this module
  is never a second scoring path.

- **Verification Oracle**: `frontend/src/lib/confirmedSkillMemory.test.ts` (new, Cypress, red
  first) — a plain `vitest` unit suite (sibling to `gap.test.ts`/`useRolePanel.test.ts`), covering
  at minimum:
  - `recordConfirmedDecisions` writes `true` for checked keys and `false` for every OTHER row in
    `rows` (not just the ones toggled), returns a new `Map` instance (does not mutate the input),
    and — the multi-hop conflict case — a second call for a key already present in `memory`
    overwrites it (last-confirmed-wins: confirm `python=true` under role A, then confirm
    `python=false` under a later role whose vocabulary also contains `python`; assert the memory
    now reads `false`).
  - `isRoleFullyCovered` is `false` when any row's key is absent from `memory`, `true` when every
    key is present regardless of its true/false value, and vacuously `true` for `rows = []`.
  - `deriveCheckedKeysFromMemory` returns exactly the `true`-valued subset, excluding both
    `false`-valued keys and any row whose key happens to not be in `rows` at all.
  - `mergeInitialCheckedKeys`: (a) a key with no memory entry falls back to
    `autoDetectedKeys.has(key)`; (b) a key with a memory entry of `true` is included regardless of
    `autoDetectedKeys`; (c) **the core requirement-#3 case** — a key with a memory entry of
    `false` is EXCLUDED even when `autoDetectedKeys` also contains that key (simulating a
    re-extraction false-positive on a skill the user already explicitly said they don't have).
  - `skill_key ?? normalizeSkillName(skill_name_raw)` key derivation is exercised via a fixture
    row with `skill_key: null` (the D1-demand-only-row shape `gap.ts`/`SkillConfirmationChecklist`
    already handle), proving this module derives keys identically to its siblings.

- **Intellectual Control**: This module owns no React state and is imported, not extended, by
  040b/040c — `App.tsx` owns the single `useState` holding a `ConfirmedSkillMemory`, this module
  only supplies pure transformations over it. Isolating the bookkeeping here (rather than inside
  `useRolePanel.ts`) is what keeps spec 035/038a's per-instance isolation-by-construction guarantee
  intact: nothing in this file, or in `useRolePanel.ts`, changes — the shared piece is exactly the
  interview's named exception (the confirmed-key decision map) and nothing else.

- **Constraints**: No new dependency. Does not import `useRolePanel.ts`, `App.tsx`,
  `SkillConfirmationChecklist.tsx`, `computeSkillGap`/`gap.ts`, `narrate.ts`, `resumeSkills.ts`, or
  `localPersistence.ts` — this task adds a leaf module with a single import (`normalize.ts`) plus a
  type-only import (`RoleSkillRow` from `supabaseClient.ts`), consumed by nothing yet.

- **Edge Cases**: Empty `rows` → `isRoleFullyCovered` is vacuously `true` (an empty vocabulary is
  trivially "fully covered" by definition — the downstream consequence for a zero-skill role's
  pre-existing `rows.length > 0`-gated rendering is 040b's concern, not this module's). A key
  present in `rows` more than once (should not happen given `RoleSkillRow[]`'s real shape, but the
  functions must not throw) is handled by plain last-write-wins iteration order, same as any other
  duplicate map key. `recordConfirmedDecisions`/`mergeInitialCheckedKeys` never mutate their
  `memory`/`autoDetectedKeys` arguments — every returned collection is a fresh `Map`/`Set`.

- **Files**: `frontend/src/lib/confirmedSkillMemory.ts` (new, Redwood),
  `frontend/src/lib/confirmedSkillMemory.test.ts` (new, Cypress, red first).

- **Tipping Point**: This is the 4th independent copy of the
  `row.skill_key ?? normalizeSkillName(row.skill_name_raw)` idiom in this codebase (after
  `gap.ts`, `useRolePanel.ts`, `SkillConfirmationChecklist.tsx`). If a 5th independent copy ever
  appears, extract one shared `skillKeyOf(row)` helper into `normalize.ts` — that is Banyan's
  refactor to flag, not something this SPEC does pre-emptively (Simplicity > Pattern purity; no
  smell yet at 4).

```markdown
[FORCES]
1. A pure, uncalled primitive first, proven correct in isolation > wiring it into App.tsx before its own semantics (last-confirmed-wins, vacuous coverage) are pinned by a test
2. Reuse the existing skill_key derivation convention exactly > inventing a second key scheme
3. Simplicity > Pattern purity
```

**Sequencing note**: 040a lands before 040b (040b's `App.tsx` wiring imports 040a's exports) and
before 040c (same reason). No file overlap with 040b/040c — this task can be built and merged
completely independently of them.
