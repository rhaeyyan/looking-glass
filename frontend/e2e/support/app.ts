import type { Page, Route } from '@playwright/test'

/**
 * Shared drive-the-app helpers for the oracle harness. Every spec goes through these so the
 * "get the app into a state where the bug is visible" step is written once, not per-round.
 */

/** Mirrors `RoleSkillRow` (src/lib/supabaseClient.ts) column for column. */
export interface StubRoleSkillRow {
  role_family: string
  skill_name_raw: string
  skill_key: string | null
  pct_of_role: number
  postings_with_skill: number
  demand_score: number | null
  scarcity_index: number | null
  arbitrage_score: number | null
  scarcity_data_completeness: string | null
  d3_corroborated: boolean | null
  d3_pct_of_all_postings: number | null
  salary_premium_pct?: number | null
  median_days_open?: number | null
}

export const STUB_ROLE = 'Frontend'

/**
 * Frozen stub of the `role_skill_arbitrage` view for `STUB_ROLE`. Hand-written, not sampled from
 * live data, so the oracle is deterministic — a UI regression must never be masked or invented by
 * data drift.
 *
 * Deliberately includes:
 *  - `react` — matched by the resume below, so at least one row renders "Already have"
 *  - `css3` — the row from the original round-16 black-box report; keep it
 *  - `next.js` / `responsive design` — the two rows from the round-18 screenshot
 *  - `webassembly` — a null-score row, which must still render flagged "demand only", never dropped
 */
export const STUB_ROWS: StubRoleSkillRow[] = [
  row('react', 62, 91.4, 78.2, 71.5, { corroborated: true, salary: 14.2, days: 31 }),
  row('typescript', 58, 88.1, 74.6, 65.7, { corroborated: true, salary: 12.8, days: 29 }),
  row('next.js', 41, 74.3, 69.9, 51.9, { corroborated: true, salary: 11.1, days: 27 }),
  row('css3', 37, 70.2, 44.3, 31.1, { corroborated: false, salary: 4.6, days: 22 }),
  row('redux', 24, 55.8, 48.1, 26.8, { corroborated: false, salary: 6.3, days: 25 }),
  row('responsive design', 19, 49.4, 38.7, 19.1, { corroborated: false, salary: 3.2, days: 20 }),
  // Null arbitrage/scarcity: the view's LEFT JOIN case. Must surface as "demand only".
  {
    role_family: STUB_ROLE,
    skill_name_raw: 'webassembly',
    skill_key: null,
    pct_of_role: 6,
    postings_with_skill: 600,
    demand_score: 22.5,
    scarcity_index: null,
    arbitrage_score: null,
    scarcity_data_completeness: 'demand_only',
    d3_corroborated: null,
    d3_pct_of_all_postings: null,
    salary_premium_pct: null,
    median_days_open: null,
  },
]

function row(
  skill: string,
  pctOfRole: number,
  demand: number,
  scarcity: number,
  arbitrage: number,
  extra: { corroborated: boolean; salary: number; days: number },
): StubRoleSkillRow {
  return {
    role_family: STUB_ROLE,
    skill_name_raw: skill,
    skill_key: skill,
    pct_of_role: pctOfRole,
    postings_with_skill: pctOfRole * 100,
    demand_score: demand,
    scarcity_index: scarcity,
    arbitrage_score: arbitrage,
    scarcity_data_completeness: 'complete',
    d3_corroborated: extra.corroborated,
    d3_pct_of_all_postings: extra.corroborated ? pctOfRole / 2 : null,
    salary_premium_pct: extra.salary,
    median_days_open: extra.days,
  }
}

/**
 * Resume text that makes `react`/`typescript` "Already have" and leaves the rest as gaps, so the
 * table renders a mix of both Status values.
 */
export const STUB_RESUME =
  'Frontend engineer. Built and shipped production interfaces with React and TypeScript ' +
  'across several teams. Comfortable owning component architecture and reviewing pull requests.'

/**
 * Stub the one deterministic read the app makes. Same-origin by construction (see
 * playwright.config.ts: `VITE_SUPABASE_URL` is the dev-server origin), so there is no CORS
 * preflight to intercept and no `Access-Control-Allow-Origin` juggling.
 */
export async function stubRoleSkillProfile(page: Page, rows = STUB_ROWS): Promise<void> {
  await page.route('**/rest/v1/role_skill_arbitrage**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    }),
  )
}

/**
 * Drive the full primary flow to a rendered leverage table: stub the read, pick the role, paste the
 * resume, submit, confirm the skill-confirmation checklist's pre-checked auto-detected set
 * unedited (spec 038b — panel 0 in single-panel/`compareMode === false` mode, the only mode this
 * helper's callers ever exercise, now stops at a checklist between submit and analyzed results
 * instead of computing the gap immediately). Resolves once the table is actually on screen, so
 * specs never race the render.
 */
