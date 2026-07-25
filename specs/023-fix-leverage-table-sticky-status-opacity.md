[SPEC]
- **Objective**: Permanently fix the Status column ghosting bug — non-sticky columns scrolling
  underneath the pinned `.lev-status`/`.lev-status-h` columns at ANY viewport width (confirmed at
  1280px desktop, not just mobile) must no longer show through the translucent have/gap pill tint.
  Remove the 560px unpin-sticky-columns stopgap (3f99806) since it only masked this below one
  breakpoint and is no longer needed once the real fix lands.
- **Inputs/Outputs**: No data/API shape changes. Pure CSS value change to two declaration blocks
  in `frontend/src/components/matrix/matrix.css`, plus removal of 5 lines from the existing
  `@media (max-width: 560px)` block. No TSX changes required — `SkillLeverageTable.tsx`'s DOM
  (the `.lev-status` `<td>` is already the sole sticky element carrying the tint) is correct as-is
  and is NOT restructured; do not add an inner `<span>` wrapper for the tint (that path was tried
  and reverted this session — it broke 6 test files' exact-literal-selector assertions for no
  functional gain over the fix below).
- **Design Pattern**: none — simple case. This is a CSS paint-order fix (layered `background`
  composite), not a structural/behavioral variation warranting a GoF pattern.
- **Bounded-AI boundary**: N/A — no scoring/gap/join/LLM logic touched. Pure presentational CSS.
- **UI Scope**: cosmetic — the DOM/layout of the table is unchanged; only the paint mechanics of
  an existing cell's background are corrected so the layout is visually stable during scroll.
- **Intellectual Control**: CSS background layers of a single box are composited with each other
  (top layer over layers below it, including `background-color`) as one atomic paint step for that
  box, before that box's rendered result is composited against anything positioned/scrolled behind
  it in the stacking context. Declaring the translucent status tint as the TOP layer of a
  multi-layer `background` value, with an opaque `var(--surface-1)` layer immediately beneath it
  in the SAME declaration, guarantees the sticky `<td>`'s final rendered pixels are fully opaque —
  regardless of viewport width, scroll position, or theme (light/dark both resolve `--surface-1`
  to an opaque hex already). This generalizes correctly at any table width/column count/breakpoint
  because it doesn't depend on a breakpoint at all — it fixes the actual paint-order defect, not a
  symptom at one viewport. It also does not regress the existing "reinforcement, never color-only"
  a11y contract: the glyph (✓/✕) and text label ("Already have"/"Worth learning") are untouched and
  remain the primary channel; color is still reinforcement only.
- **Constraints**: No new hex/rgba color literal — the opaque layer must reference `var(--surface-1)`
  (already used as `.lev-status`'s own base/neutral background, so this reuses an existing token,
  it does not introduce a new one) and the tint layer must reference the existing
  `var(--status-good-surface)`/`var(--status-critical-surface)` family exactly as today, just
  wrapped as one layer of a multi-layer value (e.g. via `linear-gradient(var(--X), var(--X))` used
  purely as a flat-color layer, or an equivalent standard CSS multi-layer-background technique —
  Redwood/Magnolia choose the exact syntax; no new CSS custom property, no new dependency). Do not
  touch `table-layout: fixed` or the sticky `left` offsets (those were fixed correctly by d5ba193
  and are out of scope). Do not reintroduce any width/breakpoint-conditional workaround for this
  specific bug — the fix must hold at all widths unconditionally.
- **Edge Cases**: Both themes (light default + `prefers-color-scheme: dark` + explicit
  `[data-theme='dark']`) must resolve `--surface-1` to an opaque color, so verify the two-layer
  background composite stays opaque in all three token blocks (it does today — `--surface-1` is
  never itself translucent). `haveSkillKeys` undefined (no `data-have` attribute at all, i.e. the
  base `.lev-status` neutral state) is unaffected — this SPEC only touches the `[data-have='true']`
  and `[data-have='false']` modifier rules, not the base `.lev-status` rule (which stays a plain
  `background: var(--surface-1)`, per the existing, still-passing seam-matching assertion).
- **Files**:
  1. `frontend/src/components/matrix/matrix.css` (the two-layer background fix on
     `.lev-status[data-have='true']`/`[data-have='false']`; delete the 5-line sticky-unpin rule
     inside the existing `@media (max-width: 560px)` block, keep the rest of that block intact).
  2. `frontend/src/components/matrix/SkillLeverageTable.test.tsx` (amend ONLY the two describe
     blocks named below — see the explicit test-contract amendment).
  3. (Read-only, no edits expected) `frontend/src/styles/colorTokens.test.ts` — confirm it still
     passes unmodified; its assertion is already lenient (captures the rule body, checks it's
     `toBeDefined()` and contains no `oldHardcodedHexValues` — a multi-layer `var()`-only value
     satisfies this with no change).
