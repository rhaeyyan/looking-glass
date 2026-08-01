import { expect, test, type Page } from '@playwright/test'
import { confirmSkillChecklist, makeRow, reportsHover, stubMultiRoleProfile } from './support/app'
// Ground truth for what extraction alone auto-detects — the real, unmodified functions the runtime
// uses, never a hand-waved/hardcoded expected set. Mirrors skill-confirmation.spec.ts's convention.
import { extractResumeSkills } from '../src/lib/resumeSkills'

/**
 * specs/040b-single-panel-skill-carryover.md — RED-phase oracle for the shared
 * cross-role/cross-panel `confirmedSkillMemory` (spec 040a, already merged and unconsumed) actually
 * being wired into single-panel mode's (`compareMode === false`, slot 0) checklist step.
 *
 * Nothing this file depends on is wired up yet:
 *   - `frontend/src/lib/confirmedSkillMemory.ts` exists and is unit-tested (spec 040a), but `App.tsx`
 *     does not import it, has no `confirmedSkillMemory` state, no `checklistInitialKeys` state, and
 *     no `useLayoutEffect` gating the checklist on prior cross-role decisions.
 *   - `App.tsx`'s single-panel checklist call site still passes
 *     `autoDetectedKeys={panels[0].pendingConfirmation.autoDetectedKeys}` straight through — a
 *     role's pre-check state is 100% fresh `extractResumeSkills` output today, regardless of any
 *     decision recorded for that same skill under a previously-confirmed role.
 *   - There is no skip path at all: every `pendingConfirmation`, however fully a role's vocabulary
 *     was already decided under an earlier role, always renders the checklist.
 *
 * So, precisely:
 *   - Assertions expecting a carried-over "don't have" (memory `false`) to beat a fresh
 *     auto-detected "present" are expected to fail — today's checkbox will render CHECKED (raw
 *     extraction), not unchecked.
 *   - Assertions expecting a fully-covered role to skip the checklist entirely
 *     (`toHaveCount(0)`) are expected to fail as a timeout — today's checklist always renders
 *     (count stays 1), so it never reaches 0.
 *   - Assertions expecting a fully-covered role's results to reflect an OLD confirmed decision
 *     across a resume edit are expected to fail — today's checklist re-derives purely from the
 *     EDITED resume's fresh extraction (or, more visibly, the checklist appears in the first place
 *     when it should have been skipped).
 *
 * None of this is a locator typo or a wrong assumption about pre-040b behavior — every locator here
 * (`data-testid="skill-confirmation-checklist"`, one `role="checkbox"` per vocabulary row named
 * `skill_name_raw`, `role="button"` "Confirm skills") is the exact, already-shipped selector
 * contract spec 038b established and this task's SPEC deliberately leaves untouched (040b only
 * renames the `autoDetectedKeys` prop to `initialCheckedKeys` — a prop name, not a selector).
 *
 * Verification Oracle (per SPEC): this file @ desktop-light, @ mobile-touch-dark.
 */

const CHECKLIST_TESTID = 'skill-confirmation-checklist'

// ---- Compact fixture roles (SPEC's own suggested shape) -----------------------------------------
// All four are real `role_family` values from `lib/roles.ts`'s ROLES list (the role `<select>`
// only ever offers those 15 strings as options).
const ROLE_A = 'Backend' // {python, sql, docker}
const ROLE_B = 'Frontend' // {python, aws, docker} — partial overlap with A
const ROLE_C = 'Full Stack' // {python, docker} — a strict subset, fully covered by A alone
const ROLE_D = 'Data Engineer' // {sql, aws, kubernetes} — multi-hop target, never visited directly

const ROWS_A = [makeRow(ROLE_A, 'python'), makeRow(ROLE_A, 'sql'), makeRow(ROLE_A, 'docker')]
const ROWS_B = [makeRow(ROLE_B, 'python'), makeRow(ROLE_B, 'aws'), makeRow(ROLE_B, 'docker')]
const ROWS_C = [makeRow(ROLE_C, 'python'), makeRow(ROLE_C, 'docker')]
const ROWS_D = [makeRow(ROLE_D, 'sql'), makeRow(ROLE_D, 'aws'), makeRow(ROLE_D, 'kubernetes')]

