[SPEC]
- **Objective**: Render the plain-language `formatSalaryPremiumPhrase` (from spec 013) in the
  leverage table's "Salary premium" column instead of the bare `±X%`, and add a persistently
  visible, `aria-describedby`-linked footnote explaining what "typical pay" means, so both sighted
  and assistive-tech users get the same baseline explanation without relying on a native `title`
  tooltip (not WCAG-2.2-AA-sufficient for meaningful content) or an unprecedented interactive
  popover (none exists elsewhere in this app to justify the added complexity).
- **Inputs/Outputs**:
  - Table cell (~line 121): replace
    `` `row.salary_premium_pct == null ? '—' : `${formatNum(row.salary_premium_pct)}%`` `` with
    `row.salary_premium_pct == null ? '—' : formatSalaryPremiumPhrase(row.salary_premium_pct)`.
  - Column header `<th scope="col">Salary premium</th>` gains: (a) a visible, `aria-hidden="true"`
    marker glyph appended to the header text (e.g. a footnote asterisk) so sighted users see there's
    more context, and (b) `aria-describedby={footnoteId}` (generated via the file's existing
    `useId()` pattern — reuse the same convention as `titleId`, don't hardcode a string id) pointing
    at a new, always-visible `<p id={footnoteId}>` rendered once below the table (near the existing
    `ladder-hint` paragraph), not per-row.
  - Footnote copy must state, honestly and without overclaiming: this is the dataset's own
    "salary premium" metric, compared against typical pay **for that skill's job category**
    (the documented D1 grain is `snapshot_date, category, skill_name` — do not claim a more precise
    comparison group such as "postings without this skill," since that specific methodology is not
    documented anywhere in this repo — `data/raw/d1/skill-scarcity-index.json`, which would carry
    the dataset's own column description, is gitignored and absent here). If that manifest file
    happens to exist in the implementer's local checkout, verify/refine wording against its actual
    description before shipping, but ship this conservative category-baseline wording as the
    documented default otherwise.
- **Design Pattern**: none — simple case (static disclosure text + one ARIA attribute).
- **UI Scope**: structural (new footnote element + new `aria-describedby`/id wiring; not just a
  style change).
- **Bounded-AI boundary**: Purely a display/copy concern — no score, gap, or join computed or
  changed. `formatSalaryPremiumPhrase` is imported verbatim from spec 013's `format.ts`, never
  reimplemented here.
- **Intellectual Control**: Reuses the file's existing `useId()` convention for a collision-safe
  footnote id (matches how `titleId` is already generated), so this remains safe if the table is
  ever rendered more than once on a page.
- **Constraints**: No new dependency, no interactive JS state (no open/close toggle) — the footnote
  is always rendered, satisfying WCAG 2.2 AA without needing focus-management/Escape-key handling
  that a popover/disclosure-toggle would require. Must not introduce color-only signaling (N/A here,
  text-only change).
- **Edge Cases**:
  - `row.salary_premium_pct == null` -> unchanged `'—'` rendering (no footnote reference needed for
    that specific cell; the column-level footnote still applies generally).
  - Verify with `axe-core` (this file already sits under WCAG 2.2 AA governance per CLAUDE.md) that
    the new footnote paragraph + `aria-describedby` reference produces zero new violations, and that
    the referenced id actually exists in the DOM (dangling `aria-describedby` is itself an
    axe/WCAG failure).
- **Files**:
  1. `frontend/src/components/matrix/SkillLeverageTable.tsx`
  2. `frontend/src/components/matrix/SkillLeverageTable.test.tsx`
  3. `frontend/src/components/matrix/matrix.css`
- **Tipping Point**: If a second metric elsewhere in the app ever needs the same
  visible-footnote-plus-`aria-describedby` treatment, extract it into a small shared
  `<FootnoteRef>`/`<FootnoteText>` pair instead of copy-pasting the pattern a second time.

[FORCES]
1. WCAG 2.2 AA (no title-tooltip, no dangling aria-describedby) > minimal-markup convenience
2. Simplicity > Pattern purity
