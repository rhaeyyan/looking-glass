import { expect, test, type Locator, type Page } from '@playwright/test'
import { confirmSkillChecklist, makeRow, reportsHover, stubMultiRoleProfile } from './support/app'
// Ground truth for what extraction alone auto-detects — the real, unmodified functions the runtime
// uses, never a hand-waved/hardcoded expected set. Mirrors skill-confirmation.spec.ts's convention,
// same as compare-confirmation.spec.ts (038c) and cross-role-skill-carryover.spec.ts (040b).
import { extractResumeSkills } from '../src/lib/resumeSkills'

/**
 * specs/040c-compare-mode-skill-carryover.md — RED-phase oracle for wiring spec 040a's shared
 * `confirmedSkillMemory` into compare mode's SLOT 1 checklist (the compare-grid's own, separate
 * checklist JSX block), and for resolving the SPEC's flagged "trickiest interaction": a
 * fully-covered panel must never block, or even momentarily appear in, the sequential 0->1
 * confirmation walk, AND a same-batch submission where slot 0's confirmation newly completes
 * coverage of a skill slot 1's checklist also needs must let slot 1 benefit from that BEFORE slot
 * 1's checklist is ever shown to the user.
 *
 * Nothing this file depends on is wired up yet, precisely:
 *   - `App.tsx`'s compare-grid checklist JSX block (the `slot === confirmationSlot` branch, shared
 *     by BOTH slot 0 and slot 1) still passes
 *     `initialCheckedKeys={panels[slot].pendingConfirmation.autoDetectedKeys}` — the raw,
 *     un-merged auto-detected set — for BOTH slots. Slot 0 happens to auto-skip correctly already
 *     (spec 040b's slot-0 layout effect is unconditional on `compareMode`), but slot 1 has NO
 *     layout effect of its own at all: its checklist, when it renders, always shows fresh
 *     extraction only, never a carried-over decision, and a fully-covered slot 1 never auto-skips.
 *   - There is no cross-panel same-batch sharing: slot 0's `confirmedSkillMemory` update (which
 *     already happens correctly today, since compare-mode slot 0 reuses the unmodified
 *     `handleConfirmSkills`) has no effect on what slot 1's checklist shows, because slot 1's
 *     checklist never reads `confirmedSkillMemory` at all.
 *
 * So, precisely:
 *   - Assertions expecting slot 1's checklist to show a carried-over decision (from EITHER an
 *     earlier single-panel/compare-mode session OR the SAME batch's slot-0 confirmation) beating
 *     slot 1's own fresh auto-detection are expected to fail — today's checkbox renders per raw
 *     extraction only.
 *   - Assertions expecting a slot-1 role that is fully covered by memory alone to skip its
 *     checklist entirely (`toHaveCount(0)`) are expected to fail as a timeout — today's slot-1
 *     checklist always renders when it is slot 1's turn, regardless of memory coverage.
 *
 * None of this is a locator typo or a wrong assumption about pre-040c behavior — every locator
 * here (`data-testid="skill-confirmation-checklist"`, one `role="checkbox"` per vocabulary row
 * named `skill_name_raw`, `role="button"` "Confirm skills") is the exact, already-shipped selector
 * contract spec 038b established and this task's SPEC deliberately leaves untouched.
 *
 * Local helpers (`comparisonColumn`/`checkboxFor`/`compareToggle`/`targetRoleSelect`) mirror
 * `compare-confirmation.spec.ts`'s own file-local pattern verbatim (per SPEC — not promoted, same
 * as that file's own established convention for these particular helpers).
 *
 * Verification Oracle (per SPEC): this file @ desktop-light, @ mobile-touch-dark. Regression guards
 * (SPEC oracle item 5) — `compare-confirmation.spec.ts` and `cross-role-skill-carryover.spec.ts` —
 * are re-run unmodified, not duplicated here.
 */

const CHECKLIST_TESTID = 'skill-confirmation-checklist'
const CONFIRM_BUTTON_NAME = 'Confirm skills'

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

