import { useEffect, useState } from 'react'
import { ROLES } from './lib/roles'
import { fetchRoleSkillProfile, type RoleSkillRow } from './lib/supabaseClient'
import { extractResumeSkills } from './lib/resumeSkills'
import { computeSkillGap } from './lib/gap'
import { narrateTopGaps } from './lib/narrate'
import { formatNum } from './lib/format'
import { normalizeSkillName } from './lib/normalize'
import { SkillMatrix } from './components/matrix/SkillMatrix'
import { SkillLeverageTable } from './components/matrix/SkillLeverageTable'
import { TopGapNarration } from './components/matrix/TopGapNarration'

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
  const [selectedRole, setSelectedRole] = useState('')
  const [rows, setRows] = useState<RoleSkillRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const [resumeText, setResumeText] = useState('')
  const [validationError, setValidationError] = useState('')
  const [haveSkillKeys, setHaveSkillKeys] = useState<Set<string> | undefined>(undefined)
  const [topGaps, setTopGaps] = useState<TopGaps | undefined>(undefined)

  // Theme is applied to the document root so the design system's `:root[data-theme]` overrides win
  // over the `prefers-color-scheme` default in both directions.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  async function handleRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const role = event.target.value
    setSelectedRole(role)
    setHaveSkillKeys(undefined)
    setTopGaps(undefined)

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

    const vocabulary = rows.map((row) => row.skill_name_raw)
    const skills = extractResumeSkills(resumeText, vocabulary)
    const gap = computeSkillGap(rows, skills)
    setHaveSkillKeys(gap.haveSkillKeys)
    setTopGaps(narrateTopGaps(gap.rows, gap.haveSkillKeys))
  }

  const hasRows = status === 'success' && rows.length > 0
  const analyzed = haveSkillKeys !== undefined

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
  const havePct = rows.length ? Math.round((haveCount / rows.length) * 100) : 0
  const goodDeg = rows.length ? (haveCount / rows.length) * 360 : 0
  const gapDeg = rows.length ? (gapCount / rows.length) * 360 : 0
  const donutGradient = `conic-gradient(var(--have-tone) 0deg ${goodDeg}deg, var(--learn-tone) ${goodDeg}deg ${
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
        <h1>Find the one skill worth learning first</h1>
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
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <div className="card-kicker">Step 1</div>
            <div className="card-title">Pick your target role</div>
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
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <div className="card-kicker">Step 2</div>
            <div className="card-title">Paste your resume</div>
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
          </section>
        </div>

        <div className="lg-results">
          {status === 'idle' && (
            <section className="card blueprint elev-sm lg-empty-state">
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
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
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-scorecard" aria-hidden="true" />
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-scatter" aria-hidden="true" />
              <div className="card blueprint elev-sm lg-skeleton-block lg-skeleton-table" aria-hidden="true" />
            </div>
          )}

          {hasRows && (
            <header className="lg-results-head">
              <span className="card-kicker">Target role</span>
              <div className="lg-summary-tags">
                <span
                  className="tag tag-accent"
                  style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', padding: '5px 13px' }}
                >
                  {selectedRole}
                </span>
                <span className="tag tag-neutral">
                  {scoredCount} of {rows.length} scored
                </span>
                {topMove && (
                  <span className="tag tag-outline">
                    Start here: {topMove.skill_name_raw}
                    {topMove.arbitrage_score !== null && ` · leverage ${formatNum(topMove.arbitrage_score)}`}
                  </span>
                )}
              </div>
            </header>
          )}

          {analyzed && (
            <section className="card blueprint elev-sm lg-scorecard lg-fade">
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
              <div className="lg-donut-wrap">
                <div className="lg-donut" style={{ background: donutGradient }} aria-hidden="true">
                  <div className="lg-donut-hole">
                    <div className="lg-donut-pct">{havePct}%</div>
                    <div className="lg-donut-label">ready</div>
                  </div>
                </div>
                <div className="lg-donut-legend">
                  <div>
                    <span className="lg-swatch" style={{ background: 'var(--have-tone)' }} />
                    Already have {haveCount}
                  </div>
                  <div>
                    <span className="lg-swatch" style={{ background: 'var(--learn-tone)' }} />
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
                  <p role="status" style={{ fontSize: '14px', opacity: 0.8, margin: 0 }}>
                    {NO_GAPS_MESSAGE}
                  </p>
                )}
              </div>
            </section>
          )}

          {hasRows && (
            <>
              <SkillMatrix rows={rows} haveSkillKeys={haveSkillKeys} />
              <SkillLeverageTable rows={rows} haveSkillKeys={haveSkillKeys} roleName={selectedRole} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
