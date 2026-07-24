[SPEC]
- **Objective**: Three additions to `SkillMatrix.tsx`/`matrix.css`, all scoped to the existing
  scatter: (1) a small, always-visible **legend** near the plot spelling out the ✓/✕ glyph and the
  color-tier meaning in text (currently only inferable via `aria-label` or the table) — text-only,
  no new colors; (2) make the crowded-point name-label reveal **tap-accessible on touch devices**
  (today it's hover/`:focus-visible` only — a touch user has no direct way to reveal a crowded
  label without sequential Tab-focus); implement via a `aria-pressed` toggle button behavior that
  already exists as the point's `<button>` element — add a `data-revealed` state toggled on click,
  additive to (not replacing) the existing hover/focus CSS triggers; (3) a **settle-in transition**
  when the underlying `rows` change (i.e., a new role is picked) so bubbles animate to their new
  normalized position instead of jumping, reusing the exact `prefers-reduced-motion` gate pattern
  already in `matrix.css`'s `.matrix-point` transition block.
- **Inputs/Outputs**: No change to `RoleSkillRow`/props. The tap-reveal is local component UI state
  (a `Set<string>` of "revealed" skill keys, or a per-point boolean) — presentation-only, not
  derived from or written back to any score/gap data. Legend is static markup, no new props.
- **Design Pattern**: none — simple case. (Considered whether the three separate reveal triggers —
  hover, keyboard focus, tap — constitute enough variance to warrant a Strategy/State pattern;
  they don't: it's the same CSS `opacity` toggle driven by three different DOM triggers on one
  element, which is idiomatic CSS/React, not an algorithm family needing encapsulation.)
- **Bounded-AI boundary**: N/A — no scoring/gap logic touched; the "revealed" set is pure UI
  interaction state, and the settle-in transition animates already-computed, already-normalized
  coordinates (`scaleToPlot` output) — no new number is computed or displayed.
- **UI Scope**: structural (the legend is new DOM in the scatter section; the tap-reveal changes
  point interaction semantics). The motion addition within this same task is cosmetic on top of
  that existing structural change.
- **Intellectual Control**: The legend documents an encoding scheme that already exists in code
  comments (color-tier logic, glyph meaning) — making it visible closes the gap between "the
  a11y intent is correct in the accessible name" and "a sighted user has no on-screen key," without
  inventing new visual channels (WCAG non-color-only rule stays intact: glyph + position + name are
  still load-bearing, legend is explanatory text only). The tap-reveal is additive: it does not
  remove or alter the existing hover/`:focus-visible` triggers, so keyboard-only and mouse users see
  no behavior change.
- **Constraints**: No new dependency. Motion transition MUST stay inside the existing
  `@media (prefers-reduced-motion: no-preference)` block in `matrix.css` — a reduced-motion user
  must see bubbles land in their final position with no animation, exactly as today. Legend text
  must not restate raw numbers (those stay in the table) — it explains the *encoding*, not the
  *data*. Tap-reveal must not trap focus or require a second tap to dismiss on devices that also
  support hover (test both input modes).
- **Edge Cases**: A point that is both touch-"revealed" and simultaneously loses hover/focus should
  stay revealed until tapped again (don't fight the two triggers against each other — union the
  hover/focus/tap conditions, don't let one clear another). Legend must render even when
  `haveSkillKeys` is `undefined` (pre-resume-analysis state, glyphs absent) — omit the glyph-key line
  in that case rather than showing a stale/inapplicable key. Cross-role transition must not animate
  on the *initial* mount of a freshly picked role's first paint (only on a change from one already-
  rendered set of `rows` to another) — avoid a jarring fly-in on first load.
- **Files** (2):
    - `frontend/src/components/matrix/SkillMatrix.tsx`
    - `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: If a fourth interaction trigger for label-reveal is ever needed (e.g.,
  a "reveal all" toggle), or if the legend needs to become interactive/filterable, promote it to
  its own small subcomponent rather than growing `SkillMatrix.tsx`'s single render function further.

[FORCES]
1. Touch-device parity with mouse/keyboard interaction > leaving tap users with no direct reveal path
2. Simplicity > Pattern purity
