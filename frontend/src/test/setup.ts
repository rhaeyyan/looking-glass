import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
// jest-axe ships no bundled type declarations and none are in the approved dependency list.
// @ts-expect-error jest-axe has no type declarations
import { toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)
