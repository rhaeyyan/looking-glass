import { expect, test, type Page, type Route } from '@playwright/test'
import {
  gotoRenderedLeverageTable,
  reportsHover,
  STUB_RESUME,
  type StubRoleSkillRow,
} from './support/app'

/**
 * specs/036-compare-roles.md — RED-phase oracle. Nothing in this file's assumptions is implemented
 * yet: `App.tsx` has no `compareMode` state, no `roleSlots` array, no `.compare-grid`, no "Compare
 * roles" toggle, no "+ Compare a third role" control, and `RoleResultsPanel`/`FilterStatusBar` take
 * no `compareMode`/`roleName` props. Every assertion below is expected to fail today, and should
 * fail because the referenced control/DOM/aria-label does not exist — not because of a locator
 * mistake in this file.
 *
 * Naming assumptions this oracle bakes in (none of these strings are literally quoted by the SPEC,
 * so they are Cypress's best-effort, spec-consistent guesses; if Redwood/Magnolia land the feature
 * under different wording, adjust these two locators, not the assertions' intent):
 *   - The toggle's accessible name is exactly "Compare roles" (quoted verbatim in the SPEC prose).
 *   - Each active slot's role `<select>` keeps the same "Target role" accessible name as slot 0's
 *     existing `<label htmlFor="role-picker">Target role</label>` — the SPEC only requires
 *     qualifying `role="status"`/`role="alert"` elements and landmarks, never the picker's own
 *     label, so slots are told apart by DOM order (`nth(i)`), not by distinct label text.
 *
 * Strings taken directly from the SPEC (not guesses):
 *   - "+ Compare a third role" (quoted verbatim, bullet 1 / Inputs-Outputs bullet 2).
 *   - `.compare-grid` (quoted verbatim, Inputs/Outputs bullet 4/10).
 *   - `` `${roleSlots[i]} comparison column` `` region label (quoted verbatim, bullet 15).
 *   - `` `Skill filter status — ${roleName}` `` / `` `Loading skill profile — ${roleSlots[i]}` ``
 *     (quoted verbatim, bullets 12/13/14/22).
 *
 * Verification Oracle (per spec 036): this file @ desktop-light, @ desktop-dark, @ mobile-touch-light.
 */

const ROLE_A = 'Backend'
const ROLE_B = 'Data Engineer'
const ROLE_C = 'Security'

const ALPHA_SKILL = 'alpha-only-skill'
const BRAVO_SKILL = 'bravo-only-skill'
const CHARLIE_SKILL = 'charlie-only-skill'

interface RoleFixture {
  role: string
  rows: StubRoleSkillRow[]
  delayMs?: number
}

