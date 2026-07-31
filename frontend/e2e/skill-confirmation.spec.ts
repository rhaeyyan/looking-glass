import { expect, test, type Page } from '@playwright/test'
import { STUB_ROLE, STUB_ROWS, STUB_RESUME, stubRoleSkillProfile, reportsHover } from './support/app'
// Ground truth for what extraction alone auto-detects — the real, unmodified functions the runtime
// uses, never a hand-waved/hardcoded expected set (per this task's instructions). These are plain,
// framework-free TS modules (no React/browser API), importable directly into Playwright's Node-side
// test file exactly like `support/app.ts` already imports pure lib types.
import { extractResumeSkills } from '../src/lib/resumeSkills'
import { normalizeSkillName } from '../src/lib/normalize'

/**
 * specs/038b-skill-confirmation-checklist-ui.md — RED-phase oracle for the skill-confirmation
 * checklist step (single-panel/`compareMode === false` only).
 *
 * Nothing this file depends on exists yet:
 *   - `SkillConfirmationChecklist.tsx` does not exist, so nothing renders between submit and
 *     results at all.
 *   - `App.tsx`'s panel-0 call site still calls `submitResumeAutoConfirm` (038a's permanent
 *     one-shot bridge), so clicking "Find my gaps" today jumps straight to the analyzed
 *     donut/table, exactly like every other already-shipped spec in this directory currently
 *     expects.
 *   - `localPersistence.ts` is still on v1 with no `confirmedSkillKeys`/fingerprint concept, so the
 *     reload assertions here (which require the EDITED, confirmed set to round-trip through
 *     localStorage) cannot pass either.
 *
 * Every assertion below that looks for a checkbox, a "Confirm skills" button, or an edited-set
 * result after reload is therefore expected to fail — either as a `getByTestId`/`getByRole` timeout
 * (element does not exist) or as an unedited/no-persistence result — not because of a locator typo
 * in this file.
 *
 * Selector contract this red establishes (Magnolia's `SkillConfirmationChecklist.tsx` must satisfy
 * these for the file to go green, exactly as `persistence.spec.ts` pinned "Clear saved data" as a
 * literal button name before that button existed):
 *   - `data-testid="skill-confirmation-checklist"` on the checklist's root container.
 *   - one `role="checkbox"` per vocabulary row, whose accessible name is that row's exact
 *     `skill_name_raw` (e.g. "react", "next.js", "responsive design") — not a re-cased/relabeled
 *     variant.
 *   - a `role="button"` named exactly "Confirm skills" that calls `confirmSkills` with the
 *     checklist's current checked set.
 *
 * Verification Oracle (per SPEC): this file @ desktop-light, @ mobile-touch-dark. Neither profile
 * changes the expected DOM shape here (a checkbox list + a submit button, not a hover/touch-target
 * concern by itself) — both are run to catch a touch-only regression in the checkbox/button tap
 * targets themselves, consistent with this project's "run across the named profiles, don't assume
 * parity" rule.
 */

const CHECKLIST_TESTID = 'skill-confirmation-checklist'
const CONFIRM_BUTTON_NAME = 'Confirm skills'

// ---- Ground truth, computed against the REAL extraction logic, not hand-waved. -----------------
const VOCABULARY = STUB_ROWS.map((row) => row.skill_name_raw)
const EXTRACTED_NAMES = new Set(extractResumeSkills(STUB_RESUME, VOCABULARY))

function skillKey(row: { skill_key: string | null; skill_name_raw: string }): string {
  return row.skill_key ?? normalizeSkillName(row.skill_name_raw)
}

// Exactly the set `pendingConfirmation.autoDetectedKeys` must equal for this fixture (verified
// directly above against `STUB_RESUME`/`STUB_ROWS` at test-collection time): {"react", "typescript"}.
const AUTO_DETECTED_KEYS = new Set(
  STUB_ROWS.filter((row) => EXTRACTED_NAMES.has(row.skill_name_raw)).map(skillKey),
)

// Sanity-check the fixture itself hasn't silently drifted (e.g. STUB_RESUME/STUB_ROWS edited by an
// unrelated change) — if this ever fails, every assertion below about the checked/unchecked split
// is testing the wrong ground truth and must be re-derived, not patched around.
test('fixture sanity: STUB_RESUME auto-detects exactly {react, typescript} against STUB_ROWS today', () => {
  expect([...AUTO_DETECTED_KEYS].sort()).toEqual(['react', 'typescript'])
})

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

