# 029 — Seniority gradient framing (UI, follow-on to spec 028)

## Context

Spec 028 shipped the deterministic data layer: `getSeniorityFraming(role, seniority)`
(`frontend/src/lib/seniorityFraming.ts`) returns a fixed, date-stamped sentence for any (role,
seniority) pair, built from the one validated cut of the Datamata AI Requirements Index. This SPEC
adds the actual seniority control to Step 1's picker card and renders that sentence — nothing else
changes. Per Park condition #2's own framing ("Given a target level, this becomes advice about the
user's actual position"), the sentence is phrased relative to whichever level the user picks, and
per this project's Bounded-AI discipline it must be observably, not just declaratively, inert with
respect to scoring: this SPEC's oracle proves that changing the seniority selection changes only
the framing text and nothing else on screen.

**Placement decision**: the framing sentence depends only on `selectedRole` + a new local
`selectedSeniority` — never on `haveSkillKeys`/`topGaps`/resume analysis at all. Rendering it
inside the resume-gated `analyzed` block (where `TopGapNarration` lives) would wrongly couple it to
the gap pipeline. Instead it renders in the always-available `lg-results-head` header, gated only
on `hasRows` (a role is loaded) and `selectedSeniority` being set — visible as soon as Step 1 is
complete, before or after Step 2. This placement is itself part of the Bounded-AI boundary: the
component that renders it never receives `rows`, `haveSkillKeys`, or `topGaps` as props at all, so
there is nothing in its own props for a scoring bug to leak through.

Lane: **OBSERVABLE**, structural UI scope — new interactive control, new DOM, routed to
**Magnolia**.

## [SPEC]

- **Objective**: Add an optional "Experience level" `<select>` to Step 1 (role picker) alongside
  the existing role `<select>`, and render `getSeniorityFraming(selectedRole, selectedSeniority)`'s
  result as a small, citation-styled note in the results header once both a role is loaded and a
  seniority level is picked. Selecting/changing seniority must never refetch, never touch
  `rows`/`haveSkillKeys`/`topGaps`/the matrix/the table — verified as an explicit oracle assertion,
  not just left untested.
- **Inputs/Outputs**:
  - `App.tsx`: new local state `const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | ''>('')`.
    New `<select id="seniority-picker">` under the existing role `<select>` in the Step 1 card,
    labelled `"Experience level (optional)"`, options: `''` → `"Not specified"`, `'entry'` →
    `"Entry level"`, `'mid'` → `"Mid level"`, `'senior'` → `"Senior level"`. Plain `onChange` sets
    `selectedSeniority` — no side effects, no refetch, no interaction with `handleRoleChange`.
  - Derived (not stored) each render: `const seniorityNote = hasRows && selectedSeniority ?
    getSeniorityFraming(selectedRole as Role, selectedSeniority) : null` — recomputes automatically
    on role change, so there is no stale-note bug and nothing to reset in `handleRoleChange`.
  - New component `SeniorityFraming({ note }: { note: string | null })` — renders `null` if `note`
    is `null`; otherwise a `<p>` with the sentence plus a visible, non-color-only "context, not a
    score input" cue (see Constraints). Receives **only** the derived string — no `rows`,
    `haveSkillKeys`, `role`, or `topGaps` props, structurally enforcing it cannot depend on scoring
    state.
  - Rendered once, in `lg-results-head`, immediately after the existing `lg-summary-tags` block —
    gated on `hasRows` only (independent of `analyzed`/Step 2).
- **Design Pattern**: none — simple case. One controlled `<select>`, one derived (not stored)
  string, one presentation component with a single optional prop — same shape as
  `TopGapNarration`'s own "render an already-computed value" idiom.
- **Bounded-AI boundary**: 100% deterministic; zero LLM calls; zero new computation — `App.tsx`
  only calls `getSeniorityFraming` (spec 028, already deterministic) and passes its return value
  straight through. `SeniorityFraming.tsx` takes no props beyond the finished string, so it is
  structurally incapable of touching `rows`/`arbitrage_score`/`haveSkillKeys`. This is asserted, not
  just stated: the e2e oracle (below) captures the rendered leverage/demand/scarcity values and the
  donut counts *before* and *after* changing `selectedSeniority`, and asserts they are unchanged —
  the concrete, user-visible proof that this control cannot affect the score.