// ---- Local helpers, mirroring compare-confirmation.spec.ts's own file-local pattern verbatim ----

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

async function findMyGaps(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Find my gaps' }).click()
}

/** Single-panel role switch. Waits for the new role's own results header before returning, so a
 * subsequent submit never races a still-empty `rows` state — mirrors
 * cross-role-skill-carryover.spec.ts's own `selectRole` (spec 040b) verbatim. */
async function selectRole(page: Page, role: string): Promise<void> {
  await page.getByLabel('Target role').selectOption(role)
  await page.locator('.lg-results-head').waitFor({ state: 'visible' })
}

/** Compare mode's per-slot equivalent of `selectRole` above: waits for THAT slot's own comparison
 * column to show its ordinary un-analyzed browsing view (`.standing-root`, compare-confirmation.spec.ts's
 * own marker for "loaded, not yet submitted") before returning — needed here because slot 0 in
 * particular is switched mid-test, away from whatever role a single-panel-mode pre-seed step left
 * it on, and a subsequent shared-resume submit must never race a still-empty `rows` state for the
 * slot that was just switched. */
async function selectCompareRole(page: Page, slot: number, role: string): Promise<void> {
  await targetRoleSelect(page, slot).selectOption(role)
  await comparisonColumn(page, role).locator('.standing-root').waitFor({ state: 'visible' })
}

/** Column-scoped leverage-table row lookup. `.filter({ hasText })`, not `{ has: ... }` — an inner
 * locator built from a `region`-scoped ancestor locator can never match a descendant row
 * (structurally backwards: `has:` re-queries its FULL chain, including its own root, as a
 * descendant of the candidate row). Mirrors compare-confirmation.spec.ts's own documented
 * reasoning (spec 038c, oracle item 2's comment) verbatim, not re-derived here. */
function leverageRowIn(container: Locator, skillName: string): Locator {
  return container.locator('table.leverage-table tbody tr').filter({ hasText: skillName })
}

// ---- Fixture roles, per scenario. All role_family values are real ROLES entries (lib/roles.ts) --

// ---- Scenario 1 (oracle items 1 & 4): the trickiest interaction, plus isolation -----------------
const T1_ROLE_PRESEED = 'Backend' // {python, sql, docker} — confirmed BEFORE compare mode starts
const T1_ROLE_COVERED = 'Software Engineer' // {python, docker} — subset of T1_ROLE_PRESEED's vocab
const T1_ROLE_FRESH = 'DevOps / Cloud / SRE' // {sql, aws} — never visited; sql overlaps & is
// already decided (false); aws is undecided

const T1_ROWS_PRESEED = [
  makeRow(T1_ROLE_PRESEED, 'python'),
  makeRow(T1_ROLE_PRESEED, 'sql'),
  makeRow(T1_ROLE_PRESEED, 'docker'),
]
const T1_ROWS_COVERED = [makeRow(T1_ROLE_COVERED, 'python'), makeRow(T1_ROLE_COVERED, 'docker')]
const T1_ROWS_FRESH = [makeRow(T1_ROLE_FRESH, 'sql'), makeRow(T1_ROLE_FRESH, 'aws')]

// Mentions python + docker, NOT sql — so the pre-seed confirm (unedited) records python=true,
// docker=true, sql=false.
const T1_RESUME_PRESEED =
  'Backend engineer who ships production Python services and manages Docker containers daily.'

// The SHARED compare-mode submit resume. Mentions SQL and AWS — NEITHER python nor docker, so
// slot 0's own results can only come from the CARRIED-OVER decision, never coincidental fresh
// re-detection. Mentioning "SQL" here is deliberate: role FRESH's own fresh auto-detection would
// affirm sql=true, which must lose to the already-recorded sql=false from role PRESEED.
const T1_RESUME_SHARED =
  'DevOps engineer with strong SQL reporting experience, now expanding into AWS infrastructure automation.'

