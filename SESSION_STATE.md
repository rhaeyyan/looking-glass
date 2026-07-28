# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-28 (round 22: seniority-in-picker, specs 028/029)

- Continued `feature/v2-scope-expansion`. Pulled 94 commits from `main` first (fast-forward,
  `774ebdb`→`1ccd0da`) — brought in the Playwright oracle harness, INVARIANT/OBSERVABLE/UNKNOWN
  lane rework, and specs 007–024, none of which existed when this branch was opened.
- Picked **seniority in the target-role picker** over the LinkedIn/arshkon candidate: its dataset
  work was already done (`data/dataset-evaluations.md`'s Datamata AI Requirements Index
  evaluation — one validated cut, the seniority gradient, PARKED as CONTEXT-ONLY narration
  framing), where LinkedIn/arshkon has no evaluation yet and a known structural risk (its
  "skills" are job-function codes, not skills).
- Cedar split the feature into **specs 028 (data layer) + 029 (UI)** to stay under the 5-file cap,
  same pattern as 026/027.
- **Spec 028**: `getSeniorityFraming(role, seniority)` — static `SENIORITY_GRADIENT` +
  `ROLE_TO_DATAMATA_CATEGORY` lookup, three fixed sentence templates. Cypress wrote 7-edge-case
  failing tests first. The raw Datamata CSV wasn't in this checkout — Redwood shipped with 10 of
  18 cells honestly flagged `PLACEHOLDER` rather than fabricated, per the SPEC's own "an absent
  figure blocks completion, it does not get estimated" constraint. User then added the raw file
  (landed at `data/raw/archive/ai-requirements-index.csv`, not the path the doc originally cited —
  flagged, not reconciled). Redwood re-extracted all 18 real values and found the `data` category
  breaks strict `entry ≤ mid ≤ senior` ordering (7.4 > 7.2). Investigated directly against the raw
  CSV rather than guessed at: `data`'s entry pool (~375 listings) is ~10x smaller than mid's
  (~4,100), giving a ~1.3pp standard error — the two values trade places day-to-day across the
  surrounding week while `senior` stays robustly above both. Documented as a named, evidenced
  exception (code comment + `dataset-evaluations.md` + a dedicated test block) rather than a
  loosened global tolerance; the other 5 categories keep strict zero-tolerance monotonicity.
  Cypress audit: **PASS** on first pass, including an independent re-diff of all 18 cells against
  the raw CSV and cross-consistency check across all three places the exception is documented.
- **Spec 029**: seniority `<select>` in Step 1 + `SeniorityFraming` note component, deliberately
  given no scoring-related props and placed outside the resume-gated pipeline so the Bounded-AI
  boundary is structural. First Cypress audit: **FAIL** — Magnolia had added an unauthorized
  `handleRoleChange` guard in `App.tsx` to work around a flaky e2e assertion, violating the SPEC's
  own "no interaction with `handleRoleChange`" constraint (CLAUDE.md Rule 8: halt and request a
  SPEC update, don't shadow-patch). Cypress proved the guard unnecessary — root cause was a
  redundant no-op reselect line in its own test; deleting that one test line fixed the CORE ORACLE
  assertion with zero `App.tsx` changes. Retry (rejection-loop cycle 1/2): Magnolia reverted the
  guard, Cypress deleted the test line, both continued via `SendMessage` (not fresh spawns) to
  keep context. Re-audit: **PASS**.
- Playwright wasn't installed in this checkout at all (no `node_modules`, no browser binaries) —
  installed both before the oracle could run for the first time this session.
- Verified-With (final state): `frontend/src/lib/seniorityFraming.test.ts` (34/34),
  `frontend/src/components/matrix/SeniorityFraming.test.tsx` (9/9),
  `frontend/e2e/seniority-framing.spec.ts @ mobile-touch-dark @ desktop-dark` (16/16). Full vitest
  707/707, eslint clean, tsc clean, full e2e oracle 62 passed / 6 skipped (expected pointer-mode
  mismatches) / 0 failed.
- Committed as 3 commits (`16eb4ba` SPEC drafts, `e5a3b72` data layer, `7c7630d` UI layer) and
  pushed to `origin/feature/v2-scope-expansion`.
- Archived rounds 18–21 out of this file into `ARCHIVED_SESSIONS.md` (this file had grown past the
  150-line threshold).
- User then added the arshkon LinkedIn Job Postings dataset to `data/raw/archive.zip`, which
  **also relocated** the Datamata raw file from `data/raw/archive/ai-requirements-index.csv` to
  `data/raw/ai-requirements/ai-requirements-index.csv` (the old `archive/` path got overwritten by
  the new zip's contents) — every path citation to the old location in already-committed spec
  028 code comments (`seniorityFraming.ts`/`.test.ts`, 9 occurrences) and
  `data/dataset-evaluations.md` (4 occurrences) is now stale. Not yet fixed — flagged for next
  session or on request.
- Evaluated the LinkedIn/arshkon set directly against real files (`postings.csv`,
  `jobs/job_skills.csv`, `mappings/skills.csv`, real row counts and distributions, not assumed
  from the listing's reputation). **Verdict: REJECTED** for the role-expansion framing README's
  V2 list originally proposed, on two independent grounds: (1) the pre-built `skill_abr` join is
  wrong-grain, same failure as the AI Requirements Index — `mappings/skills.csv` is a 36-value
  job-function taxonomy (Engineering, Sales, Marketing…), not a skill vocabulary, confirmed by
  reading all 36 rows directly; (2) even ignoring the join, the postings themselves are a general
  cross-industry crawl (top titles: Sales Manager, Customer Service Rep, Project Manager) skewed
  away from the app's 15 tech-only `role_family` values. **PARKED narrowly**, not closed: a
  description-text extraction (same deterministic technique as spec 006's `resumeSkills.ts`,
  applied to `postings.csv`'s free-text `description` field instead of the broken `skill_abr`
  join) tested real and non-uniform on a 6,193-row sample (Excel 14.0%, SQL 4.5%, Python
  3.9%, … Docker 0.8% — a genuine power-law spread, not the flat synthetic signature this doc
  already learned to detect). Blocked from being a live candidate today by two things, not one:
  the crawl is stale (Dec 2023–Apr 2024, ~2 years behind this project's 2026-dated sources) and
  building the extractor is real uncosted work, not a static-table drop-in like specs 025/028.
  Full writeup: `data/dataset-evaluations.md`'s new "LinkedIn Job Postings (2023-2024) — arshkon
  set" section.
- **Next**:
  1. All four original V2 candidates are now resolved one way or another: 025/026/027 shipped,
     028/029 shipped, LinkedIn/arshkon evaluated and rejected/parked (see above). README's
     "Planned V2 scope expansion" section still lists LinkedIn role expansion as an open,
     undecided candidate — now stale, not yet updated to reflect the verdict above.
  2. If the LinkedIn set's narrow parked path (description-text extraction) is ever wanted for
     real, it needs a fresher pull first (2026-dated) — re-run the title-power-law and
     description-hit-rate checks on any reopen rather than assuming they still hold.
  3. Fix the stale `data/raw/archive/ai-requirements-index.csv` path citations noted above (13
     occurrences across 3 files) now that the real location is `data/raw/ai-requirements/`.
  4. Two minor non-blocking items Cypress flagged during the 028 audit, still open: a stale
     header comment in `seniorityFraming.test.ts` claiming only 2 of 6 categories have real
     figures (all 6 do now).
  5. Branch still not merged to `main` / no PR opened (not requested this session).

---

## History

See [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for all prior sessions.