/**
 * Drives to the checklist step: stub the read, pick the role, paste the resume, submit. Resolves
 * once the checklist is actually on screen — never races the render, and never falls back to the
 * pre-038b `gotoRenderedLeverageTable` helper (support/app.ts), which asserts a leverage table
 * appears IMMEDIATELY after submit — an assumption this SPEC deliberately breaks for panel 0.
 */
async function gotoChecklist(page: Page): Promise<void> {
  await stubRoleSkillProfile(page)
  await page.goto('/')

  await page.getByLabel('Target role').selectOption(STUB_ROLE)
  await page.getByLabel('Resume text').fill(STUB_RESUME)
  await page.getByRole('button', { name: 'Find my gaps' }).click()

  await expect(
    page.getByTestId(CHECKLIST_TESTID),
    'expected a skill-confirmation checklist (data-testid="skill-confirmation-checklist") to ' +
      'appear after submitting — App.tsx\'s panel-0 call site still calls submitResumeAutoConfirm ' +
      'today, which skips straight to analyzed results with no checklist at all',
  ).toBeVisible({ timeout: 5_000 })
}

function checkboxFor(page: Page, skillName: string) {
  return page.getByTestId(CHECKLIST_TESTID).getByRole('checkbox', { name: skillName, exact: true })
}

test.describe('Skill-confirmation checklist — render + pre-checked state (spec 038b)', () => {
  test('every vocabulary skill renders as exactly one checkbox, pre-checked per real extraction, not raw guesswork', async ({
    page,
  }) => {
    await gotoChecklist(page)

    const checklist = page.getByTestId(CHECKLIST_TESTID)
    await expect(
      checklist.getByRole('checkbox'),
      `expected exactly ${STUB_ROWS.length} checkboxes (one per STUB_ROWS vocabulary skill)`,
    ).toHaveCount(STUB_ROWS.length)

    for (const row of STUB_ROWS) {
      const checkbox = checkboxFor(page, row.skill_name_raw)
      await expect(
        checkbox,
        `expected a checkbox named exactly "${row.skill_name_raw}" in the checklist`,
      ).toBeVisible()

      const expectAutoDetected = AUTO_DETECTED_KEYS.has(skillKey(row))
      if (expectAutoDetected) {
        await expect(
          checkbox,
          `"${row.skill_name_raw}" was affirmed by extractResumeSkills against STUB_RESUME and must be pre-checked`,
        ).toBeChecked()
      } else {
        await expect(
          checkbox,
          `"${row.skill_name_raw}" was NOT affirmed by extractResumeSkills against STUB_RESUME and must NOT be pre-checked`,
        ).not.toBeChecked()
      }
    }
  })
})

