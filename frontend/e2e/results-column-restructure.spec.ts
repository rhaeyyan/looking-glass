import { expect, test, type Page } from '@playwright/test'
import { gotoRenderedLeverageTable, STUB_ROLE, STUB_ROWS } from './support/app'

/**
 * specs/033-results-column-two-card-shell.md — RED-phase capstone integration oracle.
 *
 * `App.tsx` today (pre-fix) renders the results column as four/five sibling sections directly
 * inside `.lg-results` once a resume has been analyzed: the `<header class="lg-results-head">`,
 * the `.lg-scorecard` donut/narration card, and a `<>` fragment holding `SkillGroupBreakdown`,
 * `SkillMatrix`, and `SkillLeverageTable` as three more independent direct children. This SPEC
 * collapses that into exactly two glass cards — Standing and Evidence — each one direct child of
 * `.lg-results`. `FilterStatusBar` is not wired into `App.tsx` at all yet (that is this task's
 * fix), and the role name renders today as a `<span class="tag tag-accent">`, not a heading.
 * Every assertion below is therefore expected to fail against today's shape, for the reasons
 * documented per-test — not because of a locator typo in this file.
 *
 * Runs across all four configured profiles (`desktop-light`, `desktop-dark`, `mobile-touch-dark`,
 * `mobile-touch-light`) by default — nothing here is touch- or theme-specific, so no
 * `test.skip`/project filtering is applied; `playwright.config.ts` fans this file out to all four
 * on a plain `npm run e2e`.
 */

const UNCATEGORIZED_CHIP_NAME = /Uncategorized/
const FILTER_STATUS_SELECTOR = '.filter-status-bar'
const N_OF_M_PATTERN = /show (\d+) of (\d+) skills/

/**
 * Delayed variant of `stubRoleSkillProfile` (support/app.ts): fulfils the same stubbed response,
 * but only after `delayMs`, so the loading state is observable for long enough to assert against
 * instead of resolving inside the same microtask the fetch was issued in.
 */
async function stubRoleSkillProfileWithDelay(page: Page, delayMs: number): Promise<void> {
  await page.route('**/rest/v1/role_skill_arbitrage**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_ROWS),
    })
  })
}

test.describe('Results column two-card shell (spec 033)', () => {
  test('.lg-results has exactly two direct card-level children once analyzed', async ({ page }) => {
    await gotoRenderedLeverageTable(page)

    // Today: header + .lg-scorecard + a 3-child fragment (SkillGroupBreakdown/SkillMatrix/
    // SkillLeverageTable) are all independent direct children of .lg-results — five, not two.
    await expect(
      page.locator('.lg-results > *'),
      'expected exactly two direct children of .lg-results (Standing + Evidence cards) once ' +
        'analyzed — today\'s App.tsx still renders the pre-collapse header/scorecard/fragment ' +
        'shape as separate siblings',
    ).toHaveCount(2)
  })

  test('the role name renders as a heading (not a chip) inside the Standing card', async ({ page }) => {
    await gotoRenderedLeverageTable(page)

    // Scoped to `.lg-results-head` (preserved verbatim per the SPEC's Intellectual Control, just
    // nested one level deeper inside the new Standing card) — not a bare page-wide search, which
    // would false-positive against `SkillLeverageTable`'s own unrelated, already-shipped
    // `<h3>{roleName} — every skill, ranked by leverage</h3>` elsewhere in the Evidence card. Today,
    // inside `.lg-results-head`, the role name is only `<span class="tag tag-accent">`, real text
    // with no heading semantics at all — an exact-name match against that scope must fail.
    const standingHead = page.locator('.lg-results-head')
    await expect(
      standingHead.getByRole('heading', { name: STUB_ROLE, exact: true }),
      `expected a heading with the role name "${STUB_ROLE}" inside .lg-results-head (the Standing ` +
        'card\'s header band) — today it is a plain <span class="tag tag-accent">, not a heading',
    ).toBeVisible()
  })

  test('chip -> FilterStatusBar -> table stay in lockstep from a single interaction', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    const fullRowCount = await page.locator('table.leverage-table tbody tr').count()
    expect(fullRowCount).toBeGreaterThan(0)

    const chip = page.getByRole('button', { name: UNCATEGORIZED_CHIP_NAME })
    await expect(chip).toBeVisible()
    await chip.click()

    // (1) the chip itself reports pressed.
    await expect(
      chip,
      'clicking the "Uncategorized" chip did not set aria-pressed="true" on it',
    ).toHaveAttribute('aria-pressed', 'true')

    // (2) FilterStatusBar's live region announces the same "N of M" the chip/table must agree on.
    // `App.tsx` does not render `<FilterStatusBar>` at all today, so this locator will not resolve.
    const statusBar = page.locator(FILTER_STATUS_SELECTOR)
    await expect(
      statusBar,
      'expected a FilterStatusBar live region (".filter-status-bar") to appear once a group chip ' +
        'is selected — App.tsx does not render <FilterStatusBar> yet',
    ).toBeVisible()

    const statusText = (await statusBar.textContent()) ?? ''
    const match = statusText.match(N_OF_M_PATTERN)
    expect(match, `FilterStatusBar text "${statusText}" did not match "show N of M skills"`).not.toBeNull()
    const [, filteredCountText, totalCountText] = match!
    const filteredCount = Number(filteredCountText)
    const totalCount = Number(totalCountText)

    // (3) the table's actual rendered row count must equal the same N FilterStatusBar announced —
    // one filteredRows array feeding both, never two independently-derived counts that could drift.
    const tableRowCount = await page.locator('table.leverage-table tbody tr').count()
    expect(
      tableRowCount,
      `table rendered ${tableRowCount} rows but FilterStatusBar announced ${filteredCount} of ` +
        `${totalCount} — the chip, the status bar, and the table have gone out of sync`,
    ).toBe(filteredCount)
    expect(totalCount).toBe(fullRowCount)
  })

  test('clearing the filter restores the full row count and flips the chip back to unpressed', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    const fullRowCount = await page.locator('table.leverage-table tbody tr').count()

    const chip = page.getByRole('button', { name: UNCATEGORIZED_CHIP_NAME })
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')

    const clearButton = page.getByRole('button', { name: /clear filter/i })
    await expect(
      clearButton,
      'expected a "✕ Clear filter" button (rendered by FilterStatusBar) once a group is selected',
    ).toBeVisible()
    await clearButton.click()

    await expect(
      page.locator('table.leverage-table tbody tr'),
      'clearing the filter did not restore the full unfiltered row count',
    ).toHaveCount(fullRowCount)

    await expect(
      chip,
      'clearing the filter via the "✕ Clear filter" button did not flip the chip\'s ' +
        'aria-pressed back to "false" — chip and FilterStatusBar have desynced state',
    ).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('Loading skeleton (spec 033)', () => {
  test('the loading state shows exactly 2 elements matching .lg-skeleton-block', async ({ page }) => {
    await stubRoleSkillProfileWithDelay(page, 1_000)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)

    // Today's App.tsx renders three skeleton blocks (lg-skeleton-scorecard/-scatter/-table).
    // This SPEC collapses that to exactly two (132px + 560px, per README's Loading screen).
    await expect(
      page.locator('.lg-skeleton-block'),
      'expected exactly 2 .lg-skeleton-block elements during loading — today renders 3 ' +
        '(scorecard/scatter/table stand-ins)',
    ).toHaveCount(2)
  })
})