// ---- Scenario 2 (oracle item 2): same-batch cross-panel sharing ---------------------------------
const T2_ROLE_A = 'Data Engineer' // {kubernetes, terraform}
const T2_ROLE_B = 'Mobile' // {kubernetes, graphql} — overlaps role A on "kubernetes"

const T2_ROWS_A = [makeRow(T2_ROLE_A, 'kubernetes'), makeRow(T2_ROLE_A, 'terraform')]
const T2_ROWS_B = [makeRow(T2_ROLE_B, 'kubernetes'), makeRow(T2_ROLE_B, 'graphql')]

// Mentions all three — kubernetes, terraform, graphql — so EVERY skill auto-detects true for
// whichever panel's vocabulary contains it. No memory exists yet for either role.
const T2_RESUME =
  'Platform engineer working daily with Kubernetes clusters, Terraform infrastructure as code, ' +
  'and GraphQL APIs for internal tooling.'

// ---- Scenario 3 (oracle items 3 & 4): both slots fully covered on one submit --------------------
const T3_ROLE_SEED_1 = 'Business Analyst' // {react, redis}
const T3_ROLE_SEED_2 = 'Security' // {typescript}
const T3_ROLE_G = 'Designer (UX/UI)' // {react, typescript} — both already decided (true, true)
const T3_ROLE_H = 'Product Manager' // {redis, typescript} — both already decided (false, true)

const T3_ROWS_SEED_1 = [makeRow(T3_ROLE_SEED_1, 'react'), makeRow(T3_ROLE_SEED_1, 'redis')]
const T3_ROWS_SEED_2 = [makeRow(T3_ROLE_SEED_2, 'typescript')]
const T3_ROWS_G = [makeRow(T3_ROLE_G, 'react'), makeRow(T3_ROLE_G, 'typescript')]
const T3_ROWS_H = [makeRow(T3_ROLE_H, 'redis'), makeRow(T3_ROLE_H, 'typescript')]

// Mentions React only, NOT redis — pre-seed confirm (unedited) records react=true, redis=false.
const T3_RESUME_SEED_1 =
  'Business analyst who partners closely with engineering teams building React dashboards for stakeholders.'
// Mentions TypeScript — pre-seed confirm (unedited) records typescript=true.
const T3_RESUME_SEED_2 =
  'Security engineer maintaining internal tooling written in TypeScript for the incident response team.'
// Mentions NONE of react/redis/typescript — so if either slot's checklist rendered at all, it
// would prove the app is NOT relying on carried-over memory (a coincidental fresh-detection
// pass is impossible here by construction).
const T3_RESUME_COMPARE =
  'Product leader partnering with design and engineering to ship customer-facing features.'

test('fixture sanity: real extractResumeSkills output for every (resume, role-vocabulary) pair used below', () => {
  expect(
    [...extractResumeSkills(T1_RESUME_PRESEED, ['python', 'sql', 'docker'])].sort(),
    'T1_RESUME_PRESEED against role PRESEED\'s {python, sql, docker}',
  ).toEqual(['docker', 'python'])
  expect(
    [...extractResumeSkills(T1_RESUME_SHARED, ['sql', 'aws'])].sort(),
    "T1_RESUME_SHARED against role FRESH's {sql, aws}",
  ).toEqual(['aws', 'sql'])
  expect(
    [...extractResumeSkills(T1_RESUME_SHARED, ['python', 'docker'])].sort(),
    "T1_RESUME_SHARED against role COVERED's {python, docker} — must detect neither, so slot 0's " +
      'results can only come from carried-over memory, never coincidental fresh re-detection',
  ).toEqual([])

  expect(
    [...extractResumeSkills(T2_RESUME, ['kubernetes', 'terraform'])].sort(),
    "T2_RESUME against role A's {kubernetes, terraform}",
  ).toEqual(['kubernetes', 'terraform'])
  expect(
    [...extractResumeSkills(T2_RESUME, ['kubernetes', 'graphql'])].sort(),
    "T2_RESUME against role B's {kubernetes, graphql}",
  ).toEqual(['graphql', 'kubernetes'])

  expect(
    [...extractResumeSkills(T3_RESUME_SEED_1, ['react', 'redis'])].sort(),
    'T3_RESUME_SEED_1 against role SEED_1\'s {react, redis}',
  ).toEqual(['react'])
  expect(
    [...extractResumeSkills(T3_RESUME_SEED_2, ['typescript'])].sort(),
    'T3_RESUME_SEED_2 against role SEED_2\'s {typescript}',
  ).toEqual(['typescript'])
  expect(
    [...extractResumeSkills(T3_RESUME_COMPARE, ['react', 'typescript'])].sort(),
    "T3_RESUME_COMPARE against role G's {react, typescript} — must detect neither",
  ).toEqual([])
  expect(
    [...extractResumeSkills(T3_RESUME_COMPARE, ['redis', 'typescript'])].sort(),
    "T3_RESUME_COMPARE against role H's {redis, typescript} — must detect neither",
  ).toEqual([])
})

