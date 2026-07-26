# Looking Glass — Development Report

*From initial commit to post-mortem. 154 commits, 2026-07-21 → 2026-07-26.*

---

## At a glance

| | |
|---|---|
| **Duration** | 6 calendar days (2026-07-21 → 2026-07-26) |
| **Commits** | 154 |
| **Specs written & approved** | 24 (`specs/001`–`024`) |
| **Working rounds** | 19 |
| **Commits that touched code** | 68 of 154 (44%) |
| **Commits that touched only the ledger** | 45 of 154 (29%) |
| **Final test state** | 622 vitest · 202 pytest (+16 cleanly skipped) · 10 Playwright e2e · ruff/eslint/tsc clean |
| **LLM calls in the shipped runtime path** | 0 |

The product: pick a target role, paste a resume, get your skill gaps ranked by a deterministic
**leverage score** (demand × scarcity) computed across three public Kaggle datasets, with the
single highest-leverage move narrated in plain language. Live at
[looking-glass-zeta.vercel.app](https://looking-glass-zeta.vercel.app/).

---

## Phase 0 — Constitution before code (Jul 21, 4 commits)

The first four commits contain no application code at all. `becb492` is a README defining the
product and a five-step walking-skeleton MVP scope; `7cb1ddd` immediately reverses the primary
flow (target-role selection first, not resume-first); `5681665` and `5257c79` install the
multi-agent orchestration pipeline — `AGENTS.md` plus a seven-agent roster in `.claude/agents/`
(Pine, Cedar, Cypress, Redwood, Magnolia, Birch, Banyan).

That ordering is the single most consequential decision in the project. Everything downstream —
the spec files, the handoff schemas, the rejection-loop cap, and eventually the post-mortem that
rewrote all of it — follows from having written the process down as a versioned artifact before
writing a line of Python.

---

## Phase 1 — Walking skeleton (Jul 22, specs 001–003)

Three specs, executed strictly RED-then-GREEN. The commit log reads as alternating pairs:
`test: RED phase for X` → `feat: implement X`.

- **001 — Ingest.** Parse → normalize → join three CSVs → Supabase schema (`skills_core`,
  `skill_role_profile`) with an idempotent loader. The join was *validated, not assumed*, and
  validation immediately found drift: the documented core was 139 skills, the CSVs said 141;
  D2's distinct count was 147, actually 148. Both figures were corrected in the docs and locked
  in as enforced assertions in `tests/test_data_invariants.py` (`155c2ed`).
- **002 — The score.** `compute_arbitrage_score` as a pure function, then a real table + view +
  loader. A live Supabase smoke test confirmed exact row counts (141/450/141) and RLS against a
  real database. Notably, RLS had only ever been enabled *by hand* — never migrated — until
  Task 2 caught it.
- **003 — Role picker + matrix.** First frontend work: React/Vite/TS, direct-to-Supabase reads
  via the anon key (no backend API tier), an accessible quadrant scatter, an arbitrage ladder,
  and a `<table>` fallback. Built to WCAG 2.2 AA from the first commit — non-color shape
  encoding, keyboard-operable points, zero axe violations, reduced-motion respected — with no
  charting dependency.

Two harness bugs surfaced here that mattered later: a missing global Testing Library `cleanup`
(`ed7718c`) was silently corrupting accessible names across accumulated renders, and live browser
verification found a CSS grid with three column tracks for four children. Both were found by
*looking at the running app*, not by the test suite.

---

## Phase 2 — The AI layer that was built, then deleted (Jul 22–23, specs 004–006)

This is the most interesting arc in the project.

**Spec 004** built exactly what the architecture called for: LLM-based resume-skill extraction
behind a Supabase Edge Function, schema-validated with Zod, provider-swappable. Mid-spec the
provider was switched from Claude to OpenRouter (`2687b5f` → `d0b8670`), the spec amended to
match. Six tasks, all green.

Then live verification failed — persistently. The debugging was disciplined: a secret typo and
an OpenRouter privacy-toggle gotcha were both real, both fixed, and *neither was the blocker*.
Isolated scratch-script testing eventually root-caused a genuine upstream free-tier `429`
(`23dd2a0`).

**Spec 005** then made an observation that quietly changed the product: by the time narration
runs, *every fact the rationale needs has already been computed*. Demand, scarcity, salary
premium, days-open, the exact rank ordering — all deterministic. So the "narrate the result" LLM
call was replaced with `narrateTopGap()`, a pure template function with a fixed five-step
tie-precedence chain. Zero latency, zero cost, zero chance of a hallucinated number. All six
tasks passed first try, zero rejection-loop cycles.

**Spec 006** completed the reversal. Rather than mitigate the rate limit, the LLM extraction was
deleted outright and rewritten as vocabulary-scoped regex matching — lookaround word boundaries,
regex-escaped vocabulary, a clause-bounded negation window, longest-first overlap resolution
(which fixed a real `C`/`C#` false-merge trap Cypress caught). The edge function was deleted and
`zod` removed. `9bfe429`: **"app now makes zero LLM calls anywhere."**

Two residual limitations were *documented rather than claimed solved*: `r` still false-matches
inside `"R&D"`, and a negation cue outside the scan window still slips through. Both are pinned
by frozen tests. That honesty is the reason the README can make the traceability claim it makes.

The deletion left a real hole the pipeline missed: `tests/test_extract_resume_skills_function.py`
characterized the now-deleted edge function's source and had been silently erroring on every run
(`c5b7f2f`). A housekeeping sweep caught it.

---

## Phase 3 — Live verification milestone (Jul 23)

The full five-step flow ran end-to-end against the real database for the first time, verified via
user-supplied screenshots. It found a gap no test could have: **migration 0004 had only ever been
structurally test-verified, never applied to the live Supabase database**, surfacing as
`column role_skill_arbitrage.salary_premium_pct does not exist`.

The extractor also demonstrated its design holding on a real resume — correctly affirming `ai`
and `llm` while correctly leaving `llms` as a gap, exactly as exact-match-only implies.

`screenshot/` (singular — it contained a real resume with real PII) was added to `.gitignore`
alongside the existing `screenshots/`. Exactly what the project's Zero-Trust posture exists for.

---

## Phase 4 — Design and hardening (Jul 24, specs 007–017, rounds 1–8)

The busiest day of the project: 59 commits.

- **Round 1** imported a design-tool prototype into the real app, ported a token-based design
  system with a light/dark toggle, and ran a **de-jargon pass** — "Arbitrage Score" → "Leverage
  Score" *on screen only*, with DB columns, SQL views, and code identifiers deliberately
  unchanged. The scatter was rebuilt: the per-index shape channel was removed (it encoded no real
  variable) and axes min-max-normalized so points actually spread. Two components — the standalone
  data table and the arbitrage ladder — were merged into one `SkillLeverageTable`.
- **Specs 008–010** (a UI/UX + dataviz pass) are notable for what *didn't* happen: the user
  explicitly authorized relaxing the standing `Simplicity > Pattern purity` force, and Cedar
  investigated and **declined to use the permission** — one chart, one table, one donut is not
  repeated variance. All three specs shipped with `Design Pattern: none`.
- **Specs 011–012** widened the app from 6 roles to all 15. The backend had supported all 15 the
  entire time; the limit lived in exactly one frontend const.
- **A learning-resource feature was investigated and dropped** on evidence. The real 141-skill
  vocabulary was pulled live from Supabase and joined against a Coursera dataset: 33/141 exact,
  56/141 with a generic qualifier-strip rule, **83/141 (58.9%) as the realistic ceiling** even
  with a hand-curated alias table. 41% of the core was genuinely absent under any spelling,
  concentrated in modern GenAI and cloud-native tooling. The problem was structural, not a matter
  of picking a different file. Feature dropped, no code written, nothing to revert.
- **Specs 013–017** covered salary-premium plain-language phrasing, five measured WCAG contrast
  failures (`--color-accent` at 3.71:1 → 5.78:1, and four others), responsive text wrapping, and
  glassmorphism chrome.
- **Round 6** fixed a dark-mode regression from a user screenshot where `--glass-alpha: 1` had
  been assumed inert but meant fully *opaque*. Both the implementation and its own tests had
  faithfully encoded the same wrong assumption — a clean illustration that a green suite proves
  consistency, not correctness.
- **Round 7** fixed the Vercel deploy: `pyproject.toml` at the repo root was being auto-detected
  as a Python entrypoint; the fix required `vercel.json` *inside* `frontend/` to match the
  dashboard's Root Directory. Then a blank production page was diagnosed by pulling the built JS
  bundle and grepping it — no `VITE_SUPABASE_*` values baked in, because Vite inlines
  `import.meta.env.*` at build time, not runtime.

---

## Phase 5 — The mobile leverage table, and the black box (Jul 25, rounds 11–18)

Full glassmorphism redesign (specs 018–022) landed cleanly. Then the project hit its defining
failure.

A user screenshot from a real phone showed a **black rectangle** on one row of the leverage
table. Over the next several rounds the table was patched again and again:

| Round | Fix |
|---|---|
| 12.7 | `table-layout: fixed` + widen the Status column (sticky columns overlapping at rest) |
| 12.8 / 13 | two-layer composite background (sticky Status ghosting while scrolling) |
| 13 | explicit `<colgroup>` (metric columns crowding) |
| 14 | unpin Status below 480px, shrink skill column, clip the label text |
| 15 | widen that breakpoint 480px → 640px (the real device was wider than assumed) |
| 16 | shrink the Status column width to fit its icon, not its now-hidden text |
| 17 | header overflow + skill-name crowding — **and a latent specificity bug**: a shared `.leverage-table th, td { white-space: nowrap }` had *always* silently outranked `.lev-skill`'s own `white-space: normal`, invisible until the mobile breakpoint narrowed the column enough to need wrapping |
| 18 | **the actual root cause** |

`matrix.css` was touched in 28 separate commits. Nine sequential single-symptom `fix(ui)` commits
landed on one component. **622 unit tests were green throughout.**

**Round 18 solved it.** While testing in dark mode, the black box was personally reproduced for
the first time. `document.elementFromPoint()` plus a full ancestor-chain style dump at the exact
pixel coordinates showed the `<tr>` carrying `background: rgb(13, 13, 13)` — an exact match for
`var(--page-plane)`, the value set by `.leverage-table tbody tr:hover`. Confirmed by explicitly
hovering the *original* reported row and getting the identical colour.

Root cause: **touch devices fire a synthetic `:hover` on tap that never clears**, because no real
pointer-leave event ever arrives. It stuck on whichever row the user's thumb last touched — which
explains every previously baffling detail: a different arbitrary row each time; only in the
non-sticky columns (the sticky cells paint their own opaque background on top, masking it); and
visually dramatic only in dark mode, where `--page-plane` is near-black.

The fix is one line — wrap the hover rule in `@media (hover: hover)`.

**Why it took four rounds:** every prior investigation ran in a headless context reporting
`(hover: hover)`, while the user's phone reported `(hover: none)`. The bug was *structurally
impossible to trigger* in the environment used to hunt it. Three "could not reproduce" results
were not evidence of anything.

---

## Phase 6 — Post-mortem and orchestration overhaul (Jul 25–26, round 19)

The team ran a post-mortem on its own process. Two root findings:

**1. Ceremony was priced by file type, not by failure mode.** The original lanes
(SIMPLE / UI-UX / SPIKE / COMPLEX) were silent on whether a failure could be *observed* at all.
An unreproduced bug report kept getting filed as "UI/UX → cosmetic" and sent straight to a
builder — four times.

**2. The verification environment was never part of any contract.** No spec named where a failure
would be visible, so the harness could not reproduce what the user's thumb could.

**Eleven fixes shipped:**

- **The oracle harness** (`614e03f`): Playwright with four named device/theme profiles —
  `mobile-touch-dark`, `mobile-touch-light`, `desktop-dark`, `desktop-light` — hermetically
  stubbed so no live credentials ever enter an agent-run harness. Round 18's fix was pinned as a
  regression spec. **The oracle was then proven to catch the bug**: removing the
  `@media (hover: hover)` guard fails 4 touch tests, including the light-mode variant that had
  been invisible to the eye for three rounds.
- **`Verification Oracle` became a required `[SPEC]` field.** If no oracle can be named, it isn't
  a spec — it's a spike whose deliverable *is* the oracle.
- **Pine re-cut** to INVARIANT (silent failure → full pipeline) / OBSERVABLE (visible on sight,
  oracle nameable now → straight to a builder) / UNKNOWN (no oracle yet, including *any*
  unreproduced bug report → spike).
- **The roster was cut to four by default.** Across the whole project Banyan was invoked zero
  times and Birch twice, yet every task paid the relay cost of a seven-agent pipeline.
- **The Stop hook was inverted** (`526fc8a`). It had blocked until `SESSION_STATE.md` was
  touched, which made narration mandatory and verification optional — 45 of 154 commits (29%)
  touched only the ledger and changed no code, while a visible UI bug survived four rounds. It
  now gates on the oracle.

**CI landed** (`94744b4`), and immediately surfaced two latent problems: the data-invariant skip
guard checked only that `data/raw/` *existed*, which a leftover CSV from the dropped Coursera
feature kept alive — so 16 tests half-ran and failed; and a bare `ruff check .` was 147 errors
deep in vendored `.claude/skills/` code, which would have failed every audit. Result: 202 passed
/ 16 cleanly skipped. CI honestly reports that it **cannot** verify the data invariants (they
need gitignored Kaggle extracts) and prints skip reasons, so a green check never overclaims.

**One last mystery closed.** The recurring `skills_core already exists` (42P07) error the user had
hit since round 9 was finally explained: the schema had been applied by pasting DDL into the
Dashboard SQL Editor, which records nothing in `supabase_migrations.schema_migrations`, so the
CLI read an empty ledger and replayed from migration one. The fix is
`supabase migration repair --status applied` — not re-running DDL. Round 9 had correctly
diagnosed each individual error but never answered *why the user kept re-running these files*.
Round 19 did.

---

## What the numbers say

- **29% of commits changed no code.** The ledger was enforced by a hook; the oracle was not.
- **44% of commits touched code.** The rest were specs, README reconciliations, and ledger prose.
- **`docs:` is the single largest commit type** — 71 of 154, more than `feat:` (28) and `fix:`
  (21) combined.
- **28 commits touched one CSS file.** One bug accounted for the majority of them.
- **Zero rejection-loop cycles on specs 005 and 006** — the two most technically substantial
  specs both passed every task first try. The process worked exactly as designed on problems
  where the failure mode was silent and the oracle was a unit test. It failed on the one class of
  problem it had no vocabulary for: a failure only observable on a device nobody in the pipeline
  was standing in.

## What got written back into the system

The durable output of the post-mortem isn't the CSS fix — it's that each lesson was converted
into something that can fail:

| Lesson | Where it now lives |
|---|---|
| Environment parity before diagnosis | Named Playwright profiles; a required `[SPEC]` field |
| "Could not reproduce" from a mismatched environment is no evidence | Pine's UNKNOWN lane; spikes deliver oracles, not fixes |
| Every bug fix leaves an assertion behind | Cypress FAILs any fix that doesn't; `e2e/leverage-table.spec.ts` |
| Data invariants must not drift | `tests/test_data_invariants.py`, enforced not prosed |
| Narration is not verification | Stop hook gates the oracle, not the ledger |
| Batch presentation feedback | One audit pass per round, not one spec per symptom |

The clearest single sentence the project produced about itself: **a fix verified once by hand and
described only in prose is not fixed, it is unobserved.**

---

*Built for the Pursuit AI Native Fellowship.*
