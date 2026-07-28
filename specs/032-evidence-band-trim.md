# [SPEC] 032 — SkillMatrix + SkillLeverageTable: drop own card chrome, become Evidence-card bands

- **Objective**: Strip `SkillMatrix` and `SkillLeverageTable`'s own card chrome (border/background/shadow/padding from `card blueprint elev-md`) so they read as flush bands inside one shared Evidence-card wrapper (assembled in SPEC 033), per README Bands 3–4. Drop `SkillMatrix`'s closing "Prefer the numbers?" sentence (dead once the table is visibly in the same card). Demote `SkillLeverageTable`'s heading from `<h2>` to `<h3>` since it now sits under the Evidence card's own `<h2>` (Band 1's heading).
- **Inputs/Outputs**: No prop-signature changes to either component — both already accept `rows`/`haveSkillKeys` (`SkillLeverageTable` also `roleName`), and both already operate correctly on whatever subset of rows they're given (min/max axis scaling in `SkillMatrix`, rank numbering + leverage-bar normalization in `SkillLeverageTable` both already recompute per-call over their `rows` prop — confirmed by reading both files; **no logic change is needed for filtered-subset correctness**, only the JSX chrome and one heading tag).
- **Design Pattern**: none — simple case. `Simplicity > Pattern purity`.
- **Bounded-AI boundary**: Zero computation change. Bubble scaling, banding, and the leverage-bar width are unchanged presentation transforms of already-computed fields; this task touches only chrome classes, one heading tag, and one deleted sentence.
- **Verification Oracle**: `frontend/src/components/matrix/SkillMatrix.test.tsx` (new assertions: the component's root section no longer carries `card`/`blueprint`/`elev-md` classes; the text "Prefer the numbers" is no longer present) and `frontend/src/components/matrix/SkillLeverageTable.test.tsx` (new assertions: root no longer carries `card`/`blueprint`/`elev-md` classes; the ranked-table heading is `role="heading"` level `3`, not `2`, with its text unchanged verbatim — `{roleName} — every skill, ranked by leverage`). No e2e file needs editing: confirmed by reading `frontend/e2e/leverage-table.spec.ts` and `skill-group-breakdown.spec.ts` — neither asserts on card-chrome classes or heading level, both select by `table.leverage-table`/`data-testid`/role text, which are untouched here.
- **UI Scope**: structural (chrome removal + heading-level change is a DOM change, not styling-only).
- **Intellectual Control**: Because neither component's own filtering/scaling logic needs to change (each already recomputes purely from its `rows` prop, confirmed by reading both files line-by-line), this task is provably chrome-only — the smallest possible diff that satisfies the README's Band 3/4 requirements, with nothing to regress in the scoring/display-transform layer underneath.
- **Constraints**: No new dependency. `matrix.css`: add the Band 3 padding rule (`16px 20px 4px`, on `.matrix-root`) and Band 4 padding rule (`10px 20px 20px`, on `.leverage-root`), replacing whatever padding `card`/`blueprint` used to supply; delete the now-dead `.matrix-alt-note` rule (the JSX that used it is gone). Split `.ladder-title` out of the shared `.matrix-title, .ladder-title, .breakdown-title { font-size: 1.05rem; }` rule into its own declaration at `0.9375rem` (README's demoted-heading size) — `.matrix-title`/`.breakdown-title` stay at `1.05rem`. **Do not** delete the existing `.matrix-root`/`.leverage-root` `border-radius: var(--radius-card)` rules even though they become visually inert once chrome is removed — leaving them is harmless (no border/background left to round) and avoids touching CSS-string tests that already assert those rules exist, which would otherwise push this task over the 5-file cap.
- **Edge Cases**: The scatter's have/gap legend chips and the table's Status column are both already conditionally gated on `haveSkillKeys !== undefined` — unaffected by this task; do not touch that gating (README's "Role picked, no resume yet" state — screen 3 — already renders correctly through this existing logic once wired into the two-card shell in SPEC 033).
- **Files**:
  1. `frontend/src/components/matrix/SkillMatrix.tsx`
  2. `frontend/src/components/matrix/SkillMatrix.test.tsx`
  3. `frontend/src/components/matrix/SkillLeverageTable.tsx`
  4. `frontend/src/components/matrix/SkillLeverageTable.test.tsx`
  5. `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: If a third component ever needs to shed its own card chrome to become a shared-card band, extract the recurring `padding`/no-radius/no-border pattern into one reusable band utility class instead of repeating bespoke padding per component.

```markdown
[FORCES]
1. Chrome-only diff (provably no scaling/ranking-logic change needed) > a larger opportunistic refactor
2. Simplicity > Pattern purity
```
