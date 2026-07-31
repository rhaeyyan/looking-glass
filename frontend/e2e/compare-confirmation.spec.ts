import { expect, test, type Page } from '@playwright/test'
import {
  confirmSkillChecklist,
  makeRow,
  reportsHover,
  stubMultiRoleProfile,
  STUB_RESUME,
  STUB_ROLE,
  STUB_ROWS,
} from './support/app'
// Ground truth for what extraction alone auto-detects — the real, unmodified functions the runtime
// uses, never a hand-waved/hardcoded expected set. Mirrors skill-confirmation.spec.ts exactly.
import { extractResumeSkills } from '../src/lib/resumeSkills'
import { normalizeSkillName } from '../src/lib/normalize'

/**
 * specs/038c-compare-mode-sequential-confirmation.md — RED-phase oracle for routing EVERY active
 * compare-mode panel (0 and 1) through spec 038b's skill-confirmation checklist, one panel at a
 * time, in ascending slot order, before that panel's gap is computed.
 *
 * spec 039a amendment: compare mode caps at exactly 2 panels, permanently — there is no slot 2 to
 * stage or walk through anymore. `setupThreeSlotCompare`/`addThirdRole` and the "3-panel walk is
 * strictly 0 -> 1 -> 2" test are deleted: that test's unique claim (never 2+ checklists visible
 * across a 3-long chain) is already fully subsumed by "exactly slot 0's checklist right after
 * submit" + "confirming slot 0 ... advances to slot 1's checklist" below, and a slot-1-to-slot-2
 * transition can no longer exist to test. A new test replaces the deleted "Back on slot 1 abandons
 * slot 2" case: "Back" on slot 0's checklist, before confirming anything, must abandon slot 1's
 * already-staged draft too — the only place `handleCancelConfirmationCompare`'s `laterSlot > slot`
 * filter can still be observed with a 2-slot cap (Back on slot 1, the last slot, never has a later
 * slot to abandon).
 *
 * Nothing this file depends on exists yet: `App.tsx`'s `handleResumeSubmit` still calls
 * `panels[slot].submitResumeAutoConfirm(resumeText)` for every panel — INCLUDING panel 0 — whenever
 * `compareMode` is true, which computes every active panel's gap immediately and never stages a
 * `pendingConfirmation` draft for any of them. There is therefore no `confirmationSlot` derivation,
 * no checklist ever rendered inside `.compare-column`, and no sequential walk at all today. Every
 * assertion below that waits for `data-testid="skill-confirmation-checklist"` or a "Confirm skills"
 * button inside a compare-mode column is expected to fail as a timeout for that reason — a real,
 * currently-missing behavior — not a locator typo or a wrong assumption about today's single-panel
 * (`compareMode === false`) behavior, which this SPEC does not touch and which
 * `skill-confirmation.spec.ts` already covers and must stay green throughout.
 *
 * Selector contract reused verbatim from `skill-confirmation.spec.ts` (spec 038b) — this SPEC adds
 * no new checklist DOM contract, only a new place (every active compare-mode column, not just
 * single-panel mode) and order (ascending slot index) it can appear in:
 *   - `data-testid="skill-confirmation-checklist"` on the checklist's root container.
 *   - one `role="checkbox"` per vocabulary row, named exactly that row's `skill_name_raw`.
 *   - a `role="button"` named exactly "Confirm skills", and a second named exactly "Back".
 *
 * Verification Oracle (per SPEC): this file @ desktop-light, @ mobile-touch-dark.
 */

const CHECKLIST_TESTID = 'skill-confirmation-checklist'
const CONFIRM_BUTTON_NAME = 'Confirm skills'

// Slot 0 uses the same realistic STUB_ROWS/STUB_RESUME fixture as skill-confirmation.spec.ts, so
// its auto-detected set is real extraction output, not a guess. Slot 1 uses a distinct role with a
// single marker-skill row (compare-roles.spec.ts's `makeRow` idiom) — its own checklist only needs
// to be locatable/confirmable in these tests, not edited.
const ROLE_1 = STUB_ROLE // 'Frontend'
const ROLE_2 = 'Backend'
const BRAVO_SKILL = 'bravo-only-skill'

// ---- Ground truth, computed against the REAL extraction logic, not hand-waved. -----------------
const VOCABULARY = STUB_ROWS.map((row) => row.skill_name_raw)
const EXTRACTED_NAMES = new Set(extractResumeSkills(STUB_RESUME, VOCABULARY))

function skillKey(row: { skill_key: string | null; skill_name_raw: string }): string {
  return row.skill_key ?? normalizeSkillName(row.skill_name_raw)
}

