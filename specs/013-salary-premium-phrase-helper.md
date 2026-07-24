[SPEC]
- **Objective**: Add a single deterministic helper, `formatSalaryPremiumPhrase`, that turns a raw
  `salary_premium_pct` number into a plain-language, sign-honest phrase ("12% above typical pay for
  this skill" / "8% below typical pay for this skill" / "right at typical pay for this skill" for
  the zero edge case), and wire it into `narrate.ts`'s two narration call-sites. This is pure
  copy/formatting — no scoring, gap, or join logic changes.
- **Inputs/Outputs**:
  - `formatSalaryPremiumPhrase(value: number | null): string | null` in `frontend/src/lib/format.ts`.
  - `null` in -> `null` out (callers keep their existing null-state handling unchanged — narrate.ts's
    `typeof row.salary_premium_pct === 'number'` guards already skip null fields entirely).
  - Rounding: reuse `formatNum`'s existing 2-decimal convention internally (call `formatNum`, don't
    reimplement rounding).
  - Sign rule (post-rounding, compare `Number(formatNum(value))`):
    - `> 0` -> `` `${formatNum(value)}% above typical pay for this skill` ``
    - `< 0` -> `` `${formatNum(Math.abs(value))}% below typical pay for this skill` `` — **never**
      render a literal minus sign in the phrase; direction is conveyed by the word "below" alone.
    - `=== 0` (this includes `-0` from a value like `-0.001` that rounds to zero) -> the literal
      string `"right at typical pay for this skill"` — no `0%` digit rendered at all (avoids the
      "0% above" oddity).
  - `narrate.ts` changes:
    - `scoreClauses` (~line 58-59): replace `` `a ${formatNum(row.salary_premium_pct)}% salary
      premium` `` with `formatSalaryPremiumPhrase(row.salary_premium_pct)` pushed directly as its
      own clause (reads naturally in the comma-joined sentence, e.g. "...demand 90, scarcity 40,
      12% above typical pay for this skill, a median 20 days to fill.").
    - `statChips` (~line 155): replace `` `+${formatNum(row.salary_premium_pct)}% salary` `` with
      `formatSalaryPremiumPhrase(row.salary_premium_pct)` used verbatim as the chip text.
    - `comparisonSentence`'s bare `topVal vs runnerVal` numeric comparison and `demandOnlySentence`
      are explicitly **out of scope** — `comparisonSentence`'s output (`headline`) is computed by
      `narrateTopGaps` but is never rendered anywhere in the current UI (confirmed: `App.tsx` only
      consumes `.moves`, `TopGapNarration.tsx` deliberately doesn't render `headline`). Do not touch
      it in this task; flag it to Cedar as a future task if it's ever surfaced in the UI.
- **Design Pattern**: none — simple case (one pure function, reused, no variation to encapsulate).
- **Bounded-AI boundary**: Everything here is a deterministic **display transform** of an
  already-computed, already-`formatNum`'d real field — same category as `formatNum` itself (see its
  own comment: "never a recomputation of the underlying score"). `Math.abs()` is a display-only
  sign transform; the sign is redundantly and correctly conveyed via the surrounding word
  ("above"/"below"), never silently dropped. No LLM involved, no new field computed.
- **Intellectual Control**: One canonical phrase-generating function, reused verbatim by both
  narration call-sites (and by Task 2's table cell) — a single point of truth for wording, so a
  future copy change never has to be hunted down in three files.
- **Constraints**: Pure, synchronous, zero I/O (matches `narrate.ts`'s existing zero-network
  guarantee). No new dependency. Do not change `formatNum`'s existing rounding/signature — it's
  still used internally and unchanged for every other field (`demand_score`, `scarcity_index`,
  `median_days_open`, etc.).
- **Edge Cases**:
  - `null` -> unchanged behavior at both call-sites (clause/chip omitted entirely, per existing
    `typeof === 'number'` guards).
  - Exactly `0` and values that round to `0` (e.g. `-0.001`) -> the no-percentage phrase, not
    `"0% above"`/`"0% below"`.
  - **Frozen-test risk (Cedar-authorized change)**: `narrate.test.ts`'s
    `assertEveryNumberIsProvenanced`/`allowedNumbers` helper currently only allows each field's
    *signed* `formatNum` value. Since the new negative-value phrase now displays `Math.abs(value)`
    instead of the signed value, extend `allowedNumbers` with a **narrow, field-scoped** addition:
    for `salary_premium_pct` specifically, also add `Math.abs(Number(formatNum(value)))` to the
    allowed set (two lines, comment why). Do not loosen the check for any other field or make the
    regex itself less strict — this is the one intentional, documented carve-out.
  - Add a new fixture (e.g. a row with `salary_premium_pct: -8.4` reused from an existing fixture
    array or a new small array) so a test can assert: (a) the rendered narrative contains
    `"below typical pay for this skill"`, (b) it does **not** contain a literal `-` immediately
    followed by a digit for that clause, (c) `assertEveryNumberIsProvenanced` still passes.
- **Files**:
  1. `frontend/src/lib/format.ts`
  2. `frontend/src/lib/format.test.ts` (new)
  3. `frontend/src/lib/narrate.ts`
  4. `frontend/src/lib/narrate.test.ts`
  5. `frontend/src/test/fixtures/narrateTopGap.fixture.ts`
- **Tipping Point**: If a third distinct phrasing style (beyond "full sentence clause" and "compact
  chip") is ever needed for this same field, promote `formatSalaryPremiumPhrase` to accept a
  `style: 'sentence' | 'chip'` option rather than duplicating logic — not needed today (both
  call-sites read fine with the identical full phrase).

[FORCES]
1. Bounded-AI text fidelity (Cypress's frozen provenance suite) > convenience of a quick copy edit
2. Simplicity > Pattern purity
