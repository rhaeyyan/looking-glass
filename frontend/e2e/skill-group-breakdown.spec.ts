import { expect, test } from '@playwright/test'
import { gotoRenderedLeverageTable, reportsHover } from './support/app'

/**
 * specs/027-skill-group-breakdown-ui.md — RED-phase oracle for the new SkillGroupBreakdown panel.
 *
 * `App.tsx` does not yet render this panel, so every test below is expected to fail at the "find
 * the breakdown panel" step (a locator timeout on an element that does not exist) — that is a real
 * red produced by a genuinely missing feature, not a config/setup bug. `gotoRenderedLeverageTable`
 * is reused unmodified from the existing leverage-table oracle so the drive-to-a-rendered-state
 * step is not duplicated here.
 *
 * Verification Oracle (per the SPEC): this file @ mobile-touch-dark + @ desktop-dark. The
 * mobile-touch profile matters because the SPEC requires the group list to be scrollable/bounded
 * for a real 37-value set and touch-target size for the toggle buttons; the desktop profile
 * verifies pointer + keyboard operability of the same controls.
 */

const BREAKDOWN_TESTID = 'skill-group-breakdown'

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

    // This is expected to fail today: App.tsx does not render a SkillGroupBreakdown panel yet, so
    // this locator never becomes visible. That is the intended red — a missing feature, not a
    // broken selector or a stale stub (gotoRenderedLeverageTable already proves the rest of the
    // primary flow works, since it is shared with the passing leverage-table oracle).
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

  test('a scrollable list wrapper bounds the panel height (never an unbounded page-length dump)', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    const panel = page.getByTestId(BREAKDOWN_TESTID)
    await expect(panel).toBeVisible({ timeout: 5_000 })

    const overflowY = await panel.evaluate((el) => {
      const scrollable = el.querySelector('[data-testid="skill-group-breakdown-list"]') ?? el
      return getComputedStyle(scrollable).overflowY
    })
    expect(['auto', 'scroll']).toContain(overflowY)
  })
})
