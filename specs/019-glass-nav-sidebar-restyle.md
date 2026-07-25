[SPEC]
- **Objective**: Restyle the nav and the two sidebar step cards to the new glass design-language
  using spec 018's tokens, and land the header copy drive-by. Nav: sticky glass background (via
  `--glass`), brand lockup unchanged, and a pill-shaped segmented light/dark toggle replacing the
  current `.seg`/`.seg-opt` visual treatment. Sidebar cards: glass panel (`--glass-2`) with a
  diagonal sheen overlay (`--sheen-a`/`--sheen-b`) and a NEW numbered circular gradient badge
  ("1", "2") next to each step's title.
- **Inputs/Outputs**: CSS changes to `.nav`, `.seg`/`.seg-opt`, `.card.blueprint` (sidebar
  variant), plus one new decorative element per sidebar `<section>` (a `<span class="lg-step-badge"
  aria-hidden="true">1</span>`-style circular badge — decorative only, since the step number is
  already conveyed by the existing `.card-kicker` text "Step 1"/"Step 2" which remains the
  accessible source of truth). `App.tsx`'s H1 changes "Find the one skill worth learning first" →
  "Find the skills worth learning first"; subhead reworded per the design copy.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — presentation + copy only. No `lib/` file touched; no gap/score/
  join logic changes.
- **UI Scope**: **mixed — flag explicitly.** The nav pill-toggle restyle and sidebar glass/sheen
  are **cosmetic** (same DOM, new CSS). The numbered circular badge is **structural**: it is a new
  DOM element with no equivalent in the current markup (today's only step-number cue is the
  `.card-kicker` text). Cypress should test it as new UI (element exists, is `aria-hidden`, does
  not duplicate/contradict `.card-kicker`'s accessible text), not audit it as a restyle.
- **Intellectual Control**: The pill toggle is a pure CSS re-skin of the existing radio-based
  `.seg`/`role="group"` control — `App.tsx`'s `<input type="radio">` pair and
  `aria-label="Colour theme"` group stay exactly as they are today; only `.seg`/`.seg-opt`'s CSS
  changes (rounded track, active-option gradient-filled pill via the existing
  `:has(input:checked)` selector already in use). This avoids the common "re-skin regresses
  keyboard/screen-reader semantics" failure mode Cypress should specifically probe for (same
  `role="group"`, same radio names, same checked-state announcement). The numbered badge is
  additive and decorative (`aria-hidden="true"`) precisely so it cannot become a second,
  potentially-inconsistent source of truth for "which step is this" — `.card-kicker` remains the
  one accessible label.
- **Constraints**: `.nav` and sidebar `.card.blueprint` sections get their own radius token per
  the design (13px for sidebar cards) — introduce `--radius-card-sm: 13px` (or equivalent) scoped
  to this SPEC's selectors only, do not touch `--radius-md`. All glass/sheen values must come from
  spec 018's tokens (`--glass-2`, `--sheen-a`/`--sheen-b`, `--brd`/`--edge`) — no new ad hoc rgba
  literals. Sheen overlay must not degrade text contrast under it (same composite-then-check
  methodology as spec 018, applied to sidebar card text against `--glass-2` + sheen layered over
  `--page`). Header H1/subhead copy change is a literal string swap only — do not touch any
  surrounding logic/markup structure.
- **Edge Cases**: Focus-visible outline on the toggle buttons and on the sidebar `select`/
  `textarea`/`button` must remain legible against the new glass background in both themes.
  Reduced-motion: any new hover/active transition on the pill toggle must be gated behind
  `prefers-reduced-motion: no-preference` per existing convention. `.seg` and sidebar cards must
  still render usably if `backdrop-filter` is unsupported (graceful degradation — the `--glass*`
  background alone, sans blur, must still clear contrast).
- **Files** (3):
    - `frontend/src/App.tsx`
    - `frontend/src/styles/looking-glass.css`
    - `frontend/src/App.test.tsx` (extend — assert the radio-group semantics survive the pill
      re-skin, assert the new badge is `aria-hidden` and non-duplicative, assert the new H1/
      subhead copy)
- **Tipping Point**: If a third theme option (e.g. "system") is ever added, the two-button
  `.seg`/pill-track CSS (built for exactly two options) needs redesign — do not stretch this
  layout to a 3-way segmented control without a new SPEC.

[FORCES]
1. Same accessible radio-group semantics > any cosmetic re-skin convenience
2. Decorative-only badge (single source of truth stays `.card-kicker`) > a second competing label
3. Simplicity > Pattern purity
