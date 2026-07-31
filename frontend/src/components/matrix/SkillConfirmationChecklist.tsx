import { useEffect, useId, useState } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import { normalizeSkillName } from '../../lib/normalize'
import './matrix.css'

// specs/038b-skill-confirmation-checklist-ui.md — the confirm/edit step between resume submission
// and analyzed results (single-panel/`compareMode === false` only, per the SPEC's Constraints).
// Pure presentation of `useRolePanel`'s `pendingConfirmation` draft: every row `rows` contains
// renders as one checkbox, pre-checked per `autoDetectedKeys` (real deterministic extraction, spec
// 006 — never re-derived or guessed here). The user's edits live as local component state until
// "Confirm skills" hands the live checked set to `onConfirm`; "Back" hands control to `onCancel`
// with no set of its own. Zero score/gap/join computation happens in this file (Bounded-AI: pure
// presentation of, and input-collection for, a user's own explicit choice, per the SPEC).
//
// Styling note: this task's file allocation is exactly this component plus App.tsx, so no new
// matrix.css rule is added here. matrix.css's own component-scoped design tokens
// (--surface-1/--border/--series-1/etc.) only resolve inside an ancestor carrying one of its six
// declared root classes (.matrix-root/.ladder-root/.narration-root/.leverage-root/.breakdown-root/
// .filter-status-root) — this component's root claims none of them, so it deliberately reuses only
// a) global, `:root`-scoped classes/tokens from looking-glass.css (`card blueprint elev-md` chrome
// — the same glass-v2 treatment `.lg-results .card.blueprint` already gives RoleResultsPanel's own
// cards — `.lg-role-heading`, `.btn`/`.btn-primary`), b) matrix.css's `.lg-compare-toggle` checkbox
// idiom, which is documented there as intentionally referencing no matrix.css-local custom
// property (so it is safe to reuse outside those six roots), and c) inline styles reading the same
// global `--have`/`--have-soft`/`--color-divider`/`--color-surface` tokens, exactly the idiom
// App.tsx's own EmptyStateCard/validation-error paragraph already use for one-off presentation
// needs a dedicated class doesn't yet cover.
//
// A11y (WCAG 2.2 AA): every row is a native `<input type="checkbox">` nested inside its own
// `<label>` (full keyboard operability + implicit `role="checkbox"` + name-from-content for free);
// the accessible name is the row's raw `skill_name_raw` verbatim, with no sibling text inside the
// label to pollute it. State is carried by non-color channels — the native checkbox's own checked
// glyph (shape) and `aria-checked` (semantics) are load-bearing; the border/background tint below
// is reinforcement only, and a small `aria-live="polite"` running total gives screen-reader users a
// non-visual channel for their edit progress. Every row is floored at 44px tall (this project's
// established touch-target convention — matrix.css's `.lev-status`/`.breakdown-chip` etc.) on every
// profile, not just under a coarse pointer, so desktop and touch share one guarantee. Any
// checked-state transition is gated behind `prefers-reduced-motion`, mirroring SkillMatrix's own
// `prefersReducedMotion()` check.

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function skillKeyOf(row: RoleSkillRow): string {
  return row.skill_key ?? normalizeSkillName(row.skill_name_raw)
}

export interface SkillConfirmationChecklistProps {
  /** The target role this draft was extracted against — display only, never re-derives anything. */
  role: string
  rows: RoleSkillRow[]
  autoDetectedKeys: Set<string>
  onConfirm: (checkedSkillKeys: Set<string>) => void
  onCancel: () => void
}

export function SkillConfirmationChecklist({
  role,
  rows,
  autoDetectedKeys,
  onConfirm,
  onCancel,
}: SkillConfirmationChecklistProps) {
  const titleId = useId()
  const reduced = prefersReducedMotion()

  // Local edit buffer only — starts from the real extraction's auto-detected set and never
  // mutates `autoDetectedKeys` itself. Re-synced whenever the caller hands this component a NEW
  // draft: `useRolePanel.submitResume` constructs a brand-new Set every call, so a resubmitted
  // resume while this checklist is still on screen starts its own fresh edit buffer rather than
  // carrying over stale toggles from the previous, now-superseded draft.
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set(autoDetectedKeys))
  useEffect(() => {
    setCheckedKeys(new Set(autoDetectedKeys))
  }, [autoDetectedKeys])

  function toggleRow(skillKey: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(skillKey)) next.delete(skillKey)
      else next.add(skillKey)
      return next
    })
  }

  const rowTransition = reduced
    ? undefined
    : 'background-color 160ms ease-out, border-color 160ms ease-out'

  return (
    <section
      className="card blueprint elev-md"
      aria-labelledby={titleId}
      data-testid="skill-confirmation-checklist"
    >
      <div className="card-kicker">Before we score it</div>
      <h2 id={titleId} className="lg-role-heading">
        Confirm what you already know
      </h2>
      <p style={{ margin: '4px 0 14px', fontSize: '14px', opacity: 0.75, maxWidth: '60ch' }}>
        We matched your resume against every skill {role} needs. The skills we found are checked
        below — review them, fix anything we missed or got wrong, then confirm to see your ranked
        gaps.
      </p>

      <p role="status" aria-live="polite" style={{ margin: '0 0 10px', fontSize: '12.5px', opacity: 0.7 }}>
        {checkedKeys.size} of {rows.length} skills checked
      </p>

      <ul
        style={{
          listStyle: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          margin: '0 0 16px',
          padding: 0,
        }}
      >
        {rows.map((row) => {
          const skillKey = skillKeyOf(row)
          const checked = checkedKeys.has(skillKey)
          return (
            <li key={row.skill_key ?? row.skill_name_raw}>
              <label
                className="lg-compare-toggle"
                style={{
                  minHeight: '44px',
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: `1px solid ${checked ? 'var(--have)' : 'var(--color-divider)'}`,
                  background: checked ? 'var(--have-soft)' : 'var(--color-surface)',
                  transition: rowTransition,
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleRow(skillKey)} />
                {row.skill_name_raw}
              </label>
            </li>
          )
        })}
      </ul>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(checkedKeys)}>
          Confirm skills
        </button>
      </div>
    </section>
  )
}
