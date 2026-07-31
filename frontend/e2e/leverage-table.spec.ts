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

/**
 * `scrollable-region-focusable` (axe-core rule), found during spec 036's audit via a real-Chromium
 * axe-core spot-check. `.leverage-tablewrap` (matrix.css) has `overflow-x: auto` with no way for a
 * keyboard-only user (no mouse/trackpad) to reach and scroll it. jsdom never computes real layout
 * (`scrollWidth`/`clientWidth` are always 0 there), so this can only be genuinely verified in a real
 * browser — this file's own reason for existing (see the file-level comment above). Run across all
 * 4 profiles: the table genuinely overflows its wrapper at every one of this harness's default
 * viewport widths (measured directly: mobile-touch ~1030px content in a ~304px wrapper; desktop
 * ~1149px content in a ~776px wrapper), so every profile is a valid oracle for this fix, not just a
 * narrowed one.
 */
test.describe('leverage table scroll wrapper is keyboard-focusable (scrollable-region-focusable)', () => {
  test('the table genuinely overflows its scroll wrapper at this profile\'s viewport (oracle self-check — a passing focus assertion below proves nothing otherwise)', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)
    const wrap = page.locator('.leverage-tablewrap')

    const { scrollWidth, clientWidth } = await wrap.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(
      scrollWidth,
      'expected the leverage table to overflow its wrapper at this viewport — if it stops ' +
        'overflowing, the scrollable-region-focusable fix below is untested at this profile',
    ).toBeGreaterThan(clientWidth)
  })

  test('a keyboard-only user tabbing through the page lands on the scrollable region, and it is a properly-labeled ARIA region there (not just an accidentally-focusable div)', async ({
    page,
  }) => {
    // NOTE on why this checks role/aria-label, not just raw reachability: modern Chromium ships a
    // "focusable scrollers" heuristic that lets Tab reach ANY overflowing element even with no
    // tabIndex/role at all (verified empirically — reverting this task's SkillLeverageTable.tsx fix
    // and re-running this loop alone still reports the wrapper as reached). That heuristic is real
    // but insufficient: it gives no accessible name/role, which is what axe-core's
    // `scrollable-region-focusable` finding and screen-reader users actually need. So the assertion
    // that proves THIS fix is the explicit `role="region"` + `aria-label` on whatever Tab lands on,
    // not mere DOM focus.
    await gotoRenderedLeverageTable(page)
    const wrap = page.locator('.leverage-tablewrap')

    let reached = false
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press('Tab')
      reached = await wrap.evaluate((el) => el === document.activeElement)
    }
    expect(
      reached,
      'expected plain Tab-only keyboard navigation to eventually focus .leverage-tablewrap',
    ).toBe(true)

    const { role, label } = await wrap.evaluate((el) => ({
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label'),
    }))
    expect(
      role,
      'the element Tab lands on must be an explicit ARIA region (role="region"), not merely an ' +
        "accidentally-focusable scroller with no accessible role — Chromium's own focusable-scroller " +
        'heuristic does not supply this',
    ).toBe('region')
    expect(
      label,
      'the region must have its own aria-label distinct from the outer section heading',
    ).toMatch(/Scrollable table/)
  })

  test('once focused, the region has its own accessible name (role="region" + aria-label) and scrolls via the keyboard with no JS handler needed', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    const region = page.getByRole('region', { name: /Scrollable table/ })
    await region.focus()
    await expect(region).toBeFocused()

    const before = await region.evaluate((el) => el.scrollLeft)
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() => region.evaluate((el) => el.scrollLeft), {
        message:
          'expected scrollLeft to advance after ArrowRight on the focused, overflowing region — ' +
          'this is native browser behaviour for a focused block element and needs no keydown handler',
      })
      .toBeGreaterThan(before)
  })
})
