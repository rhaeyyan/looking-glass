import { useEffect, useRef, useState } from 'react'
import { ROLES } from './lib/roles'
import {
  savePersistedState,
  loadPersistedState,
  clearPersistedState,
  type ConfirmedFingerprint,
} from './lib/localPersistence'
import { useRolePanel, type UseRolePanelResult } from './lib/useRolePanel'
import { type SeniorityLevel } from './lib/seniorityFraming'
import { RoleResultsPanel } from './components/matrix/RoleResultsPanel'
import { SkillConfirmationChecklist } from './components/matrix/SkillConfirmationChecklist'

type Theme = 'light' | 'dark'

// Resume text is capped client-side to the edge function's own limit (spec 004, Task 6) so an
// oversized paste never round-trips to the server just to fail there.
const MAX_RESUME_LENGTH = 20000
const ROLE_REQUIRED_MESSAGE = 'Select a target role before finding your gaps.'
const RESUME_REQUIRED_MESSAGE = 'Paste your resume text before finding your gaps.'

function initialTheme(): Theme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** Shared idle-state placeholder (spec 009), reused verbatim by every rendered slot — single-panel
 * mode's slot 0 and every active compare-mode slot alike. Never carries slot-specific text: an
 * empty slot has no role picked yet, so there is nothing to qualify. */
function EmptyStateCard() {
  return (
    <section className="card blueprint elev-sm lg-empty-state">
      <div className="card-kicker">Get started</div>
      <div className="card-title">Your leverage matrix appears here</div>
      <p style={{ margin: 0, fontSize: '14px', opacity: 0.75 }}>
        Complete Step 1 — pick a target role — and this column fills in with the
        demand&nbsp;×&nbsp;scarcity matrix and ranked skill gaps for that role.
      </p>
    </section>
  )
}

/** Shared loading skeleton (spec 009), reused verbatim by every rendered slot. `aria-hidden` — the
 * one accessible loading announcement per slot lives in the Step 1 status paragraph, not here. */