export async function gotoRenderedLeverageTable(page: Page): Promise<void> {
  await stubRoleSkillProfile(page)
  await page.goto('/')

  await page.getByLabel('Target role').selectOption(STUB_ROLE)
  await page.getByLabel('Resume text').fill(STUB_RESUME)
  await page.getByRole('button', { name: 'Find my gaps' }).click()
  await page.getByRole('button', { name: 'Confirm skills' }).click()

  await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
}

/** Resolved `background-color` of an element, as the browser reports it. */
export function backgroundColorOf(page: Page, selector: string, nth = 0): Promise<string> {
  return page.locator(selector).nth(nth).evaluate((el) => getComputedStyle(el).backgroundColor)
}

/**
 * Row backgrounds animate: `matrix.css` sets `transition: background 160ms ease-out` on
 * `.leverage-table tbody tr` under `prefers-reduced-motion: no-preference`. A one-shot read taken
 * straight after a hover/tap therefore samples a *mid-interpolation* value (an alpha between 0 and
 * 1) — reading transparent proves nothing, and reading a colour proves nothing either.
 *
 * So: assert a background *appears* with a polling assertion, and assert one *never* appears only
 * after waiting past the transition. Never with a bare read.
 */
export const BACKGROUND_TRANSITION_MS = 160

/** Wait comfortably past the row-background transition, so "still transparent" is a real result. */
export function settleBackgroundTransition(page: Page): Promise<void> {
  return page.waitForTimeout(BACKGROUND_TRANSITION_MS * 4)
}

/** True when the browser reports a real pointer device — i.e. `:hover` affordances should apply. */
export function reportsHover(page: Page): Promise<boolean> {
  return page.evaluate(() => window.matchMedia('(hover: hover)').matches)
}

/**
 * Clicks the singular "Confirm skills" button on whichever skill-confirmation checklist is
 * currently on screen. Safe without any further scoping because exactly one checklist is ever
 * rendered app-wide at a time — single-panel mode (spec 038b) or compare-mode's sequential walk
 * (spec 038c) alike, both by construction (`confirmationSlot`/the single-panel branch each render
 * at most one `SkillConfirmationChecklist` at once). Callers still own waiting for whatever comes
 * next (a leverage table, the following slot's checklist, etc.) — this helper only performs the
 * click.
 */
export async function confirmSkillChecklist(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Confirm skills' }).click()
}

/**
 * A minimal fixture for one role's stubbed `role_skill_arbitrage` rows, keyed by `role`, with an
 * optional artificial per-role delay (used to test out-of-order/race handling across slots).
 * Promoted out of `compare-roles.spec.ts` (spec 036) unchanged, so `compare-confirmation.spec.ts`
 * (spec 038c) can build its own multi-role fixtures without re-pasting a near-duplicate stub.
 */
export interface RoleFixture {
  role: string
  rows: StubRoleSkillRow[]
  delayMs?: number
}

/** A single generic stub row for `role`/`skill` — used by tests that only care about a marker
 * skill's presence/absence, not the full realistic STUB_ROWS shape. Promoted from
 * `compare-roles.spec.ts` unchanged. */
export function makeRow(role: string, skill: string): StubRoleSkillRow {
  return {
    role_family: role,
    skill_name_raw: skill,
    skill_key: skill,
    pct_of_role: 40,
    postings_with_skill: 4000,
    demand_score: 60,
    scarcity_index: 50,
    arbitrage_score: 45,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 20,
    salary_premium_pct: 8,
    median_days_open: 25,
  }
}

/**
 * Extends `stubRoleSkillProfile`'s technique to serve *different* fixture rows — and an optional
 * artificial per-role delay — depending on which role the app's `.eq('role_family', role)` query
 * actually asked for. PostgREST encodes that filter as a `role_family=eq.<role>` query param, so
 * the fixture is selected by decoding it back out of the intercepted request URL, never by request
 * order (multiple slots can be in flight concurrently). Promoted from `compare-roles.spec.ts`
 * (spec 036) unchanged.
 */
export async function stubMultiRoleProfile(page: Page, fixtures: RoleFixture[]): Promise<void> {
  const byRole = new Map(fixtures.map((fixture) => [fixture.role, fixture]))
  await page.route('**/rest/v1/role_skill_arbitrage**', async (route: Route) => {
    const url = new URL(route.request().url())
    const eqParam = url.searchParams.get('role_family') ?? ''
    const role = eqParam.replace(/^eq\./, '')
    const fixture = byRole.get(role)

    if (fixture?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, fixture.delayMs))
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture?.rows ?? []),
    })
  })
}
