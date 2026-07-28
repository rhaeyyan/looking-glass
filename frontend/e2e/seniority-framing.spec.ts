import { expect, test } from '@playwright/test'
import {
  STUB_ROLE,
  STUB_ROWS,
  gotoRenderedLeverageTable,
  reportsHover,
  stubRoleSkillProfile,
} from './support/app'

/**
 * specs/029-seniority-role-picker-ui.md — RED-phase oracle for the new seniority `<select>` +
 * `SeniorityFraming` header note.
 *
 * `App.tsx` does not yet declare `selectedSeniority` state, the `#seniority-picker` `<select>`, or
 * render `SeniorityFraming` at all, so every test below that interacts with `#seniority-picker` is
 * expected to fail at that step (a locator timeout on an element that does not exist) — that is a
 * real red produced by a genuinely missing feature, not a config/setup bug. `gotoRenderedLeverageTable`
 * / `stubRoleSkillProfile` are reused unmodified from the existing oracle helpers so the drive-to-a-
 * rendered-state step is not duplicated here.
 *
 * Verification Oracle (per the SPEC): this file @ mobile-touch-dark + @ desktop-dark. The mobile-
 * touch profile matters because the seniority `<select>` must be a real native control operable
 * without hover (touch-target size, no hover-only affordance); the desktop profile verifies pointer
 * + keyboard (Tab/Arrow/Enter) operability of the same control, in a sensible tab order after the
 * role `<select>`.
 *
 * `getSeniorityFraming`'s templates (frontend/src/lib/seniorityFraming.ts) all share the fixed lead
 * "AI requirements in {label} roles" regardless of category/seniority, so that phrase is used
 * throughout as the stable locator for "the note is/isn't rendered" — never a byte-for-byte pct
 * figure, which is out of this UI spec's scope (spec 028 already locks those down).
 */

const NOTE_TEXT = /AI requirements in .* roles/

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

test.describe('seniority picker + framing note — edge cases', () => {
  test('no role loaded: the seniority select may render, but no framing note ever appears', async ({ page }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await expect(page.getByText(NOTE_TEXT)).toHaveCount(0)
  })

  test('role loaded, seniority left at default (""): no framing note renders', async ({ page }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })

    await expect(page.getByText(NOTE_TEXT)).toHaveCount(0)
  })

  test('role loaded + seniority picked: note renders immediately, even before Step 2 (resume) is completed', async ({
    page,
  }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })

    // Step 2 (resume) is deliberately left untouched here — proves the note is decoupled from the
    // gap-analysis pipeline, not gated on `analyzed`.
    await expect(page.getByLabel('Resume text')).toHaveValue('')

    await page.locator('#seniority-picker').selectOption('mid')

    await expect(page.getByText(NOTE_TEXT)).toBeVisible()
    // Still untouched — selecting a seniority level must not itself trigger any resume analysis.
    await expect(page.getByLabel('Resume text')).toHaveValue('')
  })

  test('changing selectedRole while a seniority is already picked updates the note to the new role\'s category — no stale text', async ({
    page,
  }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    // Frontend -> 'engineering' category (frontend/src/lib/seniorityFraming.ts).
    await page.getByLabel('Target role').selectOption('Frontend')
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })
    await page.locator('#seniority-picker').selectOption('entry')

    const noteLocator = page.getByText(NOTE_TEXT)
    await expect(noteLocator).toContainText('engineering roles')
    const engineeringNote = await noteLocator.textContent()

    // Security -> 'security' category — a different DatamataCategory, so the label and the
    // underlying gradient figures must both change.
    await page.getByLabel('Target role').selectOption('Security')

    await expect(noteLocator).toContainText('security roles')
    await expect(noteLocator).not.toHaveText(engineeringNote ?? '')
  })

  test('CORE ORACLE: changing selectedSeniority leaves the matrix, leverage table, and donut counts byte-identical', async ({
    page,
  }) => {
    await gotoRenderedLeverageTable(page)

    const matrixBefore = await page.getByTestId('skill-matrix').innerHTML()
    const tableBefore = await page.locator('table.leverage-table').innerHTML()
    const donutBefore = await page.locator('.lg-donut-wrap').innerHTML()

    await page.locator('#seniority-picker').selectOption('senior')
    await expect(page.getByText(NOTE_TEXT)).toBeVisible()

    const matrixAfter = await page.getByTestId('skill-matrix').innerHTML()
    const tableAfter = await page.locator('table.leverage-table').innerHTML()
    const donutAfter = await page.locator('.lg-donut-wrap').innerHTML()

    expect(matrixAfter, 'SkillMatrix DOM must be byte-identical before/after a seniority change').toBe(
      matrixBefore,
    )
    expect(tableAfter, 'Leverage table DOM must be byte-identical before/after a seniority change').toBe(
      tableBefore,
    )
    expect(donutAfter, 'Donut DOM must be byte-identical before/after a seniority change').toBe(donutBefore)
  })

  test('changing selectedSeniority triggers no additional network/stubbed-route call', async ({ page }) => {
    let callCount = 0
    await page.route('**/rest/v1/role_skill_arbitrage**', (route) => {
      callCount++
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STUB_ROWS),
      })
    })

    await page.goto('/')
    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })

    const callsAfterRoleLoad = callCount
    expect(callsAfterRoleLoad).toBeGreaterThan(0)

    await page.locator('#seniority-picker').selectOption('mid')
    await expect(page.getByText(NOTE_TEXT)).toBeVisible()
    await page.locator('#seniority-picker').selectOption('senior')
    await expect(page.getByText(NOTE_TEXT)).toContainText('senior')

    expect(callCount, 'Selecting/changing seniority must never refetch role_skill_arbitrage').toBe(
      callsAfterRoleLoad,
    )
  })

  test('keyboard-only operability: the seniority select is tab-reachable after the role select and operable via arrow keys', async ({
    page,
  }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })

    await page.getByLabel('Target role').focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('#seniority-picker')).toBeFocused()

    // Native <select> keyboard operability: ArrowDown moves through the option list without
    // requiring Enter/space to "open" it first in most engines; assert the value actually changes,
    // proving the control responds to keyboard input alone (no pointer interaction anywhere here).
    await page.keyboard.press('ArrowDown')
    const value = await page.locator('#seniority-picker').inputValue()
    expect(value, 'Arrow-key navigation on the focused seniority select must change its value').not.toBe('')

    await expect(page.getByText(NOTE_TEXT)).toBeVisible()
  })
})