function makeRow(role: string, skill: string): StubRoleSkillRow {
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
 * Extends `stubRoleSkillProfile`'s technique (support/app.ts) to serve *different* fixture rows —
 * and an optional artificial per-role delay — depending on which role the app's `.eq('role_family',
 * role)` query actually asked for. PostgREST encodes that filter as a `role_family=eq.<role>` query
 * param, so the fixture is selected by decoding it back out of the intercepted request URL, never
 * by request order (multiple slots can be in flight concurrently).
 */
async function stubMultiRoleProfile(page: Page, fixtures: RoleFixture[]): Promise<void> {
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

function compareToggle(page: Page) {
  return page.getByLabel('Compare roles')
}

async function enableCompareMode(page: Page): Promise<void> {
  await compareToggle(page).click()
}

/** Slot `i`'s own "Target role" picker, told apart by DOM order (see file-level naming note). */
function targetRoleSelect(page: Page, slot: number) {
  return page.getByLabel('Target role').nth(slot)
}

/** The SPEC's per-slot landmark, `<section aria-label="${role} comparison column">`. */
function comparisonColumn(page: Page, role: string) {
  return page.getByRole('region', { name: `${role} comparison column` })
}

/**
 * "Does this skill appear in this panel's results", scoped to exactly one element per skill per
 * panel. A bare `getByText(skill)` is ambiguous by construction: `SkillLeverageTable.tsx` renders
 * every skill name in up to 5 places at once within one panel once it has an unmatched gap skill —
 * the "Start here: …" summary tag, `TopGapNarration`'s heading, its list-item span, `SkillMatrix`'s
 * always-visible point label, and `SkillLeverageTable`'s own `<th scope="row">` — a pre-existing
 * shape from specs 005/021/033, not something spec 036 introduced (confirmed: Magnolia reproduced
 * the identical 5-element match count in plain, non-compare single-panel mode with the same
 * one-row fixture). `SkillLeverageTable`'s row header (`<th scope="row" className="lev-skill">`,
 * accessible role `rowheader`) is the one place a skill name renders exactly once per row, so it is
 * the unambiguous proof "this skill is in this panel's results".
 */
function skillRowheader(container: ReturnType<typeof comparisonColumn>, skill: string) {
  return container.getByRole('rowheader', { name: skill, exact: true })
}

test('the oracle reports the pointer capability its project name claims', async ({ page }, info) => {
  await page.goto('/')

  const expectsTouch = info.project.name.startsWith('mobile-touch')
  expect(
    await reportsHover(page),
    expectsTouch
      ? `Project "${info.project.name}" must report (hover: none) to be a valid oracle for touch behaviour.`
      : `Project "${info.project.name}" must report (hover: hover) to verify pointer affordances.`,
  ).toBe(!expectsTouch)
})

test.describe('Compare mode layout (spec 036, oracle item 1)', () => {
  test('toggling "Compare roles" on renders exactly 2 panel-level containers', async ({ page }) => {
    await page.goto('/')

    await expect(
      compareToggle(page),
      'expected a "Compare roles" toggle on Step 1 — App.tsx renders no such control today',
    ).toBeVisible({ timeout: 5_000 })

    await enableCompareMode(page)

    await expect(
      page.locator('.compare-grid > *'),
      'expected exactly 2 direct children of .compare-grid once Compare roles is toggled on — ' +
        '.compare-grid does not exist anywhere in App.tsx today',
    ).toHaveCount(2, { timeout: 5_000 })
  })

  test('"+ Compare a third role" adds a 3rd panel-level container', async ({ page }) => {
    await page.goto('/')
    await enableCompareMode(page)
    await expect(page.locator('.compare-grid > *')).toHaveCount(2, { timeout: 5_000 })

    const addThird = page.getByRole('button', { name: '+ Compare a third role' })
    await expect(
      addThird,
      'expected a "+ Compare a third role" control once compare mode is on — it does not exist today',
    ).toBeVisible({ timeout: 5_000 })
    await addThird.click()

    await expect(
      page.locator('.compare-grid > *'),
      'clicking "+ Compare a third role" did not bring the panel-level container count to 3',
    ).toHaveCount(3, { timeout: 5_000 })
  })

  test('the 2 active slots lay out side by side on desktop / stacked on mobile', async ({ page }, info) => {
    await page.goto('/')
    await enableCompareMode(page)
    await expect(page.locator('.compare-grid > *')).toHaveCount(2, { timeout: 5_000 })

    const boxes = await page
      .locator('.compare-grid > *')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    const [first, second] = boxes as Array<{ x: number; y: number; width: number; height: number }>

    expect(first.width, 'first compare-grid child has zero width — not really rendered').toBeGreaterThan(0)
    expect(first.height, 'first compare-grid child has zero height — not really rendered').toBeGreaterThan(0)

    const isMobile = info.project.name.startsWith('mobile-touch')
    if (isMobile) {
      expect(
        second.y,
        'expected the second slot to sit below the first (stacked) on a mobile viewport',
      ).toBeGreaterThanOrEqual(first.y + first.height - 2)
      expect(
        Math.abs(second.x - first.x),
        'expected both stacked slots to share (roughly) the same left edge on a mobile viewport',
      ).toBeLessThan(4)
    } else {
      expect(
        second.x,
        'expected the second slot to sit to the right of the first (side by side) on desktop',
      ).toBeGreaterThanOrEqual(first.x + first.width - 2)
      expect(
        Math.abs(second.y - first.y),
        'expected both side-by-side slots to share (roughly) the same top edge on desktop',
      ).toBeLessThan(4)
    }
  })
})

test.describe('Data isolation across slots (spec 036, oracle item 2)', () => {
  test('a rapid re-pick of slot 1 settles on the new role only — never argument-mutation leakage', async ({
    page,
  }) => {
    // Role B resolves slowly; role C resolves immediately, so re-picking slot 1 to C races B's
    // still-in-flight response. If App.tsx wires the picker's onChange to only setRoleSlots(...)
    // without also calling panels[1].loadRole(...) (the exact API-mismatch bug this SPEC's Inputs/
    // Outputs bullet 7 calls out), slot 1 never fetches B or C at all and stays on whatever it was
    // seeded with. If it's wired but the generation guard were ever missing, slot 1 could flash B's
    // stale data after settling on C. Both are wrong; only "settles on C, never shows B" is right.
    await stubMultiRoleProfile(page, [
      { role: ROLE_A, rows: [makeRow(ROLE_A, ALPHA_SKILL)] },
      { role: ROLE_B, rows: [makeRow(ROLE_B, BRAVO_SKILL)], delayMs: 1_200 },
      { role: ROLE_C, rows: [makeRow(ROLE_C, CHARLIE_SKILL)] },
    ])
    await page.goto('/')
    await enableCompareMode(page)

    await targetRoleSelect(page, 0).selectOption(ROLE_A)
    await targetRoleSelect(page, 1).selectOption(ROLE_B)

    await page.getByLabel('Resume text').fill(STUB_RESUME)
    await page.getByRole('button', { name: 'Find my gaps' }).click()

    // Re-pick slot 1 to C well before B's 1200ms delay can plausibly have resolved.
    await targetRoleSelect(page, 1).selectOption(ROLE_C)

    // Slot 0 must settle on role A's own data.
    await expect(
      comparisonColumn(page, ROLE_A),
      `expected a landmark region named "${ROLE_A} comparison column" once slot 0 settles — ` +
        'no such landmark exists in App.tsx today',
    ).toBeVisible({ timeout: 5_000 })
    await expect(skillRowheader(comparisonColumn(page, ROLE_A), ALPHA_SKILL)).toBeVisible({
      timeout: 5_000,
    })

    // Slot 1 must settle on role C's own data — never B's.
    await expect(
      comparisonColumn(page, ROLE_C),
      `expected slot 1 to settle on a landmark region named "${ROLE_C} comparison column" after ` +
        'the rapid re-pick — no such landmark exists in App.tsx today',
    ).toBeVisible({ timeout: 5_000 })
    await expect(skillRowheader(comparisonColumn(page, ROLE_C), CHARLIE_SKILL)).toBeVisible({
      timeout: 5_000,
    })

    // Wait comfortably past B's delay window, so a late B response has had every chance to clobber
    // slot 1 if the per-instance request-generation guard were broken.
    await page.waitForTimeout(1_500)

    await expect(
      skillRowheader(comparisonColumn(page, ROLE_A), BRAVO_SKILL),
      `slot 0 (role "${ROLE_A}") rendered role B's marker skill "${BRAVO_SKILL}" — cross-slot leakage`,
    ).toHaveCount(0)
    await expect(
      skillRowheader(comparisonColumn(page, ROLE_A), CHARLIE_SKILL),
      `slot 0 (role "${ROLE_A}") rendered role C's marker skill "${CHARLIE_SKILL}" — cross-slot leakage`,
    ).toHaveCount(0)
    await expect(
      skillRowheader(comparisonColumn(page, ROLE_C), BRAVO_SKILL),
      `slot 1 rendered role B's stale marker skill "${BRAVO_SKILL}" after re-picking to role C — ` +
        "B's delayed response clobbered C's already-settled state",
    ).toHaveCount(0)
  })
})