const VOCAB_A = ROWS_A.map((row) => row.skill_name_raw)
const VOCAB_B = ROWS_B.map((row) => row.skill_name_raw)
const VOCAB_D = ROWS_D.map((row) => row.skill_name_raw)

// ---- Resume texts, each crafted to mention (or deliberately omit) specific vocabulary words -----
// mentions python, docker, aws — NOT sql. Used unedited across role A then role B, so role B's own
// fresh extraction genuinely WOULD affirm "docker" (the fixture for the memory-beats-extraction
// assertion), and genuinely WOULD affirm "aws" too (the fixture for the no-memory-entry fallback
// assertion actually differing from a coincidental false).
const RESUME_AB =
  'Backend engineer experienced with Python services, Docker containers, and AWS infrastructure. ' +
  'Comfortable owning deployments end to end.'

// mentions sql only.
const RESUME_SQL_ONLY = 'Backend developer who spends most days writing SQL queries against the warehouse.'

// mentions aws only.
const RESUME_AWS_ONLY = 'Frontend generalist who recently began deploying services on AWS for side projects.'

// mentions none of python/sql/docker/aws/kubernetes — used to prove a carried-over decision
// survives even when the CURRENT resume no longer mentions the skill at all.
const RESUME_NEITHER = 'Career changer preparing a fresh resume before applying to new roles.'

// mentions python, docker — NOT sql.
const RESUME_INITIAL = 'Backend engineer experienced with Python services and Docker containers.'

// mentions none of python/sql/docker/aws/kubernetes.
const RESUME_EDITED_BLANK = 'Recently transitioned into engineering, still building foundational experience.'

// ---- Ground truth, computed against the REAL extraction logic, not hand-waved. -------------------
const EXTRACTED_AB_A = new Set(extractResumeSkills(RESUME_AB, VOCAB_A))
const EXTRACTED_AB_B = new Set(extractResumeSkills(RESUME_AB, VOCAB_B))
const EXTRACTED_SQLONLY_A = new Set(extractResumeSkills(RESUME_SQL_ONLY, VOCAB_A))
const EXTRACTED_AWSONLY_B = new Set(extractResumeSkills(RESUME_AWS_ONLY, VOCAB_B))
const EXTRACTED_NEITHER_D = new Set(extractResumeSkills(RESUME_NEITHER, VOCAB_D))
const EXTRACTED_INITIAL_A = new Set(extractResumeSkills(RESUME_INITIAL, VOCAB_A))
const EXTRACTED_EDITEDBLANK_A = new Set(extractResumeSkills(RESUME_EDITED_BLANK, VOCAB_A))
const EXTRACTED_EDITEDBLANK_B = new Set(extractResumeSkills(RESUME_EDITED_BLANK, VOCAB_B))

