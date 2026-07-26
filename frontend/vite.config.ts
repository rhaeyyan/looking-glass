import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    /**
     * The two runners must not overlap. Vitest's default `include` matches `*.spec.ts`, which would
     * sweep up the Playwright oracle specs in `e2e/` and fail them at collection with "Playwright
     * Test did not expect test() to be called here" — a confusing failure that has nothing to do
     * with the code under test. `e2e/` belongs to `npm run e2e`; everything under `src/` belongs
     * here.
     */
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