function LoadingSkeleton() {
  return (
    <div className="lg-skeleton" aria-hidden="true">
      <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-standing" aria-hidden="true" />
      <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-evidence" aria-hidden="true" />
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // spec 034: read localStorage exactly once, synchronously, via a lazy initializer — captured
  // as state (not a plain const/ref) so React 18 StrictMode's dev-only double-invocation of the
  // component body is safe: both invocations perform the same pure, side-effect-free read, and
  // React keeps only one result. This also seeds selectedRole/resumeText/selectedSeniority below
  // directly at first render, so there is no separate "hydrate" effect racing against the
  // persist-on-change effect (an earlier two-effect version of this raced under StrictMode's
  // double-invoked effects: the persist effect could re-fire with stale pre-hydration state on
  // the extra invocation and clobber the just-seeded value before the hydration effect's state
  // updates had been rendered).
  const [persistedOnMount] = useState(() => loadPersistedState())

  // spec 036: `roleSlots[0]` plays exactly the role `selectedRole` used to play (only source of
  // truth for the controlled slot-0 `<select>`, and the only slot persistence still covers).
  // `roleSlots[1]`/`roleSlots[2]` are compare-mode-only, session-only (never persisted — SPEC's
  // Constraints), and start blank every load.
  const [roleSlots, setRoleSlots] = useState<[string, string, string]>(() => [
    persistedOnMount?.selectedRole ?? '',
    '',
    '',
  ])
  const [compareMode, setCompareMode] = useState(false)
  const [showThirdSlot, setShowThirdSlot] = useState(false)

  // spec 035/036: the entire rows/status/errorMessage/haveSkillKeys/topGaps/selectedGroup slice
  // for ONE role lives inside `useRolePanel`. Exactly 3 fixed, unconditional call sites — never
  // called inside a loop/condition — so this stays Rules-of-Hooks-safe regardless of how many
  // slots are currently shown. Each instance's `role` argument only ever seeds its *initial*
  // state (React's `useState(initialValue)` convention): every later role change for slot `i`
  // must go through `panels[i].loadRole(...)`, never by re-rendering with a new argument.
  const panel0 = useRolePanel(roleSlots[0])
  const panel1 = useRolePanel(roleSlots[1])
  const panel2 = useRolePanel(roleSlots[2])
  const panels: readonly [UseRolePanelResult, UseRolePanelResult, UseRolePanelResult] = [
    panel0,
    panel1,
    panel2,
  ]

  const [resumeText, setResumeText] = useState(() =>
    persistedOnMount ? persistedOnMount.resumeText.slice(0, MAX_RESUME_LENGTH) : '',
  )
  const [validationError, setValidationError] = useState('')
  // specs/029: local-only, plain <select> state — never touched by handleRoleChange, never
  // refetches, never feeds computeSkillGap/the matrix/the table. See seniorityNote below.
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | ''>(
    () => persistedOnMount?.selectedSeniority ?? '',
  )

  // spec 038b: the user's own explicit confirm-step choice — captured verbatim at the moment the
  // checklist's "Confirm skills" fires (see handleConfirmSkills below), never re-derived from
  // `panels[0].haveSkillKeys` afterward (that would couple persistence to a derived pipeline
  // output). Seeded from `persistedOnMount` exactly like resumeText/selectedSeniority above.
  // Never proactively nulled on a resumeText/role edit — `loadPersistedState()`'s own
  // fingerprint-mismatch check already discards a stale pair on the NEXT load, so App.tsx does not
  // need to duplicate that staleness logic here.
  const [confirmedSkillKeys, setConfirmedSkillKeys] = useState<string[] | null>(
    () => persistedOnMount?.confirmedSkillKeys ?? null,
  )
  const [confirmedFingerprint, setConfirmedFingerprint] = useState<ConfirmedFingerprint | null>(
    () => persistedOnMount?.confirmedFingerprint ?? null,
  )

  // Theme is applied to the document root so the design system's `:root[data-theme]` overrides win
  // over the `prefers-color-scheme` default in both directions.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // spec 034: persist raw user input on every change — plain synchronous write, no debounce. Only
  // the raw resumeText/selectedRole/selectedSeniority are persisted, never derived gap state
  // (Intellectual Control: the arbitrage_score view must never be shadowed by a stale cached
  // result). Safe under StrictMode's double-invoked effects: the initial values already come from
  // `persistedOnMount` above, so a duplicate write is idempotent (same value twice), not a wipe.
  // spec 036: only slot 0's role is persisted — slots 1/2 and compareMode are session-only.
  // spec 038b: confirmedSkillKeys/confirmedFingerprint round-trip alongside them — a confirmed set
  // is treated as user input (like resumeText), not cached score.
  useEffect(() => {
    savePersistedState({
      resumeText,
      selectedRole: roleSlots[0],
      selectedSeniority,
      confirmedSkillKeys,
      confirmedFingerprint,
    })
  }, [resumeText, roleSlots, selectedSeniority, confirmedSkillKeys, confirmedFingerprint])

  // spec 036: the ONE two-call pattern every slot-role change goes through — `setRoleSlots` for
  // the controlled `<select>`'s value, `panels[slot].loadRole` for the side-effecting refetch.
  // Mirrors the pre-036 `handleRoleChange` exactly, generalized to any of the 3 fixed slots.
  function handleSlotRoleChange(slot: 0 | 1 | 2, role: string) {
    setRoleSlots((prev) => {
      const next: [string, string, string] = [...prev]
      next[slot] = role
      return next
    })
    panels[slot].loadRole(role)
  }

  function handleCompareModeToggle(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked
    setCompareMode(checked)
    if (!checked) {
      // SPEC's explicit cleanup: discard slots 1/2 entirely, not just stop rendering them — a
      // still-hook-mounted slot otherwise keeps stale fetched data lingering out of view.
      setRoleSlots((prev) => [prev[0], '', ''])
      panels[1].loadRole('')
      panels[2].loadRole('')
      setShowThirdSlot(false)
    }
  }

  function handleResumeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError('')

    if (!roleSlots[0]) {
      setValidationError(ROLE_REQUIRED_MESSAGE)
      return
    }
    if (resumeText.trim() === '') {
      setValidationError(RESUME_REQUIRED_MESSAGE)
      return
    }

    // spec 036: one shared resume paste fans out to every ACTIVE slot's own panel instance — each
    // computes its own have/gap split independently (no cross-role aggregate is ever computed).
    // spec 038c: every active slot — including panel 0 in compare mode — now stages a confirmation
    // draft (submitResume) instead of computing the gap immediately, so each panel's checklist
    // renders, one at a time in ascending slot order (see confirmationSlot below), before that
    // panel's computeSkillGap ever runs. This single fan-out line is correct for single-panel mode
    // too: activeSlotIndices === [0] there, so it collapses to the exact same submitResume(...)
    // call single-panel mode already made pre-038c.
    activeSlotIndices.forEach((slot) => panels[slot].submitResume(resumeText))
  }

  // spec 038b: the checklist's "Confirm skills" action — hands the user's edited checked set to
  // the real gap computation (confirmSkills) AND captures it, verbatim, as the newly-confirmed
  // persisted set/fingerprint. Captured explicitly here (not re-derived from
  // panels[0].haveSkillKeys after the fact) per the SPEC's "a confirmed set is treated as user
  // input, not cached score" line — explicit capture of what the user just checked is more direct
  // than coupling persistence to a derived pipeline output.
  function handleConfirmSkills(checkedSkillKeys: Set<string>) {
    panels[0].confirmSkills(checkedSkillKeys)
    setConfirmedSkillKeys([...checkedSkillKeys])
    setConfirmedFingerprint({ resumeText, role: roleSlots[0] })
  }

  // spec 038c: slots 1/2's own compare-mode-only checklist confirm — mirrors handleConfirmSkills'
  // gap-computation call exactly, but never persists (slots 1/2 are session-only, never restored;
  // Q2). Slot 0's compare-mode checklist reuses handleConfirmSkills verbatim instead of this
  // function — it is already correct for slot 0 regardless of compareMode.
  function handleConfirmSkillsCompare(slot: 1 | 2, checkedSkillKeys: Set<string>) {
    panels[slot].confirmSkills(checkedSkillKeys)
  }

  // spec 038c (Q3): "Back" on slot N abandons N's own staged draft AND every later active slot's
  // still-staged draft — never an earlier, already-confirmed slot, and never a bare single-slot
  // cancel (which would otherwise let the next active slot's already-staged draft silently become
  // the new earliest-pending one, i.e. skip forward instead of abandoning the rest of the batch).
  function handleCancelConfirmationCompare(slot: 0 | 1 | 2) {
    panels[slot].cancelConfirmation()
    activeSlotIndices
      .filter((laterSlot) => laterSlot > slot)
      .forEach((laterSlot) => panels[laterSlot].cancelConfirmation())
  }

  // Mount-time hydration (spec 034): resumeText/selectedRole/selectedSeniority are already seeded
  // from `persistedOnMount` above (synchronously, at first render), and `useRolePanel`'s own
  // role-keyed effect already fires the restored role's fetch at mount (its initial argument is
  // `roleSlots[0]`, seeded the same way). This effect only handles the one side effect hydration
  // additionally needs: once that fetch settles, re-running the extraction-only pipeline via the
  // same `panels[0].submitResume` path `handleResumeSubmit` uses (spec 038b: staging, not
  // computing — the second effect below finishes the job), if resumeText was also restored.
  // Guarded by a ref (not just the dependency array) so this only ever fires once, even across
  // React 18 StrictMode's dev-only double-invocation of effects. Slots 1/2 are never persisted
  // (spec 036), so they have nothing to hydrate.
  const didRunMountSubmit = useRef(false)
  useEffect(() => {
    if (didRunMountSubmit.current) return
    if (persistedOnMount === null || !persistedOnMount.selectedRole) {
      didRunMountSubmit.current = true
      return
    }

    if (panels[0].status === 'success') {
      didRunMountSubmit.current = true
      if (persistedOnMount.resumeText.trim() !== '') {
        panels[0].submitResume(persistedOnMount.resumeText)
      }
    } else if (panels[0].status === 'error') {
      didRunMountSubmit.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels[0].status])

  // spec 038b: the second half of mount-time hydration — `confirmSkills` needs
  // `panels[0].pendingConfirmation` to actually be populated first, which only happens
  // asynchronously after the effect above's `submitResume` call commits and this component
  // re-renders (`useRolePanel.confirmSkills` closes over `pendingConfirmation` via
  // `useCallback([pendingConfirmation])`, so calling it synchronously right after `submitResume`
  // would still see the stale pre-submitResume value). Watches for `pendingConfirmation` becoming
  // defined and, only the first time and only if a confirmed set actually survived
  // `loadPersistedState()`'s own fingerprint-mismatch check (already resolved before
  // `persistedOnMount` exists here — App.tsx does not re-check the fingerprint itself), replays it
  // via `confirmSkills` — skipping the checklist entirely on an exact-match reload. A `null`
  // confirmedSkillKeys (never confirmed, or a mismatch already discarded it) does nothing further:
  // the checklist simply stays on screen for the user to confirm manually, which is the correct
  // "fall back to checklist-first behavior." Ref-guarded exactly like `didRunMountSubmit` above, so
  // a later, user-driven resubmission's own fresh `pendingConfirmation` is never mistaken for the
  // mount-time draft and auto-confirmed against a stale persisted set.
  const didRunMountConfirm = useRef(false)
  useEffect(() => {
    if (didRunMountConfirm.current) return
    if (panels[0].pendingConfirmation === undefined) return
    didRunMountConfirm.current = true
    if (persistedOnMount?.confirmedSkillKeys != null) {
      panels[0].confirmSkills(new Set(persistedOnMount.confirmedSkillKeys))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels[0].pendingConfirmation])

  function handleClearSavedData() {
    clearPersistedState()
    setResumeText('')
    setRoleSlots((prev) => ['', prev[1], prev[2]])
    setSelectedSeniority('')
    setConfirmedSkillKeys(null)
    setConfirmedFingerprint(null)
    panels[0].cancelConfirmation()
    panels[0].loadRole('')
  }

  // Which of the 3 fixed slots are currently shown: always slot 0; slot 1 once compare mode is on;
  // slot 2 once "+ Compare a third role" has been clicked. Order is always ascending, so DOM order
  // of the per-slot `<select>`s always matches slot index (the e2e oracle tells slots apart by
  // `nth(i)`, never by a distinct label).
  const activeSlotIndices: number[] = compareMode
    ? showThirdSlot
      ? [0, 1, 2]
      : [0, 1]
    : [0]

  // spec 038c: the earliest active slot, ascending, that still needs confirming — a pure
  // derivation over each panel's own `pendingConfirmation`, never stored state, so it can never
  // drift out of sync with the per-instance state it reads (Intellectual Control). `null` once
  // every active slot has confirmed (or in single-panel mode, once slot 0 has).
  const confirmationSlot: number | null =
    activeSlotIndices.find((slot) => panels[slot].pendingConfirmation !== undefined) ?? null

  // Each slot's own `<select>` disables options already active in a sibling slot (SPEC Edge
  // Cases) — prevented at the picker, never detected post-hoc.
  function otherActiveRoles(slot: number): Set<string> {
    return new Set(
      activeSlotIndices
        .filter((s) => s !== slot)
        .map((s) => roleSlots[s])
        .filter((role) => role !== ''),
    )
  }

  return (
    <div className="lg-fade">
      <nav className="nav">
        <div className="nav-brand">
          <span>Looking&nbsp;Glass</span>
          <span className="tag tag-outline" style={{ letterSpacing: '0.08em' }}>
            PIVOT ENGINE
          </span>
        </div>
        <div className="seg" role="group" aria-label="Colour theme">
          <label className="seg-opt">
            <input
              type="radio"
              name="lg-theme"
              checked={theme === 'light'}
              onChange={() => setTheme('light')}
            />
            Light
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="lg-theme"
              checked={theme === 'dark'}
              onChange={() => setTheme('dark')}
            />
            Dark
          </label>
        </div>
      </nav>

      <header className="lg-header">
        <h1>Find the skills worth learning first</h1>
        <p>
          Pick the role you&rsquo;re aiming for and paste your resume. Looking&nbsp;Glass lines up
          the skills that role wants against what you already have, then ranks what&rsquo;s left by{' '}
          <strong>leverage</strong> — skills lots of jobs want but few people have. Same payoff, less
          competition.
        </p>
      </header>

      <main className="lg-main">
        <div className="lg-sidebar">
          <section className="card blueprint elev-sm">
            <div className="card-kicker">Step 1</div>
            <div className="card-title">
              <span className="lg-step-badge" aria-hidden="true">
                1
              </span>
              Pick your target role
            </div>

            <div className="field lg-compare-toggle-field">
              <label className="lg-compare-toggle">
                <input type="checkbox" checked={compareMode} onChange={handleCompareModeToggle} />
                Compare roles
              </label>
            </div>

            {!compareMode ? (
              <div className="field">
                <label htmlFor="role-picker">Target role</label>
                <select
                  id="role-picker"
                  className="input"
                  value={roleSlots[0]}
                  onChange={(event) => handleSlotRoleChange(0, event.target.value)}
                >
                  <option value="">Select a role</option>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              activeSlotIndices.map((slot) => {
                const disabledRoles = otherActiveRoles(slot)
                return (
                  <div className="field" key={slot}>
                    <label htmlFor={`role-picker-${slot}`}>Target role</label>
                    <select
                      id={`role-picker-${slot}`}
                      className="input"
                      value={roleSlots[slot]}
                      onChange={(event) => handleSlotRoleChange(slot as 0 | 1 | 2, event.target.value)}
                    >
                      <option value="">Select a role</option>
                      {ROLES.map((role) => (
                        <option key={role} value={role} disabled={disabledRoles.has(role)}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })
            )}

            {compareMode && !showThirdSlot && (
              <button
                type="button"
                className="btn btn-block lg-add-third-role"
                onClick={() => setShowThirdSlot(true)}
              >
                + Compare a third role
              </button>
            )}

            <div className="field">
              <label htmlFor="seniority-picker">Experience level (optional)</label>
              <select
                id="seniority-picker"
                className="input"
                value={selectedSeniority}
                onChange={(event) => setSelectedSeniority(event.target.value as SeniorityLevel | '')}
              >
                <option value="">Not specified</option>
                <option value="entry">Entry level</option>
                <option value="mid">Mid level</option>
                <option value="senior">Senior level</option>
              </select>
            </div>

            {!compareMode ? (
              <>
                {panels[0].status === 'loading' && (
                  <p role="status" aria-label="Loading skill profile">
                    Loading skill profile…
                  </p>
                )}
                {panels[0].status === 'error' && (
                  <p role="alert">Could not load skill profile: {panels[0].errorMessage}</p>
                )}
                {panels[0].status === 'success' && panels[0].rows.length === 0 && (
                  <p role="status" aria-label="No skills found for this role">
                    No skills found for this role.
                  </p>
                )}
              </>
            ) : (
              activeSlotIndices.map((slot) => (
                <div key={slot}>
                  {panels[slot].status === 'loading' && (
                    <p role="status" aria-label={`Loading skill profile — ${roleSlots[slot]}`}>
                      Loading skill profile…
                    </p>
                  )}
                  {panels[slot].status === 'error' && (
                    <p role="alert">
                      {`Could not load skill profile for ${roleSlots[slot]}: ${panels[slot].errorMessage}`}
                    </p>
                  )}
                  {panels[slot].status === 'success' && panels[slot].rows.length === 0 && (
                    <p role="status" aria-label={`No skills found for this role — ${roleSlots[slot]}`}>
                      No skills found for this role.
                    </p>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="card blueprint elev-sm">
            <div className="card-kicker">Step 2</div>
            <div className="card-title">
              <span className="lg-step-badge" aria-hidden="true">
                2
              </span>
              Paste your resume
            </div>
            <form onSubmit={handleResumeSubmit}>
              <div className="field">
                <label htmlFor="resume-text">Resume text</label>
                <textarea
                  id="resume-text"
                  className="input"
                  value={resumeText}
                  maxLength={MAX_RESUME_LENGTH}
                  placeholder="Paste your resume — we scan it for the skills this role needs."
                  onChange={(event) => setResumeText(event.target.value)}
                />
              </div>
              {validationError && (
                <p role="alert" style={{ color: 'var(--gap-tone)', fontSize: '12.5px', margin: '6px 0 0' }}>
                  {validationError}
                </p>
              )}
              <button type="submit" className="btn btn-primary btn-block">
                Find my gaps
              </button>
            </form>
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: '8px' }}
              onClick={handleClearSavedData}
            >
              Clear saved data
            </button>
          </section>
        </div>

        <div className="lg-results">
          {!compareMode ? (
            <>
              {panels[0].status === 'idle' && <EmptyStateCard />}
              {panels[0].status === 'loading' && <LoadingSkeleton />}
              {panels[0].status === 'success' &&
                panels[0].rows.length > 0 &&
                (panels[0].pendingConfirmation ? (
                  <SkillConfirmationChecklist
                    role={roleSlots[0]}
                    rows={panels[0].pendingConfirmation.rows}
                    autoDetectedKeys={panels[0].pendingConfirmation.autoDetectedKeys}
                    onConfirm={handleConfirmSkills}
                    onCancel={panels[0].cancelConfirmation}
                  />
                ) : (
                  <RoleResultsPanel
                    compareMode={false}
                    role={roleSlots[0]}
                    selectedSeniority={selectedSeniority}
                    rows={panels[0].rows}
                    haveSkillKeys={panels[0].haveSkillKeys}
                    topGaps={panels[0].topGaps}
                    selectedGroup={panels[0].selectedGroup}
                    setSelectedGroup={panels[0].setSelectedGroup}
                  />
                ))}
            </>
          ) : (
            <div className="compare-grid">
              {activeSlotIndices.map((slot) => (
                <section
                  key={slot}
                  className="compare-column"
                  aria-label={`${roleSlots[slot]} comparison column`}
                >
                  {panels[slot].status === 'idle' && <EmptyStateCard />}
                  {panels[slot].status === 'loading' && <LoadingSkeleton />}
                  {panels[slot].status === 'success' &&
                    panels[slot].rows.length > 0 &&
                    (slot === confirmationSlot && panels[slot].pendingConfirmation ? (
                      <SkillConfirmationChecklist
                        role={roleSlots[slot]}
                        rows={panels[slot].pendingConfirmation.rows}
                        autoDetectedKeys={panels[slot].pendingConfirmation.autoDetectedKeys}
                        onConfirm={
                          slot === 0
                            ? handleConfirmSkills
                            : (keys) => handleConfirmSkillsCompare(slot as 1 | 2, keys)
                        }
                        onCancel={() => handleCancelConfirmationCompare(slot as 0 | 1 | 2)}
                      />
                    ) : (
                      <RoleResultsPanel
                        compareMode
                        role={roleSlots[slot]}
                        selectedSeniority={selectedSeniority}
                        rows={panels[slot].rows}
                        haveSkillKeys={panels[slot].haveSkillKeys}
                        topGaps={panels[slot].topGaps}
                        selectedGroup={panels[slot].selectedGroup}
                        setSelectedGroup={panels[slot].setSelectedGroup}
                      />
                    ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