// Exactly the set slot 0's `pendingConfirmation.autoDetectedKeys` must equal for this fixture:
// {"react", "typescript"} — verified directly against STUB_RESUME/STUB_ROWS, same as
// skill-confirmation.spec.ts.
const AUTO_DETECTED_KEYS = new Set(
  STUB_ROWS.filter((row) => EXTRACTED_NAMES.has(row.skill_name_raw)).map(skillKey),
)

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

function compareToggle(page: Page) {
  return page.getByLabel('Compare roles')
}

async function enableCompareMode(page: Page): Promise<void> {
  await compareToggle(page).click()
}

/** Slot `i`'s own "Target role" picker, told apart by DOM order (see compare-roles.spec.ts). */
function targetRoleSelect(page: Page, slot: number) {
  return page.getByLabel('Target role').nth(slot)
}

/** The SPEC's per-slot landmark, `<section aria-label="${role} comparison column">`. */
function comparisonColumn(page: Page, role: string) {
  return page.getByRole('region', { name: `${role} comparison column` })
}

/** Scoped to the one checklist ever on screen at a time — safe globally, same rationale as
 * `confirmSkillChecklist` (support/app.ts). */
function checkboxFor(page: Page, skillName: string) {
  return page.getByTestId(CHECKLIST_TESTID).getByRole('checkbox', { name: skillName, exact: true })
}

async function setupTwoSlotCompare(page: Page): Promise<void> {
  await stubMultiRoleProfile(page, [
    { role: ROLE_1, rows: STUB_ROWS },
    { role: ROLE_2, rows: [makeRow(ROLE_2, BRAVO_SKILL)] },
  ])
  await page.goto('/')
  await enableCompareMode(page)
  await targetRoleSelect(page, 0).selectOption(ROLE_1)
  await targetRoleSelect(page, 1).selectOption(ROLE_2)
}

async function submitSharedResume(page: Page): Promise<void> {
  await page.getByLabel('Resume text').fill(STUB_RESUME)
  await page.getByRole('button', { name: 'Find my gaps' }).click()
}

test.describe('Only the earliest active slot shows a checklist right after submit (spec 038c, oracle item 1)', () => {
  test("submitting in 2-panel compare mode shows exactly slot 0's checklist; slot 1 stays un-analyzed with no checklist, no donut", async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'expected exactly one skill-confirmation checklist on screen immediately after submit — ' +
        "App.tsx still calls submitResumeAutoConfirm for every panel (including panel 0) while " +
        'compareMode is true today, so no checklist ever renders in compare mode',
    ).toHaveCount(1, { timeout: 5_000 })
    await expect(
      comparisonColumn(page, ROLE_1).getByTestId(CHECKLIST_TESTID),
      "expected slot 0's own comparison column to contain the checklist",
    ).toHaveCount(1)

    const slot1 = comparisonColumn(page, ROLE_2)
    await expect(
      slot1.getByTestId(CHECKLIST_TESTID),
      'slot 1 must show no checklist while it is not yet its turn',
    ).toHaveCount(0)
    await expect(
      slot1.locator('.lg-donut-wrap'),
      'slot 1 must show no donut (unanalyzed) until its own checklist is confirmed',
    ).toHaveCount(0)
    // Slot 1 still shows its ordinary un-analyzed browsing view (role heading etc.) — no new
    // "waiting for its turn" placeholder UI is introduced by this SPEC.
    await expect(slot1.locator('.standing-root')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe("Confirming slot 0 with an edit advances the walk and reflects the edit (spec 038c, oracle item 2)", () => {
  test("unchecking an auto-detected skill on slot 0, then confirming, advances automatically to slot 1's checklist and shows the EDITED result for slot 0", async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })

    // Sanity on the starting (auto-detected) state before editing.
    await expect(checkboxFor(page, 'typescript')).toBeChecked()

    await checkboxFor(page, 'typescript').uncheck()
    await page.getByRole('button', { name: CONFIRM_BUTTON_NAME }).click()

    // Advances automatically to slot 1's checklist — never stalls, never skips it.
    const slot1 = comparisonColumn(page, ROLE_2)
    await expect(
      slot1.getByTestId(CHECKLIST_TESTID),
      "expected confirming slot 0 to automatically advance the walk to slot 1's checklist",
    ).toHaveCount(1, { timeout: 5_000 })
    await expect(page.getByTestId(CHECKLIST_TESTID)).toHaveCount(1)

    // Slot 0's column now shows analyzed results reflecting the EDITED set: typescript, unchecked,
    // must show as a gap even though extraction alone affirmed it.
    //
    // NOTE on locator shape: `has:`'s inner locator re-queries its FULL selector chain (including
    // its own root) as a descendant of each candidate row. An inner locator built from `slot0` (an
    // ancestor `region`-scoped locator) therefore requires a `region` element to appear INSIDE the
    // row — structurally impossible, since the region wraps the row, not the reverse — so it can
    // never match (verified empirically: `slot0.locator(sel, { has: slot0.getByText(...) })`
    // resolves to 0 elements against the real DOM). `.filter({ hasText })` has no such requirement:
    // the outer locator stays scoped to slot0's own column (so this genuinely asserts the row lives
    // in slot 0's table, not just "whichever table happens to be on screen"), and the substring
    // match is unambiguous for this fixture's skill names (no two STUB_ROWS names overlap as
    // substrings of one another). Mirrors skill-confirmation.spec.ts's page-scoped pattern, adapted
    // for a per-slot column scope.
    const slot0 = comparisonColumn(page, ROLE_1)
    const typescriptRow = slot0.locator('table.leverage-table tbody tr').filter({ hasText: 'typescript' })
    await expect(typescriptRow.locator('.lev-status')).toHaveAttribute('data-have', 'false')
    await expect(typescriptRow.locator('.lev-status-label')).toHaveText('Worth learning')

    // react was untouched — stays "already have", proving the edit is scoped to typescript only.
    const reactRow = slot0.locator('table.leverage-table tbody tr').filter({ hasText: 'react' })
    await expect(reactRow.locator('.lev-status')).toHaveAttribute('data-have', 'true')
  })
})

