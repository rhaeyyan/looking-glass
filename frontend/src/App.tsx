import { useEffect, useRef, useState } from 'react'
import { ROLES } from './lib/roles'
import { savePersistedState, loadPersistedState, clearPersistedState } from './lib/localPersistence'
import { useRolePanel } from './lib/useRolePanel'
import { type SeniorityLevel } from './lib/seniorityFraming'
import { RoleResultsPanel } from './components/matrix/RoleResultsPanel'

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

  const [selectedRole, setSelectedRole] = useState(() => persistedOnMount?.selectedRole ?? '')
  // spec 035: the entire rows/status/errorMessage/haveSkillKeys/topGaps/selectedGroup slice, plus
  // the former loadRoleProfile/runGapPipeline functions, now live inside this reusable hook — its
  // initial role argument is only ever consumed once (React's useState(initialValue) convention);
  // every later role change goes through `panel.loadRole`, never a re-render with a new argument.
  const panel = useRolePanel(selectedRole)

  const [resumeText, setResumeText] = useState(() =>
    persistedOnMount ? persistedOnMount.resumeText.slice(0, MAX_RESUME_LENGTH) : '',
  )
  const [validationError, setValidationError] = useState('')
  // specs/029: local-only, plain <select> state — never touched by handleRoleChange, never
  // refetches, never feeds computeSkillGap/the matrix/the table. See seniorityNote below.
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | ''>(
    () => persistedOnMount?.selectedSeniority ?? '',
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
  useEffect(() => {
    savePersistedState({ resumeText, selectedRole, selectedSeniority })
  }, [resumeText, selectedRole, selectedSeniority])

  function handleRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const role = event.target.value
    setSelectedRole(role)
    panel.loadRole(role)
  }

  function handleResumeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError('')

    if (!selectedRole) {
      setValidationError(ROLE_REQUIRED_MESSAGE)
      return
    }
    if (resumeText.trim() === '') {
      setValidationError(RESUME_REQUIRED_MESSAGE)
      return
    }

    panel.submitResume(resumeText)
  }

  // Mount-time hydration (spec 034): resumeText/selectedRole/selectedSeniority are already seeded
  // from `persistedOnMount` above (synchronously, at first render), and `useRolePanel`'s own
  // role-keyed effect already fires the restored role's fetch at mount (its initial argument is
  // `selectedRole`, seeded the same way). This effect only handles the one side effect hydration
  // additionally needs: once that fetch settles, re-running the gap pipeline via the same
  // `panel.submitResume` path `handleResumeSubmit` uses, if resumeText was also restored. Guarded
  // by a ref (not just the dependency array) so this only ever fires once, even across React 18
  // StrictMode's dev-only double-invocation of effects.
  const didRunMountSubmit = useRef(false)
  useEffect(() => {
    if (didRunMountSubmit.current) return
    if (persistedOnMount === null || !persistedOnMount.selectedRole) {
      didRunMountSubmit.current = true
      return
    }

    if (panel.status === 'success') {
      didRunMountSubmit.current = true
      if (persistedOnMount.resumeText.trim() !== '') {
        panel.submitResume(persistedOnMount.resumeText)
      }
    } else if (panel.status === 'error') {
      didRunMountSubmit.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.status])

  function handleClearSavedData() {
    clearPersistedState()
    setResumeText('')
    setSelectedRole('')
    setSelectedSeniority('')
    panel.loadRole('')
  }

  const hasRows = panel.status === 'success' && panel.rows.length > 0

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
            <div className="field">
              <label htmlFor="role-picker">Target role</label>
              <select
                id="role-picker"
                className="input"
                value={selectedRole}
                onChange={handleRoleChange}
              >
                <option value="">Select a role</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

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

            {panel.status === 'loading' && (
              <p role="status" aria-label="Loading skill profile">
                Loading skill profile…
              </p>
            )}
            {panel.status === 'error' && (
              <p role="alert">Could not load skill profile: {panel.errorMessage}</p>
            )}
            {panel.status === 'success' && panel.rows.length === 0 && (
              <p role="status" aria-label="No skills found for this role">
                No skills found for this role.
              </p>
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
          {panel.status === 'idle' && (
            <section className="card blueprint elev-sm lg-empty-state">
              <div className="card-kicker">Get started</div>
              <div className="card-title">Your leverage matrix appears here</div>
              <p style={{ margin: 0, fontSize: '14px', opacity: 0.75 }}>
                Complete Step 1 — pick a target role — and this column fills in with the
                demand&nbsp;×&nbsp;scarcity matrix and ranked skill gaps for that role.
              </p>
            </section>
          )}

          {panel.status === 'loading' && (
            <div className="lg-skeleton" aria-hidden="true">
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-standing" aria-hidden="true" />
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-evidence" aria-hidden="true" />
            </div>
          )}

          {hasRows && (
            <RoleResultsPanel
              role={selectedRole}
              selectedSeniority={selectedSeniority}
              rows={panel.rows}
              haveSkillKeys={panel.haveSkillKeys}
              topGaps={panel.topGaps}
              selectedGroup={panel.selectedGroup}
              setSelectedGroup={panel.setSelectedGroup}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
