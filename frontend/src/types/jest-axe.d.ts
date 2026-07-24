// Ambient declaration for `jest-axe` (spec 007). Runtime is jest-axe v9, which ships no bundled
// type declarations; `@types/jest-axe` on DefinitelyTyped only tracks the v3 API, so pulling it in
// would mistype the surface we actually call. Instead we hand-declare the narrow slice the test
// suite uses — the `axe()` call and the `toHaveNoViolations` matcher — against the real v9 API.
//
// This file MUST stay script-context (no top-level import/export): a top-level import would turn
// it into a module and demote `declare module 'jest-axe'` to a no-op augmentation of an untyped
// module. The vitest matcher augmentation (which does need module context) lives beside it in
// vitest-axe.d.ts.

declare module 'jest-axe' {
  // We never inspect the results object — it is only ever handed to the toHaveNoViolations
  // matcher — so an opaque interface is sufficient and honest (no speculative fields).
  export interface AxeResults {
    violations: unknown[]
  }

  /** Run axe-core against a rendered container. */
  export function axe(
    html: Element | Document | string,
    options?: Record<string, unknown>,
  ): Promise<AxeResults>

  /**
   * Matchers object registered via `expect.extend(toHaveNoViolations)`. Typed `any` on purpose:
   * it is opaque test-tooling glue, and this keeps `expect.extend`'s matcher-object contract
   * satisfied without re-deriving vitest's internal RawMatcherFn shape.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const toHaveNoViolations: any

  export function configureAxe(options?: Record<string, unknown>): typeof axe
}
