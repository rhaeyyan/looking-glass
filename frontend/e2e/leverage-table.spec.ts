import { expect, test } from '@playwright/test'
import {
  backgroundColorOf,
  gotoRenderedLeverageTable,
  reportsHover,
  settleBackgroundTransition,
} from './support/app'

/**
 * Persistent regression oracle for the leverage table.
 *
 * Round 18 of this project root-caused the recurring "black box" on real phones: touch devices fire
 * a synthetic `:hover` on tap that never clears without a real `pointerleave`, sticking
 * `.leverage-table tbody tr:hover { background: var(--page-plane) }` on whichever row was last
 * touched. It read as a black rectangle in dark mode (`--page-plane` is `#0d0d0d`) and only in the
 * non-sticky columns, because the sticky Rank/Skill cells paint their own opaque background on top.
 *
 * The fix — wrapping that rule in `@media (hover: hover)` — was verified once, by hand, and then
 * existed nowhere but a ledger paragraph. This file is that verification made permanent.
 */

const TOUCH_PROJECTS = ['mobile-touch-dark', 'mobile-touch-light']
const ROW_UNDER_TEST = 'css3' // the row from the very first black-box report (round 16)
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

const rowSelector = (skill: string) => `table.leverage-table tbody tr:has(th:text-is("${skill}"))`

/**
 * Oracle self-check. This is the assertion whose absence cost four rounds: three reproduction
 * attempts ran in an environment that reported `(hover: hover)` and therefore *could not* produce
 * the bug, and their clean results were misread as "cannot reproduce". If a touch profile ever
 * stops reporting `(hover: none)`, every touch assertion below becomes vacuous — so fail loudly
 * here rather than pass quietly there.
 */
test('the oracle reports the pointer capability its project name claims', async ({ page }, info) => {
  await page.goto('/')

  const expectsTouch = TOUCH_PROJECTS.includes(info.project.name)
  expect(
    await reportsHover(page),
    expectsTouch
      ? `Project "${info.project.name}" must report (hover: none) to be a valid oracle for ` +
          'touch-only bugs. Check hasTouch/isMobile in playwright.config.ts.'
      : `Project "${info.project.name}" must report (hover: hover) to verify pointer affordances.`,
  ).toBe(!expectsTouch)
})

test.describe('stuck touch-:hover row highlight (round 18 regression)', () => {
  test('tapping a row leaves no lingering highlight on a touch device', async ({ page }, info) => {
    test.skip(!TOUCH_PROJECTS.includes(info.project.name), 'touch-only oracle')

    await gotoRenderedLeverageTable(page)
    const row = rowSelector(ROW_UNDER_TEST)

    expect(await backgroundColorOf(page, row)).toBe(TRANSPARENT)

    await page.locator(row).tap()
    await settleBackgroundTransition(page)

    // The bug: this row keeps `var(--page-plane)` forever, with no pointerleave coming to clear it.
    expect(
      await backgroundColorOf(page, row),
      `Row "${ROW_UNDER_TEST}" kept a background after tap — the stuck touch-:hover highlight is ` +
        'back. The `@media (hover: hover)` guard around `.leverage-table tbody tr:hover` in ' +
        'src/components/matrix/matrix.css is the fix.',
    ).toBe(TRANSPARENT)
  })

  test('tapping one row does not highlight any row in the table', async ({ page }, info) => {
    test.skip(!TOUCH_PROJECTS.includes(info.project.name), 'touch-only oracle')

    await gotoRenderedLeverageTable(page)
    await page.locator(rowSelector(ROW_UNDER_TEST)).tap()
    await settleBackgroundTransition(page)

    // Round 18's screenshot showed the artifact on *two* rows at once, so sweep the whole body
    // rather than only the row that was touched.
    const backgrounds = await page
      .locator('table.leverage-table tbody tr')
      .evaluateAll((rows) => rows.map((el) => getComputedStyle(el).backgroundColor))

    expect(backgrounds.length).toBeGreaterThan(1)
    expect(backgrounds.every((bg) => bg === TRANSPARENT)).toBe(true)
  })

  test('the hover affordance still works on a real pointer device', async ({ page }, info) => {
    test.skip(TOUCH_PROJECTS.includes(info.project.name), 'pointer-only oracle')

    await gotoRenderedLeverageTable(page)
    const row = rowSelector(ROW_UNDER_TEST)

    expect(await backgroundColorOf(page, row)).toBe(TRANSPARENT)

    await page.locator(row).hover()

    // Asserts "a highlight applies", not a specific colour: the token may be retuned, but the fix
    // must never have been a silent deletion of the affordance for mouse users. Polled, because the
    // background transitions in over 160ms — a bare read here samples the interpolation midway.
    await expect
      .poll(() => backgroundColorOf(page, row), {
        timeout: 2_000,
        message:
          'Hovering a row on a pointer device produced no highlight — the `@media (hover: hover)` ' +
          'guard has over-reached and removed the affordance instead of scoping it.',
      })
      .not.toBe(TRANSPARENT)
  })
})
