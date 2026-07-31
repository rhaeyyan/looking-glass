import { expect, test, type Page } from '@playwright/test'

/**
 * specs/039b-compare-mode-sidebar-toggle.md — RED-phase oracle. Nothing in this file's assumptions
 * is implemented yet: `App.tsx` has no `sidebarVisible` state, no `.lg-sidebar-toggle` button, and
 * neither Step 1 ("Pick your target role") nor Step 2 ("Paste your resume") card carries a `hidden`
 * expression today — both are always rendered/visible in every mode. Verified directly (not
 * assumed): `grep -rn "lg-sidebar-toggle" frontend/` returns zero matches anywhere in the tree at
 * the time this file was written.
 *
 * Every assertion below is expected to fail today, and should fail because the referenced
 * `.lg-sidebar-toggle` element does not exist — not because of a locator mistake in this file. The
 * one exception is deliberate, not an oversight: the "single-role mode" describe block (spec item
 * 1) asserts an invariant the SPEC states is *already* true and stays true ("Single-role mode is
 * unaffected: no toggle renders there, cards always visible") — since compareMode defaults to
 * false and nothing in 039b changes single-role mode's own render path, that block passes both
 * before and after this SPEC lands. It is kept as a permanent regression guard (proves the toggle
 * stays compare-mode-only forever, not just today), not a red — see the compliance report for this
 * round, which calls this out explicitly rather than silently overclaiming every assertion is red.
 *
 * No `stubRoleSkillProfile`/role selection anywhere in this file: every scenario only exercises the
 * "Compare roles" checkbox and the (future) sidebar toggle — `.compare-grid` already renders its 2
 * `.compare-column` idle-state children with no role picked at all (established by
 * compare-roles.spec.ts's own first test), so item 6 needs no fixture data either.
 *
 * No environment-parity guard test (contrast `compare-roles.spec.ts`'s "the oracle reports the
 * pointer capability its project name claims"): nothing in this file's 6 assertions branches on
 * `(hover: hover)` vs `(hover: none)` — a click/tap toggles `hidden` identically either way, unlike
 * the leverage table's `:hover`-driven behaviour. mobile-touch-dark is run here purely as the SPEC's
 * declared "compatibility check" (the toggle must still function by tap), not because touch vs.
 * pointer changes any expected outcome.
 *
 * Verification Oracle (per spec 039b): this file @ desktop-light, @ desktop-dark (primary),
 * @ mobile-touch-dark (compatibility check).
 *
 * Follow-up fix (root cause: `.lg-main`'s grid-template-columns never shrank when the cards'
 * content was hidden, so `.lg-results` never actually gained the reclaimed width): the
 * "Collapsing the sidebar actually reclaims layout width" block below adds a geometry assertion
 * — bounding-box widths, not just visibility — and is desktop-only (`test.skip` under 861px,
 * matching `.lg-main`'s own single-column breakpoint). Run @ desktop-dark (primary) and
 * @ desktop-light; it self-skips on mobile-touch-dark rather than asserting a width change that
 * was never supposed to happen on a stacked single-column layout.
 */

function compareToggle(page: Page) {
  return page.getByLabel('Compare roles')
}

async function enableCompareMode(page: Page): Promise<void> {
  await compareToggle(page).click()
}

async function disableCompareMode(page: Page): Promise<void> {
  await compareToggle(page).click()
}

/** The SPEC's new disclosure button — a stable class selector, since its accessible name/
 * `aria-expanded` are themselves under test and change across a single test's lifetime. */
function sidebarToggle(page: Page) {
  return page.locator('.lg-sidebar-toggle')
}

/** Step 1's card heading, scoped by the existing `.card-title` class (not a bare text match) so
 * this can never collide with the unrelated "Paste your resume text before finding your gaps."
 * validation message, which also contains the substring "Paste your resume". */
function stepOneHeading(page: Page) {
  return page.locator('.card-title', { hasText: 'Pick your target role' })
}

function stepTwoHeading(page: Page) {
  return page.locator('.card-title', { hasText: 'Paste your resume' })
}

/** `.compare-grid`'s own 2 result columns (established by spec 039a) — untouched by this SPEC. */
function compareColumns(page: Page) {
  return page.locator('.compare-grid > .compare-column')
}