// spec 039a: the former "3-panel walk is strictly 0 -> 1 -> 2" test (oracle item 3) is deleted —
// there is no slot 2 to walk to anymore, and its unique claim (never 2+ checklists visible across
// a 3-long chain) is already fully subsumed by "exactly slot 0's checklist right after submit" and
// "confirming slot 0 ... advances to slot 1's checklist" above (both describe blocks preceding this
// comment) — no coverage is lost.

test.describe('"Back" abandons a later slot without touching an already-confirmed earlier slot (spec 038c, oracle item 4; adapted to a 2-slot cap by spec 039a)', () => {
  test('"Back" on slot 1\'s checklist leaves slot 0\'s confirmed result untouched and returns slot 1 to its un-analyzed view, with no checklist anywhere', async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // confirm slot 0 (unedited, auto-detected set)

    const slot1 = comparisonColumn(page, ROLE_2)
    await expect(slot1.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: 'Back' }).click()

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'expected no checklist anywhere after "Back" on slot 1',
    ).toHaveCount(0, { timeout: 5_000 })

    // Slot 0's already-confirmed result is untouched.
    // See oracle item 2's comment above for why `.filter({ hasText })` replaces `has:` here: a
    // region-scoped `has:` inner locator can never match a descendant row (structurally backwards).
    const slot0 = comparisonColumn(page, ROLE_1)
    await expect(slot0.locator('.lg-donut-wrap')).toBeVisible()
    const reactRow = slot0.locator('table.leverage-table tbody tr').filter({ hasText: 'react' })
    await expect(reactRow.locator('.lev-status')).toHaveAttribute('data-have', 'true')

    // Slot 1 falls back to its ordinary un-analyzed browsing view — no donut, no checklist, and no
    // new "abandoned" placeholder either.
    await expect(slot1.locator('.lg-donut-wrap')).toHaveCount(0)
    await expect(slot1.locator('.standing-root')).toBeVisible()
  })

  // spec 039a: the 2-slot equivalent of the deleted "Back on slot 1 abandons slot 2" case — the
  // only place `handleCancelConfirmationCompare`'s `laterSlot > slot` filter can still be observed
  // with a 2-slot cap, since Back on slot 1 (the last slot) never has a later slot to abandon.
  test('"Back" on slot 0\'s checklist, before confirming anything, abandons slot 1\'s already-staged draft too', async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    // Slot 1 already has its own staged draft in the background (both active slots' submitResume
    // fire together on submit — only slot 0's checklist is shown first, per oracle item 1).
    await expect(page.getByTestId(CHECKLIST_TESTID)).toHaveCount(1, { timeout: 5_000 })
    await expect(comparisonColumn(page, ROLE_1).getByTestId(CHECKLIST_TESTID)).toHaveCount(1)

    await page.getByRole('button', { name: 'Back' }).click()

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'expected no checklist anywhere after "Back" on slot 0, before anything was confirmed — ' +
        "slot 1's already-staged draft must be abandoned too, not silently promoted to the new " +
        'earliest-pending slot',
    ).toHaveCount(0, { timeout: 5_000 })

    const slot0 = comparisonColumn(page, ROLE_1)
    await expect(slot0.locator('.lg-donut-wrap')).toHaveCount(0)
    await expect(slot0.locator('.standing-root')).toBeVisible()

    const slot1 = comparisonColumn(page, ROLE_2)
    await expect(
      slot1.getByTestId(CHECKLIST_TESTID),
      "slot 1's checklist must never surface — its staged draft was abandoned along with slot 0's",
    ).toHaveCount(0)
    await expect(slot1.locator('.lg-donut-wrap')).toHaveCount(0)
    await expect(slot1.locator('.standing-root')).toBeVisible()
  })
})