test.describe('The trickiest interaction: a self-completing slot 0 unblocks slot 1 immediately, and memory beats fresh auto-detection on a role visited for the first time (spec 040c, oracle items 1 & 4)', () => {
  test('slot 0 (fully memory-covered) shows no checklist and its results appear directly, while slot 1 (brand-new, one overlapping already-decided skill, one undecided) shows its checklist immediately with the carried-over decision winning, and neither panel leaks the other\'s rows', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: T1_ROLE_PRESEED, rows: T1_ROWS_PRESEED },
      { role: T1_ROLE_COVERED, rows: T1_ROWS_COVERED },
      { role: T1_ROLE_FRESH, rows: T1_ROWS_FRESH },
    ])
    await page.goto('/')

    // Pre-seed memory in single-panel mode, BEFORE compare mode is ever turned on.
    await selectRole(page, T1_ROLE_PRESEED)
    await page.getByLabel('Resume text').fill(T1_RESUME_PRESEED)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // unedited: python=true, docker=true, sql=false
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // Enable compare mode: slot 0 -> a role already 100% covered by memory alone; slot 1 -> a
    // role never visited before, with one already-decided (conflicting) skill and one undecided.
    await enableCompareMode(page)
    await selectCompareRole(page, 0, T1_ROLE_COVERED)
    await selectCompareRole(page, 1, T1_ROLE_FRESH)

    await page.getByLabel('Resume text').fill(T1_RESUME_SHARED)
    await findMyGaps(page)

    // ---- Oracle item 1: the trickiest interaction ---------------------------------------------
    await expect(
      comparisonColumn(page, T1_ROLE_FRESH).getByTestId(CHECKLIST_TESTID),
      'slot 1 has an undecided skill (aws) — its checklist must render immediately, never blocked ' +
        "waiting for \"slot 0's turn,\" which no longer exists once slot 0 self-completes",
    ).toHaveCount(1, { timeout: 5_000 })
    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      "exactly one checklist (slot 1's) should ever be on screen — slot 0 never painted one, not " +
        'even for one frame',
    ).toHaveCount(1)
    await expect(
      comparisonColumn(page, T1_ROLE_COVERED).getByTestId(CHECKLIST_TESTID),
      'slot 0 is fully covered by memory alone (python=true, docker=true, recorded under role ' +
        'PRESEED earlier this session) — its checklist must never render',
    ).toHaveCount(0)

    // Slot 0's results appear directly, reflecting the CARRIED-OVER decisions — T1_RESUME_SHARED
    // mentions neither python nor docker at all, so this cannot be coincidental fresh detection.
    const slot0 = comparisonColumn(page, T1_ROLE_COVERED)
    await slot0.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(leverageRowIn(slot0, 'python').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRowIn(slot0, 'docker').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    // ---- Oracle item 4 (isolation): slot 0's table is exactly its own 2-skill vocabulary -------
    await expect(
      slot0.locator('table.leverage-table tbody tr'),
      "slot 0's own rows must be exactly its own vocabulary — no leakage of slot 1's sql/aws rows",
    ).toHaveCount(2)

    // ---- The crux "real assertion" of oracle item 1: memory beats fresh auto-detection even on
    // a role visited for the very first time.
    await expect(
      checkboxFor(page, 'aws'),
      'aws has no memory entry — must fall back to fresh auto-detection, which affirms it ' +
        '(T1_RESUME_SHARED mentions "AWS")',
    ).toBeChecked()
    await expect(
      checkboxFor(page, 'sql'),
      'sql was already recorded false under role Backend earlier this session — that carried-over ' +
        "decision must beat slot 1's OWN fresh auto-detection, which (T1_RESUME_SHARED mentions " +
        '"SQL") would otherwise check it',
    ).not.toBeChecked()

    // Confirm slot 1 unedited, accepting the merged pre-check state as-is.
    await confirmSkillChecklist(page)
    const slot1 = comparisonColumn(page, T1_ROLE_FRESH)
    await slot1.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(leverageRowIn(slot1, 'aws').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRowIn(slot1, 'sql').locator('.lev-status')).toHaveAttribute('data-have', 'false')
    await expect(leverageRowIn(slot1, 'sql').locator('.lev-status-label')).toHaveText('Worth learning')
    // ---- Oracle item 4 (isolation): slot 1's table is exactly its own 2-skill vocabulary -------
    await expect(
      slot1.locator('table.leverage-table tbody tr'),
      "slot 1's own rows must be exactly its own vocabulary — no leakage of slot 0's python/docker rows",
    ).toHaveCount(2)
  })
})

