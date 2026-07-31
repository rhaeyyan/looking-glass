[SPEC] 039b — Compare-mode-only sidebar collapse toggle

- **Objective**: A single disclosure-widget toggle, visible only when `compareMode` is true, that
  hides/shows the Step 1 ("Pick your target role") and Step 2 ("Paste your resume") sidebar cards
  together — freeing horizontal screen space for the 2-column `.compare-grid`. Single-role mode is
  unaffected: no toggle renders there, cards always visible.

- **Inputs/Outputs**:
  - New state: `const [sidebarVisible, setSidebarVisible] = useState(true)` — session-only, no
    `localPersistence.ts` change (matches `compareMode`'s own session-only treatment, spec 036).
  - New button, rendered only when `compareMode` is true, as the **first child of `.lg-sidebar`** —
    a sibling of, never a descendant of, the two collapsible cards, so it stays clickable regardless
    of their hidden state:
    ```jsx
    {compareMode && (
      <button
        type="button"
        className="btn btn-block lg-sidebar-toggle"
        aria-expanded={sidebarVisible}
        onClick={() => setSidebarVisible((visible) => !visible)}
      >
        {sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
      </button>
    )}
    ```
  - Both existing `<section className="card blueprint elev-sm">` cards (Step 1, Step 2) each gain
    `hidden={compareMode && !sidebarVisible}` — the native `hidden` attribute (removes from layout
    *and* the accessibility tree/tab order natively; verified no `[hidden]` override exists anywhere
    in `looking-glass.css`/`matrix.css` today that would defeat it). Gating on `compareMode &&` too
    (not `sidebarVisible` alone) is defense-in-depth: single-role mode can never render a hidden card
    even if `sidebarVisible` were left `false` from an earlier compare-mode session.
  - `handleCompareModeToggle`'s existing `!checked` (off) branch gains one line:
    `setSidebarVisible(true)` — auto-restore to visible regardless of prior state, per the human's
    confirmed behavior.
  - `matrix.css`: new `.lg-sidebar-toggle` rule (spacing only, e.g. `margin: 4px 0 12px;`) — reuses
    `.btn`/`.btn-block` verbatim for chrome, the exact idiom `.lg-add-third-role` used (spec 039a
    just retired that rule; this is its spiritual successor in the same "Spec 036 compare-mode
    controls" section of the file). No new color/accent token, matching that section's existing
    "ambient inherited color" convention for controls living outside `.matrix-root`/card-scoped
    selectors.
  - No `prefers-reduced-motion`-gated collapse animation: checked `matrix.css`'s existing
    `@media (prefers-reduced-motion: no-preference)` blocks (`.filter-status-clear`, `.btn-primary`,
    `.card.blueprint`) — all transition simple properties on elements that stay in the layout the
    whole time; none animates an element leaving/entering layout (which native `hidden` does
    instantly). Adding a measured-height transition here would be new, not-yet-earned machinery —
    plain instant show/hide is correct per the human's explicit steer.

- **Design Pattern**: none — simple case. One boolean driving `hidden` on two existing elements plus
  one button's text/`aria-expanded`; no GoF pattern earned.

- **Bounded-AI boundary**: Zero LLM, zero computation — pure client-side view-state toggle.

- **Verification Oracle**: new file `frontend/e2e/compare-sidebar-toggle.spec.ts` @ desktop-light,
  @ desktop-dark (primary — the screen-space motivation is desktop-specific), @ mobile-touch-dark
  (compatibility check — the toggle must still function even where the space-saving motivation
  doesn't apply). Assertions:
  1. Single-role mode (`compareMode` off, default): no `.lg-sidebar-toggle` button exists at all;
     both Step 1/Step 2 card headings are visible — proves the toggle is compare-mode-only.
  2. Turning on "Compare roles" reveals the toggle, `aria-expanded="true"` by default, both cards
     still visible (opens already-expanded).
  3. Clicking the toggle hides both cards in one action (Step 1/Step 2 headings both
     `not.toBeVisible()`), `aria-expanded` flips to `"false"`, accessible name updates to
     `"Show sidebar"`.
  4. Clicking again restores both cards, `aria-expanded="true"`, name back to `"Hide sidebar"`.
  5. With the sidebar collapsed, turning "Compare roles" off restores both cards to visible and
     removes the toggle entirely (single-role mode never shows it) — the core auto-restore behavior.
  6. Collapsing the sidebar never affects `.compare-grid`'s own 2 result columns — they stay
     rendered/visible throughout, proving this toggle touches only the Step 1/2 cards.

- **UI Scope**: structural — a new disclosure control plus a `hidden` attribute on two existing
  elements is a real DOM/behavior change, not a style/motion tweak to an unchanged layout.

- **Intellectual Control**: One boolean drives exactly two `hidden` expressions plus one button's
  rendered text/`aria-expanded` — no new component, no new cross-state coupling. The native `hidden`
  attribute means focus/tab-order exclusion and layout removal are enforced by the browser, not
  hand-rolled CSS. Gating both the button's render-guard and the `hidden` expression on `compareMode`
  makes single-role mode's behavior provably unreachable-different.

- **Constraints**: No new dependency. No `localPersistence.ts` change (session-only, matching
  `compareMode`). No change to `.compare-grid`/`.compare-column`/`RoleResultsPanel`/
  `SkillConfirmationChecklist` — scope is strictly the Step 1/2 sidebar cards' visibility. **Depends
  on 039a having landed first**: this SPEC's `App.tsx` edits assume the 2-wide `roleSlots`/`panels`/
  `activeSlotIndices` shape 039a produces (no `panel2`, no `showThirdSlot`) — do not build against a
  pre-039a tree.

- **Edge Cases**: Changing a role or resubmitting the resume while the sidebar is collapsed must not
  force it back open — no code path here touches `sidebarVisible` except the toggle click and the
  compare-mode-off auto-restore, so this falls out for free. The toggle button is never a descendant
  of the `hidden`-gated cards (stated explicitly since it's the one structural detail an
  implementation could get wrong silently) — this is what guarantees the user can always re-expand.

- **Files**: `frontend/src/App.tsx` (edit, Magnolia), `frontend/src/components/matrix/matrix.css`
  (edit, Magnolia), `frontend/e2e/compare-sidebar-toggle.spec.ts` (new, Cypress — red first).

- **Tipping Point**: If a future SPEC wants the two cards independently collapsible,
  `sidebarVisible` becomes two booleans and the single button becomes two — that is the point this
  stops being "one flag, one button." If a future SPEC persists this across reloads, it joins
  `compareMode`'s own session-only exception in `localPersistence.ts` and needs its own
  justification for reversing that.

[FORCES]
1. One combined control over both cards, per the human's explicit decision > two independent per-card toggles
2. Reuse existing native `hidden` + `.btn`/`.btn-block` idioms > inventing new chrome or a custom collapse animation
3. Simplicity > Pattern purity

[IMPLEMENTATION NOTE — post-build amendment, recorded per this project's "durable facts belong in
durable places" convention, not left only in a completion report]
Two assumptions in this SPEC's prose didn't hold once built against the real oracle, and the shipped
code deviates from the literal text above accordingly (both verified necessary — the declared oracle
failed without them, passed with them):
1. **The native `hidden` attribute needed a CSS assist.** This SPEC claimed no `[hidden]` override
   existed that would defeat it, but `looking-glass.css`'s `.card { display: flex; }` is an
   author-origin rule, and author rules always beat the browser's user-agent `[hidden] { display:
   none }` rule regardless of specificity — so `hidden` was silently inert on both cards. Fixed with
   an explicit `.lg-sidebar .card.blueprint[hidden] { display: none; }` override in `matrix.css`.
2. **The "Compare roles" checkbox moved out of the Step 1 card.** As originally specified, the
   checkbox lived inside the same `<section>` this SPEC hides — collapsing the sidebar would have
   made the one control that re-expands it (by turning compare mode off) unreachable. The
   `.lg-compare-toggle-field` is now a sibling of both cards in `.lg-sidebar`, same reachability
   guarantee as the toggle button itself. No test in this codebase ties the checkbox to a specific
   DOM ancestor (both `compare-roles.spec.ts` and `compare-confirmation.spec.ts` locate it only via
   `page.getByLabel('Compare roles')`), so this had zero blast radius on existing coverage.
