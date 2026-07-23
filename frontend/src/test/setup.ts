import '@testing-library/jest-dom/vitest'
import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
// jest-axe ships no bundled type declarations and none are in the approved dependency list.
// @ts-expect-error jest-axe has no type declarations
import { toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

// Register Testing Library's per-test unmount globally so successive render()
// calls don't accumulate in document.body across tests.
afterEach(() => {
  cleanup()
})