test.describe("Same-batch cross-panel sharing: slot 0's just-confirmed decision benefits slot 1's checklist before it is ever shown, within a single submission (spec 040c, oracle item 2)", () => {
  test('unchecking an overlapping auto-detected skill on slot 0, then confirming, is reflected on slot 1\'s checklist the instant it appears — not a stale, pre-batch memory snapshot', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: T2_ROLE_A, rows: T2_ROWS_A },
      { role: T2_ROLE_B, rows: T2_ROWS_B },
    ])
    await page.goto('/')

    // No prior confirmations anywhere this session — memory starts genuinely empty.
    await enableCompareMode(page)
    await selectCompareRole(page, 0, T2_ROLE_A)
    await selectCompareRole(page, 1, T2_ROLE_B)

    await page.getByLabel('Resume text').fill(T2_RESUME)
    await findMyGaps(page)

    // Slot 0's checklist shows first (spec 038c, unmodified) — both of its skills auto-detected
    // true from the shared resume.
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await expect(checkboxFor(page, 'kubernetes')).toBeChecked()
    await expect(checkboxFor(page, 'terraform')).toBeChecked()

    // Edit: explicitly decide "kubernetes" is NOT had, overriding fresh auto-detection — the
    // decision slot 1's checklist must benefit from, from THIS SAME batch, before it is even shown.
    await checkboxFor(page, 'kubernetes').uncheck()
    await page.getByRole('button', { name: CONFIRM_BUTTON_NAME }).click()

    // ---- Oracle item 2: same-batch cross-panel sharing -----------------------------------------
    const slot1 = comparisonColumn(page, T2_ROLE_B)
    await expect(
      slot1.getByTestId(CHECKLIST_TESTID),
      "expected confirming slot 0 to automatically advance the walk to slot 1's checklist",
    ).toHaveCount(1, { timeout: 5_000 })
    await expect(page.getByTestId(CHECKLIST_TESTID)).toHaveCount(1)

    await expect(
      checkboxFor(page, 'kubernetes'),
      "slot 0's JUST-confirmed decision (kubernetes=false, made in THIS SAME submission) must win " +
        "over slot 1's own fresh auto-detection, which (the shared resume mentions \"Kubernetes\") " +
        'would otherwise check it — proving the sharing happens within one batch, not only across ' +
        'separate submissions',
    ).not.toBeChecked()
    await expect(
      checkboxFor(page, 'graphql'),
      'graphql has no memory entry (unique to role B) — must fall back to fresh auto-detection, ' +
        'which affirms it',
    ).toBeChecked()

    await confirmSkillChecklist(page)

    const slot0 = comparisonColumn(page, T2_ROLE_A)
    await slot0.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(leverageRowIn(slot0, 'terraform').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRowIn(slot0, 'kubernetes').locator('.lev-status')).toHaveAttribute('data-have', 'false')

    await slot1.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(leverageRowIn(slot1, 'graphql').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRowIn(slot1, 'kubernetes').locator('.lev-status')).toHaveAttribute('data-have', 'false')
    await expect(leverageRowIn(slot1, 'kubernetes').locator('.lev-status-label')).toHaveText('Worth learning')
  })
})