test.describe('Toggling compare mode off mid-sequence collapses cleanly (spec 038c, oracle item 5)', () => {
  test('turning off "Compare roles" while slot 1\'s checklist is showing collapses to the single-panel view of slot 0\'s own state, with no orphaned checklist and no crash', async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // confirm slot 0

    await expect(comparisonColumn(page, ROLE_2).getByTestId(CHECKLIST_TESTID)).toBeVisible({
      timeout: 5_000,
    })

    await compareToggle(page).click() // toggle "Compare roles" off mid-sequence

    await expect(
      page.locator('.compare-grid'),
      'expected compare mode to fully collapse (.compare-grid gone) once toggled off',
    ).toHaveCount(0, { timeout: 5_000 })
    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'expected no orphaned checklist to survive the collapse to single-panel mode',
    ).toHaveCount(0)

    // Slot 0's own confirmed state shows directly, single-panel — no crash, no blank page.
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(page.locator('.lg-donut-wrap')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Find the skills worth learning first' }),
      'the app shell must still be intact (no crash) after collapsing mid-sequence',
    ).toBeVisible()
  })
})

test.describe('The compare-mode-confirmed edit survives a reload via the existing single-panel persistence path (spec 038c, oracle item 6)', () => {
  test('confirming slot 0 with an edited set in compare mode, then reloading, shows the confirmed/edited result directly in single-panel mode with no fresh checklist', async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await checkboxFor(page, 'typescript').uncheck()
    await page.getByRole('button', { name: CONFIRM_BUTTON_NAME }).click()

    // Leave slot 1 mid-sequence deliberately — compareMode/slot 1 are session-only and reset on
    // reload regardless (spec 036/038c Q2), so this must not matter to the outcome.
    await expect(comparisonColumn(page, ROLE_2).getByTestId(CHECKLIST_TESTID)).toBeVisible({
      timeout: 5_000,
    })

    // Stub must still be in place after reload — a fresh navigation refetches the role profile.
    await stubMultiRoleProfile(page, [{ role: ROLE_1, rows: STUB_ROWS }])
    await page.reload()

    await expect(
      page.locator('.compare-grid'),
      'compareMode always resets to false on load (spec 036) — no compare grid should reappear',
    ).toHaveCount(0)
    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'a fresh checklist must NOT reappear — the confirmed set already round-tripped through localStorage',
    ).toHaveCount(0, { timeout: 5_000 })

    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    const typescriptRow = page.locator('table.leverage-table tbody tr', {
      has: page.getByText('typescript', { exact: true }),
    })
    await expect(
      typescriptRow.locator('.lev-status'),
      'reload must redisplay the CONFIRMED/edited set (typescript unchecked -> gap)',
    ).toHaveAttribute('data-have', 'false')
  })
})

// a11y fix (non-blocking finding from spec 038b's audit, covering the compare-mode sequencing case
// added by spec 038c): when the walk advances to the next active slot's checklist, focus must move
// to THAT checklist's own heading too — not just slot 0's, the only transition
// skill-confirmation.spec.ts's own equivalent block can exercise. Exactly one checklist is ever
// rendered app-wide at a time (this file's own established invariant — see `checkboxFor`'s comment
// above), so its heading text is the same regardless of which slot's turn it is.
test.describe("Focus moves to each newly-advanced slot's checklist heading (a11y fix, spec 038c sequencing)", () => {
  test("confirming slot 0 advances the walk to slot 1's checklist, and focus moves to slot 1's checklist heading", async ({
    page,
  }) => {
    await setupTwoSlotCompare(page)
    await submitSharedResume(page)

    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // confirm slot 0 -> advances to slot 1's checklist

    await expect(comparisonColumn(page, ROLE_2).getByTestId(CHECKLIST_TESTID)).toBeVisible({
      timeout: 5_000,
    })
    await expect(
      page.getByRole('heading', { name: 'Confirm what you already know' }),
      "expected focus to move to slot 1's own checklist heading once the walk advances to it",
    ).toBeFocused({ timeout: 5_000 })
  })
})
