import '@testing-library/jest-dom/vitest'
import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
// jest-axe ships no bundled type declarations; the narrow surface we use is typed locally in
// src/types/jest-axe.d.ts (spec 007), so no dependency and no @ts-expect-error is needed.
import { toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

// Register Testing Library's per-test unmount globally so successive render()
// calls don't accumulate in document.body across tests.
afterEach(() => {
  cleanup()
})