test.describe('Both slots fully covered by memory alone on one submit: neither checklist ever renders, and isolation holds (spec 040c, oracle items 3 & 4)', () => {
  test('two further, never-visited roles whose combined vocabulary is already 100% decided both skip the checklist on the same submit, each showing exactly its own carried-over results', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: T3_ROLE_SEED_1, rows: T3_ROWS_SEED_1 },
      { role: T3_ROLE_SEED_2, rows: T3_ROWS_SEED_2 },
      { role: T3_ROLE_G, rows: T3_ROWS_G },
      { role: T3_ROLE_H, rows: T3_ROWS_H },
    ])
    await page.goto('/')

    // Pre-seed memory across TWO single-panel confirmations, before compare mode is ever turned on.
    await selectRole(page, T3_ROLE_SEED_1)
    await page.getByLabel('Resume text').fill(T3_RESUME_SEED_1)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // unedited: react=true, redis=false
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    await selectRole(page, T3_ROLE_SEED_2)
    await page.getByLabel('Resume text').fill(T3_RESUME_SEED_2)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // unedited: typescript=true
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // Memory is now {react: true, redis: false, typescript: true}. Two FURTHER roles, never
    // visited directly, whose combined vocabulary is already fully covered by that memory alone.
    await enableCompareMode(page)
    await selectCompareRole(page, 0, T3_ROLE_G)
    await selectCompareRole(page, 1, T3_ROLE_H)

    await page.getByLabel('Resume text').fill(T3_RESUME_COMPARE)
    await findMyGaps(page)

    // ---- Oracle item 3: both slots fully covered on one submit ---------------------------------
    // Zero-wait framing (mirrors cross-role-skill-carryover.spec.ts's own oracle item 2): no
    // `page.waitForTimeout()` precedes this check. Once implemented, the useLayoutEffect-driven
    // auto-skip for BOTH slots runs synchronously before paint, so this must already read count 0
    // on its very first poll.
    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'both slots are fully covered by memory alone — neither checklist should ever render, not ' +
        'even for one frame',
    ).toHaveCount(0)

    const slot0 = comparisonColumn(page, T3_ROLE_G)
    await slot0.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(leverageRowIn(slot0, 'react').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRowIn(slot0, 'typescript').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    // ---- Oracle item 4 (isolation) --------------------------------------------------------------
    await expect(
      slot0.locator('table.leverage-table tbody tr'),
      "slot 0's own rows must be exactly its own 2-skill vocabulary — no leakage of slot 1's redis row",
    ).toHaveCount(2)

    const slot1 = comparisonColumn(page, T3_ROLE_H)
    await slot1.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(leverageRowIn(slot1, 'redis').locator('.lev-status')).toHaveAttribute('data-have', 'false')
    await expect(leverageRowIn(slot1, 'typescript').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(
      slot1.locator('table.leverage-table tbody tr'),
      "slot 1's own rows must be exactly its own 2-skill vocabulary — no leakage of slot 0's react row",
    ).toHaveCount(2)
  })
})
