import { useEffect, useRef, useState } from 'react'
import { ROLES, type Role } from './lib/roles'
import { fetchRoleSkillProfile, type RoleSkillRow } from './lib/supabaseClient'
import { extractResumeSkills } from './lib/resumeSkills'
import { computeSkillGap } from './lib/gap'
import { narrateTopGaps } from './lib/narrate'
import { formatNum } from './lib/format'
import { normalizeSkillName } from './lib/normalize'
import { getSeniorityFraming, type SeniorityLevel } from './lib/seniorityFraming'
import { savePersistedState, loadPersistedState, clearPersistedState } from './lib/localPersistence'
import { SkillMatrix } from './components/matrix/SkillMatrix'
import { SkillLeverageTable } from './components/matrix/SkillLeverageTable'
import { SkillGroupBreakdown } from './components/matrix/SkillGroupBreakdown'
import { FilterStatusBar } from './components/matrix/FilterStatusBar'
import { TopGapNarration } from './components/matrix/TopGapNarration'
import { SeniorityFraming } from './components/matrix/SeniorityFraming'

type Status = 'idle' | 'loading' | 'success' | 'error'
type TopGaps = ReturnType<typeof narrateTopGaps>
type Theme = 'light' | 'dark'

// Resume text is capped client-side to the edge function's own limit (spec 004, Task 6) so an
// oversized paste never round-trips to the server just to fail there.
const MAX_RESUME_LENGTH = 20000
const ROLE_REQUIRED_MESSAGE = 'Select a target role before finding your gaps.'
const RESUME_REQUIRED_MESSAGE = 'Paste your resume text before finding your gaps.'
// Locked verbatim (spec 005, Cypress's compliance report) — the authoritative wording, not the
// SPEC's example text. Never re-derive or paraphrase.
const NO_GAPS_MESSAGE = 'No gaps — you already have every skill this role needs.'