test.describe('Single-role mode is unaffected (spec 039b, oracle item 1)', () => {
  test('no .lg-sidebar-toggle exists, and both Step 1/Step 2 cards stay visible', async ({ page }) => {
    await page.goto('/')

    await expect(
      sidebarToggle(page),
      'expected zero .lg-sidebar-toggle elements in single-role mode (compareMode off, the ' +
        'default) — this is a permanent invariant, not a red: the toggle must never render outside ' +
        'compare mode',
    ).toHaveCount(0)

    await expect(stepOneHeading(page)).toBeVisible()
    await expect(stepTwoHeading(page)).toBeVisible()
  })
})

test.describe('Toggle appears once compare mode is on (spec 039b, oracle item 2)', () => {
  test('turning on "Compare roles" reveals the toggle, expanded by default, cards still visible', async ({
    page,
  }) => {
    await page.goto('/')
    await enableCompareMode(page)

    await expect(
      sidebarToggle(page),
      'expected exactly one .lg-sidebar-toggle once "Compare roles" is on — no such element exists ' +
        'in App.tsx today',
    ).toHaveCount(1)
    await expect(
      sidebarToggle(page),
      'expected aria-expanded="true" by default (opens already-expanded)',
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebarToggle(page)).toHaveAccessibleName('Hide sidebar')

    await expect(stepOneHeading(page)).toBeVisible()
    await expect(stepTwoHeading(page)).toBeVisible()
  })
})

test.describe('Clicking the toggle collapses both cards together (spec 039b, oracle item 3)', () => {
  test('one click hides both cards, flips aria-expanded to false, renames to "Show sidebar"', async ({
    page,
  }) => {
    await page.goto('/')
    await enableCompareMode(page)

    await sidebarToggle(page).click()

    // Native `hidden` sets `display: none` immediately — no `[hidden]` override and no transition
    // touches `display` anywhere in matrix.css/looking-glass.css (checked: `.card.blueprint`'s own
    // `@media (prefers-reduced-motion: no-preference)` block only transitions `background`/
    // `backdrop-filter`, never `display`), so there is no mid-interpolation state to poll past here
    // — unlike the row-background lesson in CLAUDE.md. `expect(...).not.toBeVisible()` still
    // auto-retries, which is enough.
    await expect(
      stepOneHeading(page),
      'expected the Step 1 card to be hidden once the sidebar toggle collapses it',
    ).not.toBeVisible()
    await expect(
      stepTwoHeading(page),
      'expected the Step 2 card to be hidden once the sidebar toggle collapses it',
    ).not.toBeVisible()

    await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(sidebarToggle(page)).toHaveAccessibleName('Show sidebar')
  })
})

test.describe('Clicking again restores both cards (spec 039b, oracle item 4)', () => {
  test('a second click restores both cards, aria-expanded true, name back to "Hide sidebar"', async ({
    page,
  }) => {
    await page.goto('/')
    await enableCompareMode(page)

    await sidebarToggle(page).click() // collapse
    await sidebarToggle(page).click() // expand again

    await expect(stepOneHeading(page)).toBeVisible()
    await expect(stepTwoHeading(page)).toBeVisible()
    await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebarToggle(page)).toHaveAccessibleName('Hide sidebar')
  })
})

test.describe('Turning compare mode off auto-restores the sidebar (spec 039b, oracle item 5)', () => {
  test('with the sidebar collapsed, turning "Compare roles" off restores both cards and removes the toggle', async ({
    page,
  }) => {
    await page.goto('/')
    await enableCompareMode(page)
    await sidebarToggle(page).click() // collapse

    await expect(
      stepOneHeading(page),
      'sanity check: the sidebar must actually be collapsed before testing the auto-restore',
    ).not.toBeVisible()

    await disableCompareMode(page)

    await expect(
      sidebarToggle(page),
      'expected the toggle to be gone entirely once compare mode is off — single-role mode never ' +
        'renders it',
    ).toHaveCount(0)
    await expect(
      stepOneHeading(page),
      'expected Step 1 to auto-restore to visible on the compare-mode-off transition, even though ' +
        'the sidebar was left collapsed',
    ).toBeVisible()
    await expect(stepTwoHeading(page)).toBeVisible()
  })
})