test('fixture sanity: real extractResumeSkills output for every (resume, role-vocabulary) pair used below', () => {
  expect([...EXTRACTED_AB_A].sort(), 'RESUME_AB against role A\'s {python, sql, docker}').toEqual([
    'docker',
    'python',
  ])
  expect([...EXTRACTED_AB_B].sort(), 'RESUME_AB against role B\'s {python, aws, docker}').toEqual([
    'aws',
    'docker',
    'python',
  ])
  expect([...EXTRACTED_SQLONLY_A].sort(), 'RESUME_SQL_ONLY against role A').toEqual(['sql'])
  expect([...EXTRACTED_AWSONLY_B].sort(), 'RESUME_AWS_ONLY against role B').toEqual(['aws'])
  expect([...EXTRACTED_NEITHER_D].sort(), 'RESUME_NEITHER against role D').toEqual([])
  expect([...EXTRACTED_INITIAL_A].sort(), 'RESUME_INITIAL against role A').toEqual(['docker', 'python'])
  expect([...EXTRACTED_EDITEDBLANK_A].sort(), 'RESUME_EDITED_BLANK against role A').toEqual([])
  expect([...EXTRACTED_EDITEDBLANK_B].sort(), 'RESUME_EDITED_BLANK against role B').toEqual([])
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

/** Switches slot 0's role via the single-panel "Target role" picker, and waits for the new role's
 * own rows to have actually loaded (`.lg-results-head`, RoleResultsPanel's own header — rendered as
 * soon as `status === 'success' && rows.length > 0 && !pendingConfirmation`) before returning, so a
 * subsequent "Find my gaps" click never races a still-empty `rows` state (the exact hazard
 * persistence.spec.ts's own role-switch step already guards against). */
async function selectRole(page: Page, role: string): Promise<void> {
  await page.getByLabel('Target role').selectOption(role)
  await page.locator('.lg-results-head').waitFor({ state: 'visible' })
}

async function findMyGaps(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Find my gaps' }).click()
}

/** Scoped to whichever checklist is currently on screen — safe because exactly one ever renders at
 * a time in single-panel mode (this file never touches compare mode). */
function checkboxFor(page: Page, skillName: string) {
  return page.getByTestId(CHECKLIST_TESTID).getByRole('checkbox', { name: skillName, exact: true })
}

function leverageRow(page: Page, skillName: string) {
  return page.locator('table.leverage-table tbody tr', { has: page.getByText(skillName, { exact: true }) })
}

test.describe('Partial-overlap pre-check beats fresh auto-detection, full coverage auto-skips with a zero-wait assertion (spec 040b, oracle items 1-2)', () => {
  test('role A confirmed with an edit carries into role B as memory-driven pre-check state; role C (fully covered by role A alone) never renders a checklist', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: ROLE_A, rows: ROWS_A },
      { role: ROLE_B, rows: ROWS_B },
      { role: ROLE_C, rows: ROWS_C },
    ])
    await page.goto('/')

    await selectRole(page, ROLE_A)
    await page.getByLabel('Resume text').fill(RESUME_AB)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })

    // Sanity on role A's own auto-detected pre-check state before any edit.
    await expect(checkboxFor(page, 'python')).toBeChecked()
    await expect(checkboxFor(page, 'docker')).toBeChecked()
    await expect(checkboxFor(page, 'sql')).not.toBeChecked()

    // Edit: uncheck the auto-detected "docker" (an explicit "don't have," overriding extraction);
    // leave the never-mentioned "sql" unchecked as-is (Done-means #3/#6: both a checked-off
    // auto-detected skill AND an untouched never-mentioned skill are real, sticky user decisions).
    await checkboxFor(page, 'docker').uncheck()
    await confirmSkillChecklist(page)
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // ---- Oracle item 1 -----------------------------------------------------------------------
    // Switch to role B — partial overlap with A (python, docker shared; aws is new). Resubmit the
    // SAME, unedited resume: RESUME_AB still mentions "Docker", so role B's own fresh extraction
    // alone WOULD affirm docker as present.
    await selectRole(page, ROLE_B)
    await findMyGaps(page)

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'role B is only partially covered by role A\'s memory (aws has no entry yet) — the checklist ' +
        'must still render, not auto-skip',
    ).toBeVisible({ timeout: 5_000 })

    await expect(
      checkboxFor(page, 'docker'),
      'role A explicitly recorded docker=false; that carried-over decision must win over role B\'s ' +
        'own fresh auto-detection, which (RESUME_AB still mentions "Docker") would otherwise check it',
    ).not.toBeChecked()
    await expect(
      checkboxFor(page, 'python'),
      'role A recorded python=true; must carry over into role B',
    ).toBeChecked()
    await expect(
      checkboxFor(page, 'aws'),
      'aws has no memory entry yet (never decided under any prior role) — must fall back to fresh ' +
        'auto-detection, which affirms it (RESUME_AB mentions "AWS")',
    ).toBeChecked()

    // Confirm role B unedited — accepts the pre-checked merge as-is (python, aws checked; docker not).
    await confirmSkillChecklist(page)
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // ---- Oracle item 2 -----------------------------------------------------------------------
    // Switch to role C — {python, docker}, both already decided by role A alone (python=true,
    // docker=false). Resubmitting must never show a checklist at all, not even for one frame.
    await selectRole(page, ROLE_C)
    await findMyGaps(page)

    // Zero-wait assertion (SPEC's own framing): no `page.waitForTimeout()` precedes this check. The
    // useLayoutEffect-driven auto-skip (once implemented) runs synchronously before paint, so this
    // assertion must already read count 0 on its very first poll — not "eventually" within
    // Playwright's default retry window.
    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'role C ({python, docker}) is fully covered by memory alone — the checklist must never ' +
        'render, not even for one frame',
    ).toHaveCount(0)

    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(page.locator('.lg-donut-wrap')).toBeVisible()

    await expect(leverageRow(page, 'python').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRow(page, 'python').locator('.lev-status-label')).toHaveText('Already have')
    await expect(leverageRow(page, 'docker').locator('.lev-status')).toHaveAttribute('data-have', 'false')
    await expect(leverageRow(page, 'docker').locator('.lev-status-label')).toHaveText('Worth learning')
  })
})