// Display-only ranking: descending by the already-computed arbitrage_score, null-score rows last —
// the exact rule computeSkillGap/ArbitrageLadder use. Reads the score verbatim (Bounded-AI: a
// presentation sort, never a new metric).
function byArbitrageDesc(a: RoleSkillRow, b: RoleSkillRow): number {
  if (a.arbitrage_score === null && b.arbitrage_score === null) return 0
  if (a.arbitrage_score === null) return 1
  if (b.arbitrage_score === null) return -1
  return b.arbitrage_score - a.arbitrage_score
}

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
  const [rows, setRows] = useState<RoleSkillRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const [resumeText, setResumeText] = useState(() =>
    persistedOnMount ? persistedOnMount.resumeText.slice(0, MAX_RESUME_LENGTH) : '',
  )
  const [validationError, setValidationError] = useState('')
  const [haveSkillKeys, setHaveSkillKeys] = useState<Set<string> | undefined>(undefined)
  const [topGaps, setTopGaps] = useState<TopGaps | undefined>(undefined)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
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

  // Shared with mount-time hydration (spec 034) so there is exactly one implementation of
  // "load a role's profile" that both handleRoleChange and the hydration effect call.
  async function loadRoleProfile(role: string) {
    setSelectedRole(role)
    setHaveSkillKeys(undefined)
    setTopGaps(undefined)
    setSelectedGroup(null)

    if (!role) {
      setStatus('idle')
      setRows([])
      return
    }

    setStatus('loading')
    try {
      const result = await fetchRoleSkillProfile(role)
      setRows(result)
      setStatus('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  function handleRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    void loadRoleProfile(event.target.value)
  }

  // Shared with mount-time hydration (spec 034) so there is exactly one implementation of
  // "run the gap pipeline against the current rows/resumeText" that both handleResumeSubmit and
  // the hydration effect call.
  function runGapPipeline(gapRows: RoleSkillRow[], text: string) {
    const vocabulary = gapRows.map((row) => row.skill_name_raw)
    const skills = extractResumeSkills(text, vocabulary)
    const gap = computeSkillGap(gapRows, skills)
    setHaveSkillKeys(gap.haveSkillKeys)
    setTopGaps(narrateTopGaps(gap.rows, gap.haveSkillKeys))
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

    runGapPipeline(rows, resumeText)
  }

  // Mount-time hydration (spec 034): resumeText/selectedRole/selectedSeniority are already seeded
  // from `persistedOnMount` above (synchronously, at first render). This effect only handles the
  // side effects hydration additionally needs: re-fetching a restored role's profile via the same
  // path `handleRoleChange` uses, and — once rows arrive — re-running the gap pipeline via the
  // same path `handleResumeSubmit` uses, if resumeText was also restored. Guarded by a ref (not
  // just the empty deps array) so React 18 StrictMode's dev-only double-invocation of mount
  // effects can't double-fire the fetch.
  const didRunMountFetch = useRef(false)
  useEffect(() => {
    if (didRunMountFetch.current) return
    didRunMountFetch.current = true

    if (persistedOnMount === null || !persistedOnMount.selectedRole) return

    setStatus('loading')
    fetchRoleSkillProfile(persistedOnMount.selectedRole)
      .then((result) => {
        setRows(result)
        setStatus('success')
        if (persistedOnMount.resumeText.trim() !== '') {
          runGapPipeline(result, persistedOnMount.resumeText)
        }
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClearSavedData() {
    clearPersistedState()
    setResumeText('')
    setSelectedRole('')
    setSelectedSeniority('')
    setRows([])
    setStatus('idle')
    setHaveSkillKeys(undefined)
    setTopGaps(undefined)
    setSelectedGroup(null)
  }

  const hasRows = status === 'success' && rows.length > 0
  const analyzed = haveSkillKeys !== undefined

  // Derived, not stored (spec 029): recomputes automatically on role/seniority change, so there is
  // no stale-note bug and nothing to reset in handleRoleChange. Independent of `analyzed` — visible
  // as soon as Step 1 is complete, before or after Step 2 (the SPEC's Bounded-AI boundary: this
  // note never depends on haveSkillKeys/topGaps/the gap pipeline at all).
  const seniorityNote =
    hasRows && selectedSeniority ? getSeniorityFraming(selectedRole as Role, selectedSeniority) : null

  // Ranked-for-display (top move chip). Never mutates state's `rows`.
  const ranked = [...rows].sort(byArbitrageDesc)
  const topMove = ranked[0]
  const scoredCount = rows.filter((r) => r.demand_score !== null && r.scarcity_index !== null).length

  // Donut partition — only meaningful once a resume has been analyzed.
  let haveCount = 0
  let gapCount = 0
  let unscoredCount = 0
  if (haveSkillKeys) {
    for (const row of rows) {
      const key = row.skill_key ?? normalizeSkillName(row.skill_name_raw)
      if (haveSkillKeys.has(key)) haveCount++
      else if (row.arbitrage_score === null) unscoredCount++
      else gapCount++
    }
  }
  // A plain array `.filter()` over the already-fetched rows — SkillMatrix/SkillLeverageTable never
  // learn about `selectedGroup` themselves, so their own hard-won a11y/touch-hover fixes (spec 018)
  // are untouched by this task (spec 027's Intellectual Control).
  const filteredRows = selectedGroup
    ? rows.filter((r) => (r.skill_group ?? 'Uncategorized') === selectedGroup)
    : rows

  const havePct = rows.length ? Math.round((haveCount / rows.length) * 100) : 0
  const goodDeg = rows.length ? (haveCount / rows.length) * 360 : 0
  const gapDeg = rows.length ? (gapCount / rows.length) * 360 : 0
  const donutGradient = `conic-gradient(var(--have) 0deg ${goodDeg}deg, var(--learn) ${goodDeg}deg ${
    goodDeg + gapDeg
  }deg, var(--color-neutral-400) ${goodDeg + gapDeg}deg 360deg)`

  const showNoGaps = analyzed && topGaps === null

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

            {status === 'loading' && (
              <p role="status" aria-label="Loading skill profile">
                Loading skill profile…
              </p>
            )}
            {status === 'error' && <p role="alert">Could not load skill profile: {errorMessage}</p>}
            {status === 'success' && rows.length === 0 && (
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
          {status === 'idle' && (
            <section className="card blueprint elev-sm lg-empty-state">
              <div className="card-kicker">Get started</div>
              <div className="card-title">Your leverage matrix appears here</div>
              <p style={{ margin: 0, fontSize: '14px', opacity: 0.75 }}>
                Complete Step 1 — pick a target role — and this column fills in with the
                demand&nbsp;×&nbsp;scarcity matrix and ranked skill gaps for that role.
              </p>
            </section>
          )}

          {status === 'loading' && (
            <div className="lg-skeleton" aria-hidden="true">
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-standing" aria-hidden="true" />
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-evidence" aria-hidden="true" />
            </div>
          )}

          {hasRows && (
            <section className="card blueprint elev-md standing-root">
              <header className="lg-results-head">
                <span className="card-kicker">Target role</span>
                <h2 className="lg-role-heading">{selectedRole}</h2>
                <div className="lg-summary-tags">
                  <span className="tag tag-neutral">
                    {scoredCount} of {rows.length} scored
                  </span>
                  {topMove && (
                    <span className="tag tag-outline">
                      Start here: {topMove.skill_name_raw}
                      {topMove.arbitrage_score !== null &&
                        ` · leverage ${formatNum(topMove.arbitrage_score)}`}
                    </span>
                  )}
                </div>
                <SeniorityFraming note={seniorityNote} />
              </header>

              {analyzed && (
                <div className="lg-scorecard lg-fade">
                  <div className="lg-donut-wrap">
                    <div className="lg-donut" style={{ background: donutGradient }} aria-hidden="true">
                      <div className="lg-donut-hole">
                        <div className="lg-donut-pct">{havePct}%</div>
                        <div className="lg-donut-label">ready</div>
                      </div>
                    </div>
                    <div className="lg-donut-legend">
                      <div>
                        <span className="lg-swatch" style={{ background: 'var(--have)' }} />
                        Already have {haveCount}
                      </div>
                      <div>
                        <span className="lg-swatch" style={{ background: 'var(--learn)' }} />
                        Worth learning {gapCount}
                      </div>
                      <div>
                        <span className="lg-swatch" style={{ background: 'var(--color-neutral-400)' }} />
                        Not scored yet {unscoredCount}
                      </div>
                    </div>
                  </div>
                  <div className="lg-scorecard-narration">
                    {topGaps && <TopGapNarration moves={topGaps.moves} />}
                    {showNoGaps && (
                      <p
                        role="status"
                        aria-label="Skill gap result"
                        style={{ fontSize: '14px', opacity: 0.8, margin: 0 }}
                      >
                        {NO_GAPS_MESSAGE}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {hasRows && (
            <div className="card blueprint elev-md evidence-root">
              <SkillGroupBreakdown
                rows={rows}
                haveSkillKeys={haveSkillKeys}
                selectedGroup={selectedGroup}
                onSelectGroup={setSelectedGroup}
              />
              <FilterStatusBar
                selectedGroup={selectedGroup}
                filteredCount={filteredRows.length}
                totalCount={rows.length}
                onClear={() => setSelectedGroup(null)}
              />
              <SkillMatrix rows={filteredRows} haveSkillKeys={haveSkillKeys} />
              <SkillLeverageTable
                rows={filteredRows}
                haveSkillKeys={haveSkillKeys}
                roleName={selectedRole}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
