import { defineConfig, devices } from '@playwright/test'

/**
 * The **oracle harness**. Each `project` below is a named *verification oracle*: a reproduction
 * environment a `[SPEC]`'s `Verification Oracle` field can name by string, e.g.
 *
 *     - **Verification Oracle**: e2e/leverage-table.spec.ts @ mobile-touch-dark
 *
 * Why this file exists at all (AGENTS.md, "Environment parity before diagnosis"): rounds 12–18 of
 * this project burned four rounds and nine commits on a single stuck-`:hover`-on-touch bug because
 * every reproduction attempt was a throwaway script written cold, and three of them silently
 * omitted touch emulation — an environment that *cannot* trigger the bug. Profiles are declared
 * once, here, and named in the contract, so a reproduction environment is never re-guessed.
 *
 * Adding a profile is a deliberate act: it widens the vocabulary every future SPEC can draw on.
 * Prefer reusing a profile over inventing one.
 *
 * `PORT` is fixed and same-origin with the stubbed Supabase base URL below — see e2e/support/app.ts
 * for why that matters (no cross-origin preflight to intercept).
 */
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // The oracle is a correctness gate, not a smoke test: a flaky pass is a failed oracle.
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    /**
     * Touch-only phone. `devices['Pixel 7']` supplies `hasTouch: true` and `isMobile: true`, which
     * together make the browser report `(hover: none)` / `(pointer: coarse)` — the *only*
     * configuration in which a synthetic tap-`:hover` can stick. A default desktop context with a
     * small viewport looks identical in a screenshot and is useless as an oracle for touch bugs.
     */
    {
      name: 'mobile-touch-dark',
      use: { ...devices['Pixel 7'], colorScheme: 'dark' },
    },
    {
      name: 'mobile-touch-light',
      use: { ...devices['Pixel 7'], colorScheme: 'light' },
    },
    /** Real pointer device: `(hover: hover)`, so hover affordances must still work here. */
    {
      name: 'desktop-dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    /**
     * Dummy, non-secret credentials. `VITE_SUPABASE_URL` points at the dev server's *own* origin so
     * the Supabase REST call is same-origin and can be stubbed with a plain `page.route()`. No real
     * project URL, no real key, no network egress — the oracle stays hermetic and deterministic
     * (Zero-Trust: never put live credentials in an agent-run harness).
     */
    env: {
      VITE_SUPABASE_URL: BASE_URL,
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-real-credential',
    },
  },
})