test.describe('Multi-hop carryover across a role visited directly, skipping the intermediate role entirely (spec 040b, oracle item 3)', () => {
  test('a role never visited before still carries decisions made 2 roles and 1 role back, even after the resume no longer mentions either skill', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: ROLE_A, rows: ROWS_A },
      { role: ROLE_B, rows: ROWS_B },
      { role: ROLE_D, rows: ROWS_D },
    ])
    await page.goto('/')

    // Confirm role A with a resume mentioning ONLY "sql" — records sql=true, python=false,
    // docker=false ("sql" is the A-only-confirmed skill this test tracks).
    await selectRole(page, ROLE_A)
    await page.getByLabel('Resume text').fill(RESUME_SQL_ONLY)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // unedited: checked = auto-detected = {sql}
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // Switch to role B, edit the resume to mention ONLY "aws" this time, and confirm unedited —
    // records aws=true ("aws" is the B-only-confirmed skill this test tracks). python/docker get
    // re-recorded false (unchanged from role A's own decision, since RESUME_AWS_ONLY mentions
    // neither).
    await selectRole(page, ROLE_B)
    await page.getByLabel('Resume text').fill(RESUME_AWS_ONLY)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page) // unedited: checked = auto-detected = {aws}
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // Switch DIRECTLY to role D ({sql, aws, kubernetes}) — a role never visited in this session, and
    // not "the immediately previous role" (that's role B) for either decided skill: sql was decided
    // 2 roles back (under role A), aws 1 role back (under role B). Also edit the resume to mention
    // NEITHER sql NOR aws NOR kubernetes at all, so the ONLY way either can render checked is via
    // carried-over memory, never coincidental fresh re-detection.
    await selectRole(page, ROLE_D)
    await page.getByLabel('Resume text').fill(RESUME_NEITHER)
    await findMyGaps(page)

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'role D has an undecided skill (kubernetes) — must merge-and-show, not auto-skip',
    ).toBeVisible({ timeout: 5_000 })

    await expect(
      checkboxFor(page, 'sql'),
      'sql was confirmed true 2 roles back (under role A) — must carry over into role D even though ' +
        'the CURRENT resume no longer mentions "sql" at all',
    ).toBeChecked()
    await expect(
      checkboxFor(page, 'aws'),
      'aws was confirmed true 1 role back (under role B) — must carry over into role D even though ' +
        'the CURRENT resume no longer mentions "aws" at all',
    ).toBeChecked()
    await expect(
      checkboxFor(page, 'kubernetes'),
      'kubernetes has no memory entry anywhere and is not mentioned in the current resume — must ' +
        'render unchecked, per fresh auto-detection',
    ).not.toBeChecked()
  })
})