test.describe('Accessible-name distinctness across slots (spec 036, oracle item 3)', () => {
  test('slot 0 / slot 1 filter-status names and landmarks are each independently findable', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: ROLE_A, rows: [makeRow(ROLE_A, ALPHA_SKILL)] },
      { role: ROLE_B, rows: [makeRow(ROLE_B, BRAVO_SKILL)] },
    ])
    await page.goto('/')
    await enableCompareMode(page)

    await targetRoleSelect(page, 0).selectOption(ROLE_A)
    await targetRoleSelect(page, 1).selectOption(ROLE_B)

    await expect(
      comparisonColumn(page, ROLE_A),
      `expected exactly 1 landmark region named "${ROLE_A} comparison column"`,
    ).toHaveCount(1, { timeout: 5_000 })
    await expect(
      comparisonColumn(page, ROLE_B),
      `expected exactly 1 landmark region named "${ROLE_B} comparison column"`,
    ).toHaveCount(1, { timeout: 5_000 })

    await expect(
      page.getByRole('status', { name: `Skill filter status — ${ROLE_A}` }),
      `expected exactly 1 status region named "Skill filter status — ${ROLE_A}" — ` +
        'FilterStatusBar takes no roleName prop today, so its aria-label is never qualified',
    ).toHaveCount(1)
    await expect(
      page.getByRole('status', { name: `Skill filter status — ${ROLE_B}` }),
      `expected exactly 1 status region named "Skill filter status — ${ROLE_B}"`,
    ).toHaveCount(1)
  })

  test('slot 1 announces a role-qualified loading label mid-flight', async ({ page }) => {
    await stubMultiRoleProfile(page, [
      { role: ROLE_A, rows: [makeRow(ROLE_A, ALPHA_SKILL)] },
      { role: ROLE_B, rows: [makeRow(ROLE_B, BRAVO_SKILL)], delayMs: 2_000 },
    ])
    await page.goto('/')
    await enableCompareMode(page)

    await targetRoleSelect(page, 0).selectOption(ROLE_A)
    await targetRoleSelect(page, 1).selectOption(ROLE_B)

    await expect(
      page.getByRole('status', { name: `Loading skill profile — ${ROLE_B}` }),
      `expected a "Loading skill profile — ${ROLE_B}" status while slot 1's fetch is in flight — ` +
        'App.tsx renders only the unqualified "Loading skill profile" text today, and only for a ' +
        'single slot',
    ).toBeVisible({ timeout: 1_000 })

    await expect(comparisonColumn(page, ROLE_B)).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Zero regression in default (non-compare) mode (spec 036, oracle item 4)', () => {
  test('the unsuffixed filter-status name still resolves exactly as today, with no compare DOM at all', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    await expect(
      page.getByRole('status', { name: 'Skill filter status' }),
      'expected exactly 1 unsuffixed "Skill filter status" region with compareMode off',
    ).toHaveCount(1)

    await expect(
      page.locator('.compare-grid'),
      'no .compare-grid wrapper should exist anywhere in the DOM when compare mode is off',
    ).toHaveCount(0)

    await expect(
      page.getByRole('region', { name: /comparison column$/ }),
      'no "<role> comparison column" landmark should exist anywhere in the DOM when compare mode is off',
    ).toHaveCount(0)

    // Guards against a false pass: the compare toggle itself must exist and default to unchecked,
    // not simply be absent for an unrelated reason (e.g. the whole Step 1 card failing to render).
    await expect(
      compareToggle(page),
      'expected the "Compare roles" toggle to exist (unchecked) even in default mode',
    ).not.toBeChecked()
  })
})
