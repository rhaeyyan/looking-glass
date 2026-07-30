import { expect, test } from '@playwright/test'
import { STUB_ROLE, STUB_RESUME, stubRoleSkillProfile } from './support/app'

/**
 * specs/034-local-persistence.md — RED-phase oracle for localStorage persistence of resumeText /
 * selectedRole / selectedSeniority, plus the "Clear saved data" control.
 *
 * Nothing in `App.tsx` reads or writes `localStorage` yet, and no "Clear saved data" button exists
 * in the DOM at all, so every assertion below that depends on post-reload state, or on locating
 * the Clear button, is expected to fail: a `page.reload()` today produces a blank idle app exactly
 * like a first visit, and `getByRole('button', { name: 'Clear saved data' })` will time out because
 * the element does not exist. That is a real red produced by a genuinely missing feature, not a
 * config/setup bug.
 *
 * `desktop-light` is the SPEC's declared profile — this behavior is not touch/theme-specific.
 */

const NOTE_TEXT = /AI requirements in .* roles/

test.describe('local persistence of resumeText / selectedRole / selectedSeniority', () => {
  test('surviving a reload: role, seniority, resume text, and analyzed results all reappear without resubmitting', async ({
    page,
  }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })
    await page.locator('#seniority-picker').selectOption('mid')
    await page.getByLabel('Resume text').fill(STUB_RESUME)
    await page.getByRole('button', { name: 'Find my gaps' }).click()
    await page.getByRole('button', { name: 'Confirm skills' }).click()

    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(page.getByText(NOTE_TEXT)).toBeVisible()

    // Stub must still be in place after reload — a fresh navigation refetches the role profile.
    await stubRoleSkillProfile(page)
    await page.reload()

    await expect(page.getByLabel('Target role')).toHaveValue(STUB_ROLE)
    await expect(page.locator('#seniority-picker')).toHaveValue('mid')
    await expect(page.getByLabel('Resume text')).toHaveValue(STUB_RESUME)

    // Analyzed results reappear — donut, top-gap narration, and leverage-table rows — without the
    // user clicking "Find my gaps" again.
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(page.locator('.lg-donut-wrap')).toBeVisible()
    await expect(page.getByText(NOTE_TEXT)).toBeVisible()
    const rowCount = await page.locator('table.leverage-table tbody tr').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  test('"Clear saved data" resets in-memory state and, after another reload, the app is back to idle (including seniority at "Not specified")', async ({
    page,
  }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.locator('.lg-results-head').waitFor({ state: 'visible' })
    await page.locator('#seniority-picker').selectOption('senior')
    await page.getByLabel('Resume text').fill(STUB_RESUME)
    await page.getByRole('button', { name: 'Find my gaps' }).click()
    await page.getByRole('button', { name: 'Confirm skills' }).click()
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    await page.getByRole('button', { name: 'Clear saved data' }).click()

    // Immediate in-memory reset: idle state visible without even reloading yet.
    await expect(page.getByLabel('Target role')).toHaveValue('')
    await expect(page.getByLabel('Resume text')).toHaveValue('')
    await expect(page.locator('#seniority-picker')).toHaveValue('')
    await expect(page.locator('table.leverage-table')).toHaveCount(0)

    await page.reload()

    await expect(page.getByLabel('Target role')).toHaveValue('')
    await expect(page.getByLabel('Resume text')).toHaveValue('')
    await expect(page.locator('#seniority-picker')).toHaveValue('')
    await expect(
      page.locator('#seniority-picker').locator('option', { hasText: 'Not specified' }),
    ).toHaveCount(1)
    await expect(page.locator('table.leverage-table')).toHaveCount(0)
    await expect(page.getByText(NOTE_TEXT)).toHaveCount(0)
  })
})
