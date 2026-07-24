[SPEC]
- **Objective**: Widen the single-source-of-truth `ROLES` const from 6 to all 15 verbatim
  `role_family` strings that already exist unfiltered in `role_skill_arbitrage`, and update the
  two test files that currently hardcode "six roles" as a characterized invariant. No behavior
  change beyond the array's contents — the picker's `<select>` already renders via
  `ROLES.map(...)` (see `App.tsx` lines 185-197), so widening the array is the entire change;
  `App.tsx` itself needs zero edits.
- **Inputs/Outputs**: `ROLES: readonly string[]` (exported `as const` tuple) must equal, in any
  order that Cypress's test asserts, the union already locked in
  `tests/test_data_invariants.py`'s `ALL_15_ROLE_FAMILIES`:
  `Backend, Full Stack, Data Scientist / ML, Data Engineer, Software Engineer,
  DevOps / Cloud / SRE, Frontend, Data Analyst / BI, Mobile, Security, QA / Test,
  Business Analyst, Designer (UX/UI), Product Manager, Project / Program Mgr`.
  Every string must match `role_family` byte-for-byte (internal slash-spacing, parenthetical
  in "Designer (UX/UI)", capitalization) — no normalization step is introduced.
- **Design Pattern**: none — simple case. This is enum widening on an existing single-source-of-
  truth data file; no new abstraction is earned.
- **Bounded-AI boundary**: N/A. No LLM call, no scoring/ranking logic touched — `arbitrage_score`
  computation is already role-agnostic (confirmed: `role_skill_arbitrage` view has no role
  filter). This task only changes which role strings the frontend offers.
- **Intellectual Control**: `ROLES` remains the sole place a role string is typed anywhere in the
  frontend (picker options + the exact string sent in the Supabase `.eq('role_family', ...)`
  filter). Widening it here, and nowhere else, is why this task touches only 3 files.
- **Constraints**: Preserve the existing `as const` tuple + `export type Role = (typeof
  ROLES)[number]` pattern exactly. No new dependency. Do not reorder in a way that changes the
  picker's visual grouping unless Cedar explicitly specs a grouping (out of scope here — flat
  list, ship order matches the coverage tiers Strong→Moderate→Weak for readability, but this is a
  display nicety, not a requirement to test).
- **Edge Cases**: `App.test.tsx`'s existing assertion of exactly 7 `<option>` elements (placeholder
  + 6) is now WRONG and must become 16 (placeholder + 15); the existing per-role
  `getByRole('option', { name: role })` loop must extend to all 15 names. No other App.tsx
  behavior (loading/error/empty-state, resume-gap flow, narration) is affected — none of those
  code paths branch on which specific role was chosen.
- **Files**:
  - `frontend/src/lib/roles.ts`
  - `frontend/src/lib/roles.test.ts`
  - `frontend/src/App.test.tsx`
- **Tipping Point**: If a future role needs role-specific UI behavior (e.g., a coverage-tier
  badge, or role-specific copy), that's the trigger to introduce a `RoleMeta` record (role →
  tier) instead of a flat string tuple — not before.

[FORCES]
1. Data-invariant fidelity (match `role_family` byte-for-byte) > convenience formatting
2. Simplicity > Pattern purity