test.describe('Resume-edit survival: a fully-covered role locks in permanently; an undecided skill in a partially-covered role still tracks fresh edits (spec 040b, oracle item 4)', () => {
  test('editing the resume without changing role never reopens role A\'s checklist and never overwrites its carried decisions; role B\'s still-undecided skill keeps responding to the edit', async ({
    page,
  }) => {
    await stubMultiRoleProfile(page, [
      { role: ROLE_A, rows: ROWS_A },
      { role: ROLE_B, rows: ROWS_B },
    ])
    await page.goto('/')

    // Confirm role A unedited: RESUME_INITIAL affirms python + docker, not sql.
    // Records python=true, docker=true, sql=false.
    await selectRole(page, ROLE_A)
    await page.getByLabel('Resume text').fill(RESUME_INITIAL)
    await findMyGaps(page)
    await expect(page.getByTestId(CHECKLIST_TESTID)).toBeVisible({ timeout: 5_000 })
    await confirmSkillChecklist(page)
    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })

    // Edit the resume (role UNCHANGED) to a text that mentions NONE of role A's vocabulary at all,
    // then resubmit for the SAME role. Role A's full vocabulary {python, sql, docker} is already
    // 100% memory-covered, so this must auto-skip regardless of the edit (permanent lock-in,
    // documented Edge Case) — and, crucially, the results must still reflect the ORIGINAL confirmed
    // decision (python/docker = have), not a re-derivation from the edited resume's fresh extraction
    // (which mentions neither and would show both as gaps).
    await page.getByLabel('Resume text').fill(RESUME_EDITED_BLANK)
    await findMyGaps(page)

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'role A is fully covered by memory alone — resubmitting after a resume edit must still ' +
        'auto-skip the checklist, never reopen it',
    ).toHaveCount(0)

    await page.locator('table.leverage-table tbody tr').first().waitFor({ state: 'visible' })
    await expect(
      leverageRow(page, 'python').locator('.lev-status'),
      'the edited resume no longer mentions "python" at all — if this read "false" it would prove ' +
        'the app re-ran fresh extraction instead of using the carried-over confirmed decision',
    ).toHaveAttribute('data-have', 'true')
    await expect(leverageRow(page, 'docker').locator('.lev-status')).toHaveAttribute('data-have', 'true')
    await expect(leverageRow(page, 'sql').locator('.lev-status')).toHaveAttribute('data-have', 'false')

    // Switch to role B — python/docker already decided (true) by role A; aws still undecided.
    // Resume is still RESUME_EDITED_BLANK (mentions nothing), so aws's fresh auto-detection is
    // false too, for now.
    await selectRole(page, ROLE_B)
    await findMyGaps(page)

    await expect(
      page.getByTestId(CHECKLIST_TESTID),
      'role B has an undecided skill (aws) — must merge-and-show, not auto-skip',
    ).toBeVisible({ timeout: 5_000 })
    await expect(checkboxFor(page, 'python'), 'carried over from role A').toBeChecked()
    await expect(checkboxFor(page, 'docker'), 'carried over from role A').toBeChecked()
    await expect(
      checkboxFor(page, 'aws'),
      'no memory entry, and the current resume does not mention "aws" — unchecked per fresh detection',
    ).not.toBeChecked()

    // Now edit the resume AGAIN, while this same checklist is still open (never confirmed), to a
    // text that DOES mention "aws" — then resubmit for the SAME role B without changing the role.
    // The already-decided python/docker must stay exactly as carried over; only aws — the one
    // skill with no memory entry — may respond to the edit.
    await page.getByLabel('Resume text').fill(RESUME_AWS_ONLY)
    await findMyGaps(page)

    await expect(page.getByTestId(CHECKLIST_TESTID)).toHaveCount(1)
    await expect(
      checkboxFor(page, 'python'),
      'python is already decided (true) — must stay checked across the resubmission, unaffected ' +
        'by the resume edit',
    ).toBeChecked()
    await expect(
      checkboxFor(page, 'docker'),
      'docker is already decided (true) — must stay checked across the resubmission, unaffected ' +
        'by the resume edit',
    ).toBeChecked()
    await expect(
      checkboxFor(page, 'aws'),
      'aws has no memory entry — the resume edit (now mentioning "AWS") must flip its fresh ' +
        'auto-detection from unchecked to checked',
    ).toBeChecked()
  })
})
