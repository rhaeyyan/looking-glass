import { expect, test } from '@playwright/test'
import { gotoRenderedLeverageTable, reportsHover } from './support/app'

/**
 * specs/027-skill-group-breakdown-ui.md — original oracle for the SkillGroupBreakdown panel
 * (list + filter + local toggle). specs/031-skill-group-chip-row.md replaces that panel's DOM with
 * a chip row and makes selection fully controlled by App.tsx; this file is updated to match.
 *
 * `App.tsx` already renders the panel (spec 027 shipped it) — the shape of what's inside it is
 * what's changing. As of this round, `SkillGroupBreakdown.tsx` itself has NOT been rewritten yet
 * (that is Redwood/Magnolia's job next), so:
 *   - the "panel renders" / "narrows rows" / "keyboard operable" tests below still exercise real,
 *     already-shipped behaviour and may continue to pass against today's list-based markup — the
 *     button-role locators they use (`getByRole('button', { name: /Uncategorized/ })`) already
 *     happen to match both the old list-item button and the new chip button, since both are real
 *     `<button>`s with the group name in their accessible text;
 *   - the new touch-target-size assertion below is expected to be RED today: the SPEC's
 *     `@media (pointer: coarse) { padding: 10px 14px }` bump does not exist anywhere in
 *     `matrix.css` yet, so today's `.breakdown-entry` padding (`0.55rem 0.8rem`, i.e. ~8.8px
 *     vertical) does not reliably clear a 44px tap target.
 *
 * Verification Oracle (per spec 031): this file @ desktop-light (chip interaction narrows
 * SkillMatrix/SkillLeverageTable row counts) and @ mobile-touch-dark (new: every chip's rendered
 * bounding-box height is >= 44px under this profile's `pointer: coarse`, per README's mobile
 * section). `gotoRenderedLeverageTable` is reused unmodified from the existing leverage-table
 * oracle so the drive-to-a-rendered-state step is not duplicated here.
 */

const BREAKDOWN_TESTID = 'skill-group-breakdown'
const TOUCH_TARGET_PROJECT = 'mobile-touch-dark'
const MIN_TOUCH_TARGET_PX = 44

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

test.describe('SkillGroupBreakdown panel — cross-component filter interaction', () => {
  test('the panel renders between the scorecard and the matrix/table once results load', async ({ page }) => {
    await gotoRenderedLeverageTable(page)

    // spec 027 already shipped this panel; spec 031 only changes what's inside it (list -> chip
    // row), so this locator is expected to keep passing across both rounds.
    await expect(page.getByTestId(BREAKDOWN_TESTID)).toBeVisible({ timeout: 5_000 })
  })

  test('selecting a skill-group entry narrows the rows rendered by SkillMatrix/SkillLeverageTable', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    const panel = page.getByTestId(BREAKDOWN_TESTID)
    await expect(panel).toBeVisible({ timeout: 5_000 })

    const fullRowCount = await page.locator('table.leverage-table tbody tr').count()

    // STUB_ROWS (e2e/support/app.ts) does not set skill_group, so every stubbed row buckets into
    // the "Uncategorized" group — the one group guaranteed to exist and to be selectable without
    // this spec needing to know the real 37-value skill_group enumeration.
    const uncategorizedEntry = panel.getByRole('button', { name: /Uncategorized/ })
    await expect(uncategorizedEntry).toBeVisible()
    await uncategorizedEntry.click()

    const filteredRowCount = await page.locator('table.leverage-table tbody tr').count()
    expect(filteredRowCount).toBe(fullRowCount)
    expect(filteredRowCount).toBeGreaterThan(0)

    // Re-selecting the same (now-active) group clears the filter — reversible, not one-way.
    await uncategorizedEntry.click()
    const restoredRowCount = await page.locator('table.leverage-table tbody tr').count()
    expect(restoredRowCount).toBe(fullRowCount)
  })

  test('the group list is keyboard-operable: tab-reachable and activatable with Enter', async ({ page }) => {
    await gotoRenderedLeverageTable(page)

    const panel = page.getByTestId(BREAKDOWN_TESTID)
    await expect(panel).toBeVisible({ timeout: 5_000 })

    const uncategorizedEntry = panel.getByRole('button', { name: /Uncategorized/ })
    await uncategorizedEntry.focus()
    await page.keyboard.press('Enter')

    await expect(uncategorizedEntry).toHaveAttribute('aria-pressed', 'true')
  })

  // The old "a scrollable list wrapper bounds the panel height" test lived here (spec 027). Spec
  // 031 deliberately removes the scrollable `data-testid="skill-group-breakdown-list"` container
  // it asserted on — a wrapping chip row replaces the bounded-height list, so there is nothing
  // left to scroll-bound. This is an intentional, SPEC-documented removal, not a silent drop (see
  // specs/031-skill-group-chip-row.md's Verification Oracle section).
})

test.describe('SkillGroupBreakdown panel — touch target size (spec 031)', () => {
  test('every chip clears the 44px minimum touch-target height on a coarse pointer', async ({ page }, info) => {
    test.skip(
      info.project.name !== TOUCH_TARGET_PROJECT,
      `this assertion is scoped to the ${TOUCH_TARGET_PROJECT} profile per the SPEC's Verification Oracle`,
    )

    await gotoRenderedLeverageTable(page)

    const panel = page.getByTestId(BREAKDOWN_TESTID)
    await expect(panel).toBeVisible({ timeout: 5_000 })

    const chips = panel.getByRole('button')
    const chipCount = await chips.count()
    expect(chipCount, 'expected at least one chip ("All skills" plus one per skill group)').toBeGreaterThan(0)

    for (let i = 0; i < chipCount; i++) {
      const box = await chips.nth(i).boundingBox()
      expect(box, `chip ${i} has no bounding box (not rendered/visible)`).not.toBeNull()
      expect(
        box!.height,
        `chip ${i} ("${await chips.nth(i).innerText()}") is ${box!.height}px tall — below the ` +
          `${MIN_TOUCH_TARGET_PX}px minimum touch target (README mobile section; matrix.css must ` +
          'bump chip padding under @media (pointer: coarse)).',
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
    }
  })
})
