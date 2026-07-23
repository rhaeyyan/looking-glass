import { useId } from 'react'
import type { RoleSkillRow } from '../../lib/supabaseClient'
import './matrix.css'

// Top-gap narration (spec 005, Task 6): a small, single-purpose display of `narrateTopGap`'s
// already-computed result — no LLM call, no scoring, no reformatting of its numbers here. The
// component's only job is to give the narrative a labelled, keyboard-reachable home in the DOM.
//
// `runnerUpGap` is accepted (not merely `topGap` + `narrative`) to keep the prop shape matched to
// `narrateTopGap`'s return value 1:1 — the Tipping Point note in the SPEC calls out revisiting
// this shape before adding per-row rationale; it is intentionally unused in the rendered output
// today (the sentence itself, built in `narrate.ts`, already folds any runner-up comparison into
// `narrative`).
export function TopGapNarration({
  topGap,
  narrative,
}: {
  topGap: RoleSkillRow
  runnerUpGap: RoleSkillRow | null
  narrative: string
}) {
  const titleId = useId()

  return (
    <section className="narration-root" aria-labelledby={titleId}>
      <h2 id={titleId} className="narration-title">
        Your top gap: {topGap.skill_name_raw}
      </h2>
      <p className="narration-text">{narrative}</p>
    </section>
  )
}
