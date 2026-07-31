import { expect, test } from '@playwright/test'
import { STUB_ROWS, stubRoleSkillProfile } from './support/app'

/**
 * Cypress audit finding — NOT part of either OBSERVABLE-lane a11y fix under review this round
 * (`scrollable-region-focusable` on `SkillLeverageTable`, and focus-on-mount for
 * `SkillConfirmationChecklist`/`RoleResultsPanel`). This pins a regression introduced BY the second
 * fix's implementation, which Magnolia's own code comment on `RoleResultsPanel.tsx` did not
 * disclose or scope for.
 *
 * `RoleResultsPanel.tsx` added `useEffect(() => headingRef.current?.focus(), [])` — empty deps,
 * "fires once per mount". The comment defends this firing on the component's very first mount
 * (right after picking a role, before any resume submit) as its own legitimate step-transition.
 * What it does NOT account for: because `App.tsx` renders `<LoadingSkeleton />` while
 * `panels[n].status === 'loading'` and only renders `<RoleResultsPanel>` again once a fetch
 * resolves back to `'success'`, EVERY role switch on an already-populated panel — not just the
 * first pick — unmounts and remounts `RoleResultsPanel` (React sees a different component type at
 * that JSX position: `LoadingSkeleton` -> `RoleResultsPanel`), which re-fires the mount effect and
 * steals focus from wherever the user currently is, asynchronously, well after the role-`<select>`
 * interaction that triggered it.
 *
 * This is disruptive exactly in the scenario named back to Magnolia during audit: a user who has
 * already moved on (e.g. started typing their resume, or is comparing several roles quickly via
 * the dropdown) gets yanked back to a heading they did not ask to look at, every single switch.
 *
 * Verification Oracle for this finding: this file, all 4 profiles (`desktop-light`,
 * `desktop-dark`, `mobile-touch-light`, `mobile-touch-dark`) — this is a DOM-focus claim, not a
 * hover/pointer-affordance one, so it is not profile-specific; run everywhere for the same reason
 * `skill-confirmation.spec.ts` runs its own focus assertions at both a desktop and a touch profile.
 */
test.describe('RoleResultsPanel mount-focus effect fires on every role switch, not just the first pick', () => {
  test('switching the target role while a panel is already showing steals focus from wherever the user currently is', async ({
    page,
  }) => {
    await stubRoleSkillProfile(page, STUB_ROWS)
    await page.goto('/')

    await page.getByLabel('Target role').selectOption('Frontend')
    await expect(page.getByRole('heading', { name: 'Frontend', exact: true })).toBeVisible()

    // Deliberately move focus somewhere else entirely, simulating a user who has moved on to the
    // next field after glancing at the first role's results.
    await page.getByLabel('Resume text').focus()
    await expect(page.getByLabel('Resume text')).toBeFocused()

    // Switch role — same stub data services any role_family, so only mount identity is at stake.
    await page.getByLabel('Target role').selectOption('Backend')
    await expect(page.getByRole('heading', { name: 'Backend', exact: true })).toBeVisible()

    // Expected (and currently failing): focus should NOT jump to the results heading merely
    // because the role changed while the user had focus elsewhere — only a genuine step
    // transition (checklist -> results, or the very first role pick) should move focus.
    await expect(
      page.getByLabel('Resume text'),
      'expected focus to remain on the field the user was actually using; got yanked to the ' +
        'new role heading instead',
    ).toBeFocused()
  })
})