test.describe('Collapsing the sidebar actually reclaims layout width (follow-up fix)', () => {
  /**
   * Root-cause regression guard: the original 039b implementation hid the Step 1/Step 2 cards'
   * *content* via `hidden`, but never shrank `.lg-main`'s fixed `grid-template-columns` first
   * track — CSS grid track sizing comes from that declaration, not from the (now nearly-empty)
   * content living inside the track, so `.lg-results`/`.compare-grid` never actually gained any
   * width. The 6 describe blocks above only assert the cards' visibility/`hidden` state and the
   * toggle's `aria-expanded`/accessible name, never any bounding box — which is exactly why that
   * miss stayed green through all of them. This block measures rendered geometry instead.
   *
   * Desktop-only by construction: below 861px `.lg-main` already collapses to a single stacked
   * column (no second track to widen, nothing to reclaim), so this is skipped on narrow viewports
   * rather than asserting a geometry change that was never supposed to happen there.
   */
  test('the sidebar column shrinks and the results column widens when collapsed, then reverts on expand', async ({
    page,
  }) => {
    const viewport = page.viewportSize()
    test.skip(
      !viewport || viewport.width <= 860,
      '.lg-main only collapses to a single stacked column below 861px — there is no second ' +
        'track to widen and no horizontal space to reclaim on narrow/mobile viewports.',
    )

    await page.goto('/')
    await enableCompareMode(page)

    const sidebar = page.locator('.lg-sidebar')
    const results = page.locator('.lg-results')

    const expandedSidebarBox = await sidebar.boundingBox()
    const expandedResultsBox = await results.boundingBox()
    expect(expandedSidebarBox, 'expected .lg-sidebar to have a measurable box pre-collapse').not.toBeNull()
    expect(expandedResultsBox, 'expected .lg-results to have a measurable box pre-collapse').not.toBeNull()

    await sidebarToggle(page).click() // collapse

    // `.lg-main`'s grid-template-columns transitions over 160ms (prefers-reduced-motion:
    // no-preference) — a bare read straight after the click would sample an interpolated width,
    // not the settled value. Wait past the transition before measuring (CLAUDE.md's
    // animated-property lesson, applied to grid track width instead of a background color).
    await page.waitForTimeout(240)

    const collapsedSidebarBox = await sidebar.boundingBox()
    const collapsedResultsBox = await results.boundingBox()
    expect(collapsedSidebarBox, 'expected .lg-sidebar to still have a measurable box once collapsed — it must stay in the DOM/layout for the checkbox+toggle to stay reachable').not.toBeNull()
    expect(collapsedResultsBox).not.toBeNull()

    expect(
      collapsedSidebarBox!.width,
      `expected .lg-sidebar's rendered width to measurably shrink once collapsed (was ` +
        `${expandedSidebarBox!.width}px, now ${collapsedSidebarBox!.width}px) — the grid track ` +
        'itself must narrow, not just have its cards\' content disappear while the track stays reserved',
    ).toBeLessThan(expandedSidebarBox!.width - 50)

    expect(
      collapsedResultsBox!.width,
      `expected .lg-results to measurably widen once the sidebar collapses (was ` +
        `${expandedResultsBox!.width}px, now ${collapsedResultsBox!.width}px)`,
    ).toBeGreaterThan(expandedResultsBox!.width + 50)

    await sidebarToggle(page).click() // expand again
    await page.waitForTimeout(240)

    const restoredSidebarBox = await sidebar.boundingBox()
    const restoredResultsBox = await results.boundingBox()
    expect(restoredSidebarBox).not.toBeNull()
    expect(restoredResultsBox).not.toBeNull()

    expect(
      Math.abs(restoredSidebarBox!.width - expandedSidebarBox!.width),
      'expected .lg-sidebar to revert to its original width once re-expanded',
    ).toBeLessThan(5)
    expect(
      Math.abs(restoredResultsBox!.width - expandedResultsBox!.width),
      'expected .lg-results to revert to its original width once re-expanded',
    ).toBeLessThan(5)
  })
})

test.describe(".compare-grid's own columns are never touched (spec 039b, oracle item 6)", () => {
  test('collapsing/expanding the sidebar never changes .compare-grid\'s 2 result columns', async ({
    page,
  }) => {
    await page.goto('/')
    await enableCompareMode(page)

    const columns = compareColumns(page)
    await expect(columns, 'expected 2 .compare-column children before touching the sidebar toggle').toHaveCount(2)
    await expect(columns.nth(0)).toBeVisible()
    await expect(columns.nth(1)).toBeVisible()

    await sidebarToggle(page).click() // collapse

    await expect(
      columns,
      'collapsing the sidebar must never change the count of .compare-grid columns',
    ).toHaveCount(2)
    await expect(columns.nth(0)).toBeVisible()
    await expect(columns.nth(1)).toBeVisible()

    await sidebarToggle(page).click() // expand again

    await expect(columns).toHaveCount(2)
    await expect(columns.nth(0)).toBeVisible()
    await expect(columns.nth(1)).toBeVisible()
  })
})
