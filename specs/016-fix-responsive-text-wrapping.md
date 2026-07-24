[SPEC]
- **Objective**: Fix the two confirmed instances where a flex/grid child carrying real (often
  dynamic) text cannot shrink below its intrinsic content width, causing overflow or an awkward
  break instead of smooth wrapping:
  1. `.topmove` (matrix.css): change `grid-template-columns: 1.5rem 1fr` to
     `grid-template-columns: 1.5rem minmax(0, 1fr)` so the content column can actually shrink (CSS
     Grid's implicit per-item minimum is `auto`/max-content, the same trap as flexbox's
     `min-width: auto`). Add `overflow-wrap: anywhere` to `.topmove-name` (carries
     `skill_name_raw`, resume/dataset-driven, unbounded length, currently zero overflow
     protection) and to `.topmove-note`, matching the existing `overflow-wrap: anywhere` pattern
     already used on `.lev-skill`/`.lg-results-title`.
  2. `.nav-brand` (looking-glass.css): add `min-width: 0` (it's a flex item of `.nav`, a row flex
     container) and `flex-wrap: wrap` (it is itself a row flex of the wordmark + the "PIVOT ENGINE"
     tag pill, currently unable to drop the pill to its own line before overflowing).
- **Inputs/Outputs**: No data/props/JSON shape changes — CSS-only.
- **Design Pattern**: none — simple case.
- **Bounded-AI boundary**: N/A — layout/CSS only.
- **UI Scope**: structural (these are layout-mechanics changes — grid track sizing and flex-wrap
  behavior — not pure paint/styling on an otherwise-unchanged layout; no DOM elements are
  added/removed, but wrap behavior at real breakpoints changes, so treat test rigor accordingly).
- **Intellectual Control**: Both fixes are audited, not guessed: verified `.card-title`/
  `.card-kicker` sit in a *column*-direction flex container (`.card`), where the min-width:auto
  shrink trap does not apply, and confirmed no fix is needed there. Verified
  `.lg-summary-tags .tag`, `.lev-skill`, `.lg-results-title`, `.lg-scorecard-narration`, and
  `.narration-root` already carry the fix from specs 009/010 and are out of scope. Only apply the
  fix where a row-direction flex/grid container has a text-bearing child with no shrink/wrap
  protection — do not blanket-apply `overflow-wrap: anywhere` to every selector.
- **Constraints**: Do not add `overflow-wrap`/`min-width: 0` to any selector not named above without
  demonstrating (in the completion report) the actual flex/grid axis direction that makes it a real
  risk. Do not change `.leverage-table`'s `white-space: nowrap`/horizontal-scroll design — that is
  intentional (wide table scrolls inside its own card by design, per existing comments), not a bug.
- **Edge Cases**: `.topmove-name` can be a very long multi-word skill string from the underlying
  Kaggle skill vocabulary (no length cap in the data layer) — the fix must hold for arbitrarily
  long single words too (hence `overflow-wrap: anywhere`, not `break-word`, matching the codebase's
  existing convention).
- **Files** (3):
    - `frontend/src/components/matrix/matrix.css`
    - `frontend/src/styles/looking-glass.css`
    - a new or existing frontend test file asserting the stylesheet rules directly (plain-CSS
      content assertions, same pattern as `colorTokens.test.ts`/spec 008 — jsdom cannot measure
      real layout/wrap metrics, so assert the presence of `minmax(0, 1fr)`, `overflow-wrap`, and
      `min-width: 0`/`flex-wrap: wrap` on the exact selectors above)
- **Tipping Point**: If a third instance of this bug is found in a future feature, stop auditing
  ad hoc and write a lint rule / stylelint plugin flagging row-direction flex/grid children with
  unbounded text and no `min-width: 0`/`minmax(0, ...)`.

[FORCES]
1. Audited, per-instance fixes > blanket global overflow-wrap
2. Simplicity > Pattern purity