- **Tipping Point**: If a third sticky-adjacent translucency bug surfaces anywhere else in this
  table (e.g. a future sticky column added between rank/skill/status), extract this two-layer
  "opaque backdrop + tint" composite into a single reusable custom property (e.g.
  `--sticky-tint-good`/`--sticky-tint-critical`) so the pattern isn't hand-copied a third time —
  not needed yet for two call sites.

[FORCES]
1. Correctness at all viewport widths > convenience of a breakpoint-scoped patch
2. Simplicity > Pattern purity

## Explicit test-contract amendment

Authorized as part of this SPEC — Cypress applies this in lockstep with Redwood/Magnolia's CSS
change; only `SkillLeverageTable.test.tsx` changes, nothing else in the 6-file locked set.

**Describe block at `frontend/src/components/matrix/SkillLeverageTable.test.tsx` ~lines 469–501**
(`` `.lev-status[data-have]` reuses matrix.css's own --status-good/--status-critical alias
chain... ``):
- Change the two `it(...)` blocks that currently do `expect(bgM![1].trim()).toMatch(allowed)`
  (exact whole-value match) to instead assert the captured `background` value **contains** the
  expected family token as one layer, e.g. `expect(bgM![1]).toMatch(allowed)` (drop the `^...$`
  anchors so a multi-layer value can match on the tint layer specifically), while ADDING a new
  assertion in the same `it` that the same value **also contains** `var(--surface-1)` as an opaque
  backdrop layer (`expect(bgM![1]).toMatch(/var\(--surface-1\)/)`), so the test actively verifies
  the ghosting fix's mechanism (an opaque backdrop layer must be present), not just permits it.
- The existing "no fresh hex/rgba literal" `it` (~494–500) stays unchanged verbatim — a
  `linear-gradient(var(...), var(...))`-style composite introduces no hex/rgba literal, so it
  already passes.

**Describe block ~lines 503–571** (contrast-clears-AA-4.5:1 checks): the regex-extraction line
`const bgM = /background(?:-color)?\s*:\s*([^;]+);/.exec(body)` currently feeds the *whole*
captured value into `resolveDeclaredColorToHex`, which expects a single token/var chain. Update
the extraction to pull out only the translucent-tint layer specifically (the one matching the
`--status-good-surface`/`--status-critical-surface` family regex already defined as `allowed` in
the block above it) before calling `resolveDeclaredColorToHex`, e.g. by matching
`/var\(--status-(?:good|critical)(?:-surface)?\)/` within the captured background value rather
than assuming the whole value is one token. The composite-over-backdrop math inside
`resolveDeclaredColorToHex`/`compositeOverBackdrop` itself does **not** change — it already
alpha-composites an rgba tint over the supplied `surfaceHex` backdrop, which is precisely what the
new two-layer CSS now guarantees happens at render time too, so the AA contrast numbers this test
asserts remain valid and unchanged.

No other file in the locked 6 needs a single line touched — `glass-v2-tokens.test.ts`,
`glassmorphism.test.ts`, `nav-sidebar-glass-restyle.test.ts`, `scorecard-glass-restyle.test.ts`,
and `SkillMatrix.test.tsx` were confirmed (via grep) to contain zero references to `.lev-status`.

## Ordered tasks

1. **[Cypress]** Apply the two amendments above to
   `frontend/src/components/matrix/SkillLeverageTable.test.tsx` (widen the exact-match to a
   contains-match + add the opaque-backdrop-layer assertion; fix the contrast-test's tint-layer
   extraction). Run the full suite to confirm the *new* assertions currently FAIL against today's
   single-layer CSS (proving they test the right thing) and every other locked file still PASSES
   unmodified.
2. **[Redwood]** Implement the two-layer `background` composite on
   `.lev-status[data-have='true']`/`[data-have='false']` in
   `frontend/src/components/matrix/matrix.css`, and delete the 5-line sticky-unpin rule from the
   `@media (max-width: 560px)` block. Run the full test suite; all 6 previously-locked files plus
   the amended `SkillLeverageTable.test.tsx` must pass.

Files referenced: `frontend/src/components/matrix/matrix.css`,
`frontend/src/components/matrix/SkillLeverageTable.tsx`,
`frontend/src/components/matrix/SkillLeverageTable.test.tsx`,
`frontend/src/styles/colorTokens.test.ts`.
