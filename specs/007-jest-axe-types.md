# Spec 007 — jest-axe type shim (no new dependency)

> Authorized by Cedar (Workflow Rule 8 dependency decision), 2026-07-24. Routed after the UI
> redesign session surfaced the standing `jest-axe` `tsc` gap. **Decision: REJECT
> `@types/jest-axe`, use a local ambient `.d.ts` shim.**

## Decision rationale
`@types/jest-axe` latest on DefinitelyTyped is **3.5.9** (types the v3 API), but the installed
runtime `jest-axe` is **v9.0.0**. Wrong-major types would mistype the surface we call and risk
introducing *new* type errors — a bad trade. We consume only a tiny slice (the `axe()` call in 5
test files + the `toHaveNoViolations` matcher registered in `src/test/setup.ts`), so a hand-written
ambient declaration is smaller, correct against v9, and adds zero supply-chain surface (no lockfile
entry, no `npm audit` cycle). `tsconfig.json` uses `include: ["src"]`, so a `.d.ts` under `src/` is
picked up automatically — no config change. Default force: **Simplicity > Pattern purity**.

```markdown
[SPEC]
- **Objective**: Make `tsc --noEmit` clean by declaring the narrow `jest-axe` surface the test
  suite uses, via a local ambient declaration — NO new dependency. Remove the now-redundant
  `@ts-expect-error` in setup.ts. All 108 vitest tests stay green.
- **Inputs/Outputs**: New file `src/types/jest-axe.d.ts` declaring module `'jest-axe'` with only
  what we call: `axe(container, options?) => Promise<AxeResults>` (AxeResults opaque — never
  inspected), the `toHaveNoViolations` matchers object passed to `expect.extend`, plus a vitest
  `Assertion`/`AsymmetricMatchersContaining` augmentation so `.toHaveNoViolations()` is typed
  (removes TS2339). Mirror the existing `@testing-library/jest-dom/vitest` augmentation pattern.
- **Design Pattern**: none — simple case (ambient type shim).
- **Bounded-AI boundary**: N/A — build-tooling/types only, no runtime, no LLM, no scoring.
- **Intellectual Control**: Types are hand-written against the exact v9 API we invoke, so they
  can't drift to a wrong major the way `@types/jest-axe@3.x` would. Surface is 2 symbols; extend
  the shim in one place if we ever use more of jest-axe.
- **Constraints**: No new npm dependency. No change to `package.json`, `tsconfig.json`, or any
  product/`src` component code beyond the two files below. Do not widen `axe`'s return type with
  speculative fields we don't use.
- **Edge Cases**: The `@ts-expect-error` on setup.ts MUST be deleted — once the module is
  declared, an unused `@ts-expect-error` is itself a `tsc` error. Grep confirms only `axe()` +
  `toHaveNoViolations()` usage relied on the import being `any`.
- **Files** (2):
    - `src/types/jest-axe.d.ts` (new)
    - `src/test/setup.ts` (remove the comment + `@ts-expect-error`)
- **Tipping Point**: If we ever consume a substantial part of jest-axe's API (custom rule config,
  inspecting `results.violations` shape), OR `jest-axe` ships its own bundled types — retire the
  shim and reassess bundled/`@types` typings then.
```

```markdown
[FORCES]
1. Local control over correct-major types > convenience of a prebuilt (wrong-major) @types package
2. Simplicity > Pattern purity
```

## Acceptance criterion
`npx tsc --noEmit` clean (so `npm run build` passes), `@ts-expect-error` removed from
`src/test/setup.ts`, all 108 vitest tests green.
