import './matrix.css'

// specs/029-seniority-role-picker-ui.md: renders `getSeniorityFraming()`'s (spec 028) already-
// computed sentence verbatim — no ranking/lookup/template logic lives here. Bounded-AI boundary,
// enforced structurally (not just by convention): this component's ONLY prop is `note`, a plain
// `string | null`. It never receives any scoring-related prop (see SeniorityFraming.test.tsx's
// "Bounded-AI structural prop boundary" suite for the exact forbidden identifier list), so there
// is nothing in its own props for a scoring bug to leak through — asserted via source-text checks,
// not just runtime behavior.
//
// A11y (WCAG 1.4.1, "use of color"): the sentence is plain prose with no color signal of its own,
// but per CLAUDE.md's data-viz-adjacent non-color-only rule and mirroring round 21's
// SkillGroupBreakdown fix (spec 027), the "this is context, not a score input" cue is delivered by
// a visible "Context —" text prefix PLUS a neutral aria-hidden glyph — never a border/italic/color
// treatment alone. The glyph is aria-hidden so assistive tech isn't double-announced; the visible
// text already carries the meaning for screen-reader users. No animation/transition is introduced
// here, so no prefers-reduced-motion handling is needed (SPEC Constraints, flagged explicitly).
export function SeniorityFraming({ note }: { note: string | null }) {
  if (note === null) return null

  return (
    <p className="seniority-note">
      <span className="seniority-note-cue" aria-hidden="true">
        ⓘ
      </span>{' '}
      <span className="seniority-note-label">Context —</span> {note}
    </p>
  )
}