test.describe('Skill-confirmation checklist — edit + confirm produces the EDITED gap, not raw auto-detection (spec 038b)', () => {
  test('unchecking an auto-detected skill and checking an auto-missed one changes the donut/table to the edited set', async ({
    page,
  }) => {
    await gotoChecklist(page)

    // Sanity on the starting (auto-detected) state before editing.
    await expect(checkboxFor(page, 'typescript')).toBeChecked()
    await expect(checkboxFor(page, 'redux')).not.toBeChecked()

    // Edit: uncheck an auto-detected skill ("typescript"), check an auto-missed one ("redux").
    await checkboxFor(page, 'typescript').uncheck()
    await checkboxFor(page, 'redux').check()

    await page.getByRole('button', { name: CONFIRM_BUTTON_NAME }).click()

    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    // The checklist must be gone once confirmed — this is a one-way step into analyzed results,
    // not a persistent side panel.
    await expect(page.getByTestId(CHECKLIST_TESTID)).toHaveCount(0)

    // "typescript" was unchecked -> must now show as a gap ("Worth learning"), even though
    // extraction alone affirmed it.
    const typescriptRow = page.locator('table.leverage-table tbody tr', { has: page.getByText('typescript', { exact: true }) })
    await expect(typescriptRow.locator('.lev-status')).toHaveAttribute('data-have', 'false')
    await expect(typescriptRow.locator('.lev-status-label')).toHaveText('Worth learning')

    // "redux" was checked -> must now show as had ("Already have"), even though extraction alone
    // missed it entirely.
    const reduxRow = page.locator('table.leverage-table tbody tr', { has: page.getByText('redux', { exact: true }) })
    await expect(reduxRow.locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(reduxRow.locator('.lev-status-label')).toHaveText('Already have')

    // Untouched rows stay exactly as auto-detection/absence would have left them — the edit is
    // scoped to the two toggled skills only.
    const reactRow = page.locator('table.leverage-table tbody tr', { has: page.getByText('react', { exact: true }) })
    await expect(reactRow.locator('.lev-status')).toHaveAttribute('data-have', 'true')

    const cssRow = page.locator('table.leverage-table tbody tr', { has: page.getByText('css3', { exact: true }) })
    await expect(cssRow.locator('.lev-status')).toHaveAttribute('data-have', 'false')

    // Donut legend reflects the same edited composition, not a re-derived auto-detected one: have =
    // {react, redux} = 2, gap = {next.js, css3, responsive design, typescript} = 4, unscored =
    // {webassembly} = 1. (Composition changed — typescript moved out, redux moved in — even though
    // the aggregate counts happen to match the pre-edit split; the per-row assertions above are what
    // actually prove the edit won, not these totals alone.)
    const legendText = (await page.locator('.lg-donut-legend').innerText()).replace(/\s+/g, ' ')
    expect(legendText).toContain('Already have 2')
    expect(legendText).toContain('Worth learning 4')
    expect(legendText).toContain('Not scored yet 1')
  })
})

test.describe('Skill-confirmation checklist — persistence of the CONFIRMED (edited) set across reload (spec 038b)', () => {
  test('reloading redisplays the edited/confirmed results directly, without a fresh checklist', async ({
    page,
  }) => {
    await gotoChecklist(page)

    await checkboxFor(page, 'typescript').uncheck()
    await checkboxFor(page, 'redux').check()
    await page.getByRole('button', { name: CONFIRM_BUTTON_NAME }).click()
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // Stub must still be in place after reload — a fresh navigation refetches the role profile.
    await stubRoleSkillProfile(page)
    await page.reload()

    // The confirmed (edited) set must redisplay DIRECTLY — no fresh checklist shown, and no
    // re-derivation from raw auto-detection (which would put "typescript" back as had and "redux"
    // back as a gap).
    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'a fresh checklist must NOT reappear after reload when a confirmed set already round-tripped ' +
        'through localStorage for this exact resumeText/role pair',
    ).toHaveCount(0)

    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    const typescriptRow = page.locator('table.leverage-table tbody tr', { has: page.getByText('typescript', { exact: true }) })
    await expect(
      typescriptRow.locator('.lev-status'),
      'reload must redisplay the CONFIRMED/edited set (typescript unchecked -> gap), not re-run raw auto-detection (which would show it as had)',
    ).toHaveAttribute('data-have', 'false')

    const reduxRow = page.locator('table.leverage-table tbody tr', { has: page.getByText('redux', { exact: true }) })
    await expect(
      reduxRow.locator('.lev-status'),
      'reload must redisplay the CONFIRMED/edited set (redux checked -> had), not re-run raw auto-detection (which would show it as a gap)',
    ).toHaveAttribute('data-have', 'true')
  })
})

// a11y fix (non-blocking finding from spec 038b's audit): the checklist's mount didn't move focus
// anywhere, so a keyboard/screen-reader user was never told "you're now looking at a new step".
// Real-browser assertion, not just the jsdom-level one in SkillConfirmationChecklist.test.tsx —
// focus IS simulated correctly in jsdom, but this is still the actual keyboard-user experience this
// fix is for, exercised through real navigation/clicks.
//
// This block originally also covered "Confirm skills" and "Back" moving focus to
// `RoleResultsPanel`'s own role heading on those transitions. That half of the fix was reverted
// (see the comment on `RoleResultsPanel.tsx`'s `<h2>`): the component remounts on every ordinary
// role-`<select>` switch, not just after a deliberate step-transition, so a mount-focus effect there
// stole focus from whatever the user was already doing on every background refetch — a real
// regression pinned permanently in `e2e/role-picker-focus-regression.spec.ts`. Only
// `SkillConfirmationChecklist`'s own mount-focus (asserted below) is safe and shipped, because it
// only ever mounts right after a deliberate click.
test.describe('Focus moves to the checklist\'s own heading on mount (a11y fix)', () => {
  test('submitting "Find my gaps" moves focus to the checklist\'s own heading', async ({ page }) => {
    await stubRoleSkillProfile(page)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption(STUB_ROLE)
    await page.getByLabel('Resume text').fill(STUB_RESUME)
    await page.getByRole('button', { name: 'Find my gaps' }).click()

    await expect(
      page.getByRole('heading', { name: 'Confirm what you already know' }),
      'expected focus to land on the checklist\'s own heading once it mounts',
    ).toBeFocused({ timeout: 5_000 })
  })
})
