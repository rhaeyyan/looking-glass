# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-24 (round 5: light-mode contrast, responsive wrapping, glass-ui)

> Specs 001–007, the same-day earlier rounds (redesign/de-jargon/top-3-moves; UI/UX+dataviz pass
> 008-010; 15-role expansion 011-012; salary-premium clarity 013-014), and the 2026-07-23 milestone
> session are archived in [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

### Accomplished (round 5, this section)
- User reported light-mode text is too low-contrast, text blocks overflow/wrap awkwardly at
  certain widths, and asked for glassmorphism design elements reflecting the "Looking Glass" name.
- **Investigated with real numbers before routing anything**: computed actual WCAG contrast ratios
  from the live CSS rather than guessing. Found `--color-accent` (#5980a6, used for kickers/
  outline-tags/links) at 3.71:1 — fails AA's 4.5:1. Found only 2 elements in the whole stylesheet
  had `overflow-wrap`/`min-width: 0` set. Found the design skill's own glassmorphism entry flags
  "⚠ Contrast risks" — a real tension with the contrast ask if handled carelessly.
- **Routed through Cedar** given the scope (core design tokens + a real tension to resolve, not
  just cosmetic). Cedar independently re-verified the numbers and found more: `--have-tone`
  borderline-fails (4.489:1), `.lg-donut-label`'s opacity dimming fails (9px, no large-text
  exemption), `--text-muted` (matrix.css) fails against all 3 surfaces it's used on, and
  `.matrix-zone-hi` was borrowing a data-identity chart color (`--series-1`) as label text — both
  a contrast failure and semantically wrong (risks blurring the scatter's real color-coding).
  For wrapping, Cedar audited (not guessed) and found exactly 2 real bugs: `.topmove`'s grid
  column has no `minmax(0, 1fr)` (resume-driven skill names can overflow), and `.nav-brand` can't
  shrink/wrap its pill. Several other candidates (card titles, tags) were checked and correctly
  ruled out as already fixed or not actually at risk (column-direction flex isn't subject to the
  same shrink-refusal bug).
  For glassmorphism: since every backdrop in this app is a flat token color (no photos/video),
  Cedar specified "is text readable under glass" as a fully computable, Cypress-testable quantity
  rather than a judgment call — glass scoped to `.card.blueprint`/`.nav` chrome only, light mode
  only, must build on the corrected tokens, and must never touch matrix.css's own opaque surfaces
  (so the scatter/table's have/gap color-coding is never put at risk).
  **Three SPECs written, user-approved, persisted**: [specs/015](specs/015-fix-light-mode-contrast.md)
  (token-level contrast fixes, Cypress→Magnolia), [specs/016](specs/016-fix-responsive-text-wrapping.md)
  (the 2 audited wrapping bugs, Cypress→Magnolia), [specs/017](specs/017-glassmorphism-card-nav-chrome.md)
  (glass accents constrained by a deterministic contrast check, Cypress→Magnolia). Sequenced
  015→016→017 (015/016 share files; 017 needs 015's corrected tokens underneath it). Committed
  (`6a93b9f`).
- **Spec 015: Cypress's failing tests landed** — extended `colorTokens.test.ts` with a reusable,
  exported `contrastRatio`/`hexToRgb`/`resolveToHex` WCAG helper (specs 016/017 will reuse it, not
  re-derive), 7 red tests confirming the exact failing ratios above, 181 pre-existing tests
  unaffected. **Magnolia now dispatched** to fix the actual hex/opacity values; not yet returned.

### Accomplished (round 4 — salary-premium clarity, specs 013–014)
- User asked what a negative `salary_premium_pct` means. Explained: it's a raw D1 field (no floor
  clip in `src/scoring/arbitrage.py` — only `min(value, 100)` upper-clips), so a negative value is
  genuine evidence the skill pays *below* baseline, not a data error or "no premium" — and it
  genuinely pulls `scarcity_index` down, unlike a missing value (which renormalizes weights
  instead).
- User asked to make this concept clearer in the UI. Chose **both** plain-language reframing
  ("12% above typical pay" instead of bare "+12%") **and** an accessible baseline-definition
  affordance, applied consistently to the leverage table AND the narration text (not table-only).
- **Routed through Cedar** (touches `narrate.ts`'s Bounded-AI narration logic + a real
  accessibility-pattern decision, not just cosmetic). Cedar found the D1 dataset's own manifest
  (which would state the exact baseline `salary_premium_pct` is measured against) is gitignored
  and absent from this repo — chose conservative, sourced wording ("typical pay for that skill's
  job category") rather than inventing precision. Found no existing tooltip/disclosure pattern
  anywhere in the app to reuse, and ruled out native `title` (not WCAG-2.2-AA-sufficient for
  meaningful content) — spec'd an always-visible footnote + `aria-describedby` instead of a new
  interactive popover (Simplicity > Pattern purity: a static sentence didn't earn new JS state
  machinery). Also caught a real risk before it became a bug: the frozen Bounded-AI provenance
  suite (spec 005's `assertEveryNumberIsProvenanced`) would fail once negative values render via
  `Math.abs()` instead of their signed form — authorized a narrow, field-scoped extension of that
  check (salary_premium_pct only), not a general loosening.
  **Two SPECs written, user-approved, persisted**:
  [specs/013](specs/013-salary-premium-phrase-helper.md) (a `formatSalaryPremiumPhrase` helper +
  narrate.ts wiring, Cypress→Redwood) and
  [specs/014](specs/014-salary-premium-table-footnote.md) (table cell + accessible footnote,
  Cypress→Magnolia, sequenced after 013 since it imports 013's helper). Committed (`e3d28f0`).
- **Spec 013: shipped and merged** (`362d080`). Cypress wrote 13 failing tests
  (format.test.ts new, narrate.test.ts extended with a narrow allowedNumbers carve-out for
  salary_premium_pct only, fixture extended with a negative-salary-premium row); Redwood
  implemented `formatSalaryPremiumPhrase` in format.ts and wired it into narrate.ts's
  scoreClauses/statChips. **Verified: 162/162 vitest, eslint/tsc clean.**
- **Spec 014: Cypress wrote failing tests, Magnolia implemented** — plain-language phrase in the
  table cell + a visible `*` marker + `aria-describedby`-linked always-visible footnote (no
  `title` tooltip, no color-only signaling, `useId()` convention reused). 168/169 vitest,
  eslint/tsc clean, axe-clean.
- **Cross-spec regression found, fixed, and merged**: spec 009's App.test.tsx had a brittle
  assertion — "fewer than 3 `[aria-hidden=\"true\"]` descendants of `.lg-results`" — used as a
  proxy for "the loading skeleton is gone." Spec 014's legitimate new `aria-hidden` footnote
  marker (always present once the table renders) coincidentally broke that threshold. Cypress
  rescoped all 5 affected assertions to the real `.lg-skeleton`/`.lg-skeleton-block` selectors
  spec 009 introduced, instead of a generic aria-hidden count — immune to future collisions.
  **169/169 vitest, eslint/tsc clean.** Committed (`04c6d91`).

### Unfinished / blocked
- **Spec 015**: Magnolia implementing the actual contrast fixes against Cypress's 7 red tests;
  not yet returned. Specs 016 and 017 are blocked on 015 (016 shares files; 017 needs 015's
  corrected tokens).
- Rounds 1-4 (specs 001-014, `@types/node`, font swap, 15-role expansion, salary-premium clarity)
  remain fully merged/pushed — no carryover blockers from earlier in the day.

### Next Steps
1. Check on the backgrounded Magnolia agent (spec 015); when it returns, verify the 7 previously-
   red tests flip green with zero regressions (181 baseline), eslint/tsc clean, then commit.
2. Dispatch Cypress→Magnolia for spec 016 (the 2 audited wrapping bugs), then spec 017
   (glassmorphism, needs a `dataviz`-skill sanity check per Cedar's note before the `.matrix-zone-hi`
   color reassignment and before scoping the glass treatment away from matrix.css's surfaces).
3. Push `main` to `origin/main` once all three specs land.
4. If a better learning-resource dataset surfaces later, re-run Birch's join-test methodology
   (pull the real 141-skill list live from Supabase `skills_core` via the anon-key REST endpoint —
   don't re-extract D1/D2 raw CSVs, they're gone locally and this is faster) before committing to
   an ingest spec.
5. If resume upload is revisited later: route through Cedar first for dependency authorization
   (pdf.js at minimum) before any implementation.
6. Prefer synthetic resume text for any manual verification (Zero-Trust "no real user PII").
7. Note: `playwright-core` (headless Chromium driver used for live screenshots in an earlier
   session) was installed `--no-save`, so it is **not** in `package.json` — reinstall it
   (`npm install --no-save playwright-core@1.50.0`) if another live screenshot pass is needed. A
   live browser pass on round 2's UI work, round 4's salary-premium phrasing/footnote, and round
   5's contrast/wrapping/glass fixes hasn't been done yet — only automated tests — worth doing
   before considering those rounds fully verified. Live verification is especially valuable for
   round 5 given it's inherently visual (contrast, wrapping, glass blur).

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
