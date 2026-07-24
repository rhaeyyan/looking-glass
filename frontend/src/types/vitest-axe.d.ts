// Types the `toHaveNoViolations` custom matcher on vitest's `expect` (spec 007), mirroring the
// `@testing-library/jest-dom/vitest` augmentation already in use. This file is module-context (the
// `import 'vitest'` is required) so `declare module 'vitest'` augments vitest's real types; the
// jest-axe module itself is declared separately in jest-axe.d.ts (which must stay script-context).
import 'vitest'

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown
  }
}