- **Verification Oracle**: `frontend/src/components/matrix/SeniorityFraming.test.tsx` (new, vitest +
  `@testing-library/react` + `jest-axe`) — real red, module doesn't exist yet. **And**
  `frontend/e2e/seniority-framing.spec.ts @ mobile-touch-dark` + `@ desktop-dark` (new e2e spec) —
  a real cross-component interaction (picking a seniority value must change the header note without
  touching the matrix/table), the same class of oracle `skill-group-breakdown.spec.ts` already
  established for spec 027's analogous cross-component filter. Both must fail before implementation
  and pass after.
- **UI Scope**: **structural** — a new interactive control (the seniority `<select>`) and new DOM
  (the framing note), not styling on an unchanged layout.
- **Intellectual Control**: Reuses spec 028's already-tested, pure `getSeniorityFraming` verbatim —
  this SPEC adds no ranking/lookup/template logic of its own, only a control and a render. Because
  `SeniorityFraming.tsx` receives no scoring-related prop at all, a bug in this component's render
  path cannot corrupt or even read the score/gap surface spec 026/027 already locked down; the
  worst-case failure mode is "wrong or missing sentence," never "wrong number."
- **Constraints**: No new npm/pip dependency (`jest-axe`, `@testing-library/*`, `@playwright/test`
  already in use). Per CLAUDE.md's Accessibility section, the note must not rely on color alone to
  signal "this is context, not part of your score" — pair a neutral icon/label (e.g. a small
  `"ⓘ"` glyph with `aria-hidden` plus visible text like `"Context —"` prefixing the sentence, not a
  color-only badge, mirroring round 21's SkillGroupBreakdown fix for the same color-only pitfall).
  No animation/transition is introduced by this component, so no new `prefers-reduced-motion`
  handling is needed (flagged explicitly rather than silently skipped). Invoking the `dataviz`
  skill check per CLAUDE.md is **not** required here — this is plain prose, not a chart or
  aggregated-data visualization (distinguish from spec 027, which did need it).
- **Edge Cases**:
  - No role loaded (`hasRows` false) — the seniority `<select>` may still render (it's independent
    of role state) but `SeniorityFraming` renders nothing; never an empty citation box.
  - Role loaded, seniority left at `''` (default) — `SeniorityFraming` renders nothing; the note is
    genuinely optional, never forced.
  - Role loaded, seniority picked — note renders immediately, **even before Step 2 (resume) is
    completed** — proves the decoupling from the gap-analysis pipeline.
  - Changing `selectedRole` while a seniority level is already selected — the note updates
    automatically to the new role's mapped category (derived value, no stale state, no explicit
    reset code required — assert this directly, since a bug here would look like "the note didn't
    update").
  - Changing `selectedSeniority` — **the rendered matrix, leverage table, and donut counts are
    byte-identical before and after** (the core oracle assertion of this SPEC).
  - Changing `selectedSeniority` triggers **no** network request — assert no additional
    `fetchRoleSkillProfile`/stubbed-route call occurs relative to the same test without the change.
  - Keyboard-only operation: the new `<select>` is native, tab-reachable, operable via arrow
    keys/Enter, in a sensible tab order after the role `<select>`.
  - The mounted note (both with and without a value) stays axe-clean; the info cue is not
    color-only (see Constraints).
- **Files**: `frontend/src/App.tsx`, `frontend/src/components/matrix/SeniorityFraming.tsx` (new),
  `frontend/src/components/matrix/SeniorityFraming.test.tsx` (new),
  `frontend/e2e/seniority-framing.spec.ts` (new), `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: If a future SPEC wants the seniority value to affect *anything* beyond this one
  sentence (e.g. filtering the role profile itself, or a per-seniority skill list), that is a
  materially different feature requiring its own Cedar SPEC and its own Bounded-AI boundary review
  — this SPEC's guarantee ("seniority is display-only") must not be silently extended by a later
  patch. If `ROLE_TO_DATAMATA_CATEGORY` (spec 028) ever needs per-seniority overrides instead of one
  role→category mapping, that is also out of this SPEC's scope.

## [FORCES]

1. Placing the note outside the resume-gated `analyzed` block (decoupled from the gap pipeline) >
   colocating it with `TopGapNarration` for visual convenience
2. A component with no scoring-related props at all (structurally inert) > a component that
   receives `rows`/`haveSkillKeys` and is merely trusted not to use them
3. An oracle that asserts the score/matrix/table are unchanged across a seniority change > an
   oracle that only asserts the note's own text renders correctly
4. Simplicity > Pattern purity
