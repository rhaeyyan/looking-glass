# Looking Glass — Agent Operating Manual

Operational rules for AI agents (Claude Code, Gemini CLI) building **Looking Glass**, the
High-Leverage Pivot Engine. Read this before working in the repo. Product spec lives in
[README.md](README.md).

> This roster is adapted from the Pursuit AI Native fellowship's agent team.

## Project Context
Looking Glass ranks a user's skill gaps toward a **target role** by a deterministic
**Arbitrage Score** (demand × scarcity) computed across three Kaggle datasets, then routes them
to the highest-leverage skill first. The primary flow: **pick target role → paste resume →
arbitrage-ranked gap list → the top move is narrated for the user.** As of specs 005/006, both
the narration and the resume-skill extraction steps are fully deterministic — no LLM call
anywhere in the current runtime path (see the AI layer entry below).

**Data invariants (verified against source CSVs — do not drift without re-validating):**
- **D1 + D2 = 141-skill core** (skill-scarcity-index + skill-demand-index; same publisher, perfect join). Carries demand, `scarcity_score`, salary premium, days-open, skill_group. D2's own distinct-skill count is 148 (7 skills D1 lacks: `duckdb`, `qlik`, `r`, `ray`, `streamlit`, `supabase`, `talend`). Re-validated against the raw CSVs on 2026-07-22 — corrected from the earlier 139/147; both figures are now locked in as passing, enforced assertions in `tests/test_data_invariants.py`.
- **Three-way overlap with D3 = 58 skills** — D3 (`most-in-demand-job-skills-2026`) is a *corroboration badge* ("confirmed across 360k postings"), never a hard-join requirement.
- **Per-role profiles** come from D3's `skills-2026-by-role.csv` (15 roles × top 30 skills).
- **V1 ships all 15 `role_family` values** from D3's per-role profiles; see README's "Role
  coverage" table for the Strong/Moderate/Weak arbitrage-score density breakdown by role.

## Stack
- **Data / DB**: Supabase (Postgres). Deterministic scoring in SQL / Python 3.12.
- **Frontend**: React + TypeScript (Vite SPA); ESLint + Prettier.
- **AI layer**: none currently in the runtime path. Resume skill-extraction (spec 006) is
  deterministic vocabulary-scoped regex matching; result narration (spec 005) is a deterministic
  template engine. The bounded-single-call mechanism — OpenAI-compatible endpoint, native
  function-calling, structured output schema-validated (Zod/Pydantic), single server-side-proxied
  bounded LLM call, swappable model/provider — remains documented here as the pattern-in-reserve
  should a future feature need an LLM call again; no assumption elsewhere in the codebase depends
  on any specific provider.
- **Test**: `pytest` (Python), `vitest` + `@testing-library/react` + `axe-core` (TS), and the
  **oracle harness** — Playwright (`frontend/playwright.config.ts`, `frontend/e2e/`) with named
  device/theme profiles. See "Verification oracles" below; it is a contract surface, not just a
  test runner.
- **Lint**: `ruff` (Python), `eslint` + `eslint-plugin-jsx-a11y` (TS).
- **Deploy**: Vercel (frontend), Supabase hosted (DB).

## The Pipeline (ceremony is priced by failure mode, not by file type)

This is an **L1 solo MVP**. Ceremony scales with **how expensive it is to be wrong**, which is not
the same as how big the diff is. Pine classifies every task into one of three lanes (see
`.claude/agents/pine.md`):

```
INVARIANT   Pine → Cedar ([SPEC]) → Cypress (red in the oracle) → Redwood / Magnolia → Cypress (audit)
OBSERVABLE  Pine → Magnolia / Redwood, with an oracle profile named   (no SPEC file)
UNKNOWN     Pine → Cedar ([SPIKE]) — the SPIKE's deliverable is the ORACLE, not a fix
```

- **INVARIANT** — being wrong is *silent* (scoring, gaps, joins, ingest, normalization, schema,
  secrets/RLS). Full pipeline. Cheap insurance against silent corruption.
- **OBSERVABLE** — being wrong is *visible on sight* (styling, layout, copy, one component's
  presentation) **and** the oracle can be named now. Straight to a builder. No SPEC file, and no
  demand for a unit test that cannot fail.
- **UNKNOWN** — no oracle can be named yet. Exploratory work, or **any bug report not yet
  reproduced**. Cedar writes a `[SPIKE]` whose output is a reproduction, after which the task is
  re-routed. A fix proposed before the failure has been observed is a guess.

**Why this replaced the old work-type lanes (SIMPLE/UI-UX/SPIKE/COMPLEX):** that axis was silent on
whether a failure could be observed at all. It filed an unreproduced bug as "UI/UX → cosmetic" and
sent it to a builder four times — four rounds and nine commits on one CSS bug, with 622 unit tests
green throughout. Ceremony was being priced by which directory the change landed in.

Invoke **Birch** (context), **Banyan** (review/refactor), and **Pine** itself **on-demand**, not by
default: the default roster is Cedar, Cypress, Redwood, Magnolia. Across this project's entire
recorded history Banyan was invoked zero times and Birch twice, while every task still paid the
relay cost of a seven-agent pipeline. Reach for Birch when codebase context is non-trivial (Cedar
requests a `[CONTEXT-PACKET]`), Banyan when a coupling/bloat smell or refactor is flagged or to
mediate a stalled rejection loop, and Pine when the lane is genuinely unclear — the orchestrator can
classify an obvious task itself in one line.

### Verification oracles

An **oracle** is the specific environment in which a failure is observable. It is named by string in
every `[SPEC]`, and the named profiles live in `frontend/playwright.config.ts`:

| Profile | Reports | Use for |
|---|---|---|
| `mobile-touch-dark` | `(hover: none)`, `isMobile` | touch-only behaviour, dark surfaces |
| `mobile-touch-light` | `(hover: none)`, `isMobile` | touch-only behaviour, light surfaces |
| `desktop-dark` / `desktop-light` | `(hover: hover)` | pointer affordances, wide layouts |

Run with `npm run e2e` (or `npm run e2e:mobile`) in `frontend/`. The harness is hermetic: the
Supabase read is stubbed same-origin with dummy credentials, so no live project URL or key is ever
in an agent-run harness, and results never drift with the data.

**Environment parity before diagnosis — the rule this project paid four rounds to learn.** A bug is
reproduced in an environment matching the report, or it is *not reproduced*. "Could not reproduce"
from a mismatched environment is **no evidence at all**: three attempts at the stuck-`:hover` bug
ran in contexts reporting `(hover: hover)` while the user's phone reported `(hover: none)`, making
the bug structurally impossible to trigger there. Before diagnosing, state the reported
environment's touch/pointer mode, theme, and viewport, and pick or add the profile that matches.
Adding a profile is legitimate, valuable work — the profiles are the vocabulary the whole team
routes on.

**Every bug fix leaves an assertion behind.** A fix verified once by hand and then described only in
prose is not fixed, it is unobserved — round 18's `@media (hover: hover)` fix existed nowhere but a
ledger paragraph until it was pinned in `e2e/leverage-table.spec.ts`. Cypress FAILs any bug-fix task
that leaves no assertion.

**Beware animated properties.** `matrix.css` transitions row backgrounds over 160ms, so a bare
read straight after an interaction samples an interpolation — neither a colour nor transparency
proves anything. Poll for an expected appearance; wait past the transition before asserting an
absence. Helpers: `e2e/support/app.ts`.

**Batch presentation feedback.** One audit pass per round across the relevant profiles — not one
spec per reported symptom. Rounds 12.7–18 produced nine sequential single-symptom `fix(ui)` commits
on one component, each paying a full round-trip through the human.

### The orchestrator (the main session)

Subagents cannot invoke other subagents — every arrow in the pipeline above is the main session
relaying a handoff block between two agents that otherwise share no context. The main session
therefore owns, and no subagent does:

- **Persisting the SPEC, then relaying its *path*.** Write every approved `[SPEC]`/`[SPIKE]` to
  `specs/NNN-slug.md` **first**, then dispatch by citing that path — every builder and Cypress has
  `Read`. Do **not** paste the spec body into two or three prompts: the largest specs here run
  300–400 lines, and pasting billed that text three-plus times for no information gain. Relay the
  short blocks (`[COMPLIANCE-REPORT]`, `[COMPLETION-REPORT]`, `[ROUTING-DECISION]`) inline and
  verbatim — they are small, and their wording is the contract. Persisting first is also what makes
  the contract survive context compaction and gives the HITL approval a durable artifact.
- **Counting the rejection loop.** Subagents are stateless between spawns; the main session is
  the only place that can track "this is retry 2 of 2" before escalating to Banyan (Workflow
  Rule 9).
- **Retry via continuation, not respawn.** When Cypress fails Redwood or Magnolia, continue that
  same agent (rather than a fresh cold start) so it keeps its own implementation context.
- **Worktree isolation.** Rule 10's "parallel work in Git Worktrees" maps to spawning the builder
  agent with worktree isolation for that task; Banyan still coordinates the merge to `main`.

## Team Roster (`.claude/agents/`)
Every workflow has one definitive owner (no bystander effect). Tool restrictions are enforced by
each agent's `tools:` frontmatter.

**Default roster** (in the path for most tasks):

| Agent | Role / Title | May edit files? | Job |
|---|---|---|---|
| `cedar` | Tech Lead | No (read-only) | Turn goals into `[SPEC]`/`[SPIKE]` + `[FORCES]` (≤5 files); sole dependency/schema authority |
| `cypress` | SDET | Tests only | Produce the red in the declared oracle; audit for correctness, Bounded-AI, security, WCAG 2.2 AA |
| `redwood` | Software Engineer | Yes | Build the deterministic data/scoring layer + app code |
| `magnolia`| UI/UX Engineer | Yes | Build the accessible demand×scarcity matrix + styling |

**On-demand** (invoke only on their trigger — see the Pipeline section for why):

| Agent | Role / Title | May edit files? | Trigger |
|---|---|---|---|
| `pine` | API Gateway / Intake | No (read-only) | The lane (INVARIANT/OBSERVABLE/UNKNOWN) is genuinely unclear |
| `birch` | Systems Analyst | No (read-only) | Codebase context is non-trivial; Cedar requests a `[CONTEXT-PACKET]` |
| `banyan` | Platform Engineer / Reviewer | Yes (refactors only) | Coupling/bloat smell, tree-wide refactor, or a stalled rejection loop |

## Workflow Rules
1. **Plan before building.** Non-trivial features start with a Cedar `[SPEC]`. Cedar rejects ambiguous goals and recommends `/grill-me`. The human approves the plan before code is written (HITL checkpoint).
2. **Intake & routing by failure mode.** Classify on *how we'd know this is wrong*, never on which directory it touches: INVARIANT (silent failure) → Cedar `[SPEC]`; OBSERVABLE (visible on sight, oracle nameable now) → straight to Magnolia/Redwood; UNKNOWN (no oracle yet — including **any unreproduced bug report**) → Cedar `[SPIKE]` to produce the oracle; AMBIGUOUS → back to the human via `/grill-me`. Pine routes only, never executes, and is invoked only when the lane is unclear.
3. **Red in the oracle before green.** Every `[SPEC]` declares a `Verification Oracle`; Cypress produces the failure *there* — a `pytest`/`vitest` test, a Playwright profile, or a documented live observation — and confirms it fails for the right reason before a builder starts. The medium varies; the discipline does not. Prefer behavioral/black-box assertions over implementation details. If Cypress cannot reproduce, it FAILs back to the spec (naming the missing profile) rather than hunting a fix against an unreproduced symptom. For `[SPIKE]`s, characterization tests come after the skeleton.
4. **Task granularity.** No task modifies more than 5 files (Banyan exempt for atomic tree-wide refactors). Cedar splits anything bigger and limits SPEC references to 3 items. High-risk ops (schema migrations, mass replacements) run a dry-run rehearsal first.
5. **Walking skeleton first.** Thinnest end-to-end slice, then grow. No big-bang builds. See the README's 5-step MVP scope.
6. **Context diet.** Read only what the task needs. Birch retrieves via ripgrep + AST/LSP and reads matched sections only.
7. **Patterns are earned.** Apply a GoF pattern only when variance analysis shows real variation to encapsulate; otherwise state "no pattern needed." Default force: `Simplicity > Pattern purity`.
8. **Dependency & schema authority.** Only Cedar authorizes new NPM/PIP deps or Supabase migrations. Redwood/Magnolia halt and request a `[SPEC]` update — no shadow IT.
9. **Rejection loop (circuit breaker).** Cypress FAIL → developer retries. **Max 2 cycles**, then escalate to Banyan; only then to the human. Every autonomous loop carries a finite cap.
10. **Git protocol.** Conventional Commits (`feat:`, `fix:`, `docs:`…). Parallel work in Git Worktrees; Banyan coordinates merges to `main`. Never commit secrets/PII — verify `.gitignore` covers `.env*`. Record verification in the commit with a `Verified-With:` trailer naming the oracle that was run. **Never commit the ledger on its own** — fold it into the code commit it describes (see Session Continuity). **Never add a `Co-Authored-By` line or any other AI/LLM/agent attribution to a commit message, in this repo, ever** — this overrides the harness's own default trailer behavior, applies to every commit regardless of how it was requested (not just via the `/wrap-up` skill, where this rule previously lived alone), and is mechanically enforced by a `PreToolUse` hook (`.claude/hooks/block-ai-coauthor.sh`) that blocks any `git commit` call containing one.

## Quality Standards
### Bounded AI (the core discipline)
- **Compute deterministically, summarize generatively.** Never let an LLM calculate the arbitrage score, a gap, a join, or any ranking. Build deterministic SQL/Python first, then pass results to the LLM as context.
- If an LLM call is ever (re)introduced, its only jobs remain: **extract skills from a resume**
  and **narrate a computed result** — nothing else. Enforce strict schema validation
  (Zod/Pydantic) on any structured LLM output. Currently, neither job uses an LLM at all: both
  are deterministic (specs 005, 006) — this section states the standing constraint that would
  govern a future LLM call, not a description of the current runtime path.

### Security (Zero-Trust)
- No secrets/API keys/PII (including resume content) in LLM context, code, or commits. Env vars only; `.gitignore` covers `.env*`.
- Treat all LLM output as untrusted: sanitize/validate before rendering or executing.
- Vet new deps (`npm audit` / `pip-audit`).
- **Security-isolation gate (assessed at kickoff):** V1 runs first-party code against public Kaggle CSVs — **no untrusted third-party code, no live production credentials in-agent, no real user PII** (resumes are pasted client-side and never persisted in V1). → **Chosen mechanism: none.** Re-assess and spec an ephemeral-sandbox + JIT-credential layer if V2 adds user accounts, resume persistence, or live PII.

### Accessibility (WCAG 2.2 AA)
- Target WCAG 2.2 AA + WAI-ARIA APG. Prefer native semantic HTML over ARIA-decorated divs.
- **Data-viz specifics (the matrix):** never color-only encoding (add shape/label/pattern); keyboard-navigable; expose the numbers as an accessible table alternative; respect `prefers-reduced-motion`; meet AA contrast.
- Verify mechanically: `axe-core` in tests, `eslint-plugin-jsx-a11y` in lint. Magnolia invokes the `dataviz` skill before building any chart.

## Handoff Schemas
Every inter-agent handoff uses one of these blocks, verbatim.

### [SPEC] / [SPIKE] — Cedar → Cypress → Redwood / Magnolia
```markdown
[SPEC] / [SPIKE]
- **Objective**: <what the code must achieve>
- **Inputs/Outputs**: <types, schemas, JSON shapes>
- **Design Pattern**: <GoF pattern + justification, or "none — simple case">
- **Bounded-AI boundary**: <what is computed deterministically vs. LLM-generated>
- **Verification Oracle**: <REQUIRED. Where the failure is observable, named precisely:
  a test path (`tests/test_x.py`, `src/lib/x.test.ts`), an e2e profile
  (`e2e/leverage-table.spec.ts @ mobile-touch-dark`), or a live URL. If no oracle can be
  named, this is not a [SPEC] — it is a [SPIKE] whose deliverable is the oracle.>
- **UI Scope** (UI tasks only): structural | cosmetic
- **Intellectual Control**: <why this approach; why it won't break at scale>
- **Constraints**: <performance, forbidden libraries, style>
- **Edge Cases**: <error handling, null states, unscored role skills>
- **Files**: <max 5 files this task may touch>
- **Tipping Point**: <complexity/scale threshold where this must be refactored>
```

### [FORCES] — attached to every SPEC
```markdown
[FORCES]
1. <Primary force> > <Secondary force>
2. Simplicity > Pattern purity   (always present unless explicitly overridden)
```

### [ROUTING-DECISION] — Pine
### [CONTEXT-PACKET] — Birch
(Each defines its exact block in its own `.claude/agents/*.md` file.)

### [COMPLIANCE-REPORT] — Cypress → Cedar / Redwood
```markdown
[COMPLIANCE-REPORT]
- **Status**: PASS | FAIL
- **Oracle run**: <the SPEC's declared oracle, the exact command, and its verdict>
- **Environment parity**: <did the oracle match the environment the issue was reported in? name gaps>
- **Critical violations**: <must fix before merge; empty if PASS>
- **Recommendations**: <non-blocking improvements>
- **Test results**: <every suite run + summary of output>
```

### [COMPLETION-REPORT] — Redwood / Magnolia → Cypress
```markdown
[COMPLETION-REPORT]
- **Files changed**: <list>
- **Spec items satisfied**: <checklist against the SPEC>
- **Oracle status**: <the declared oracle, the command run, and its verdict — green, or why not>
- **Complexity justification**: <prove Jevon's Paradox was avoided; defend any lines added against bloat>
- **Known gaps**: <anything deferred, or "none">
- **Tipping Point progress**: <how close the implementation is to the defined Tipping Point>
```

### [HEALING-REPORT] — Banyan
(Defined in `.claude/agents/banyan.md`.)

## Session Continuity

The ledger is a **hint, not a deliverable.** It was previously enforced by a Stop hook that blocked
until `SESSION_STATE.md` had been touched, which made narration mandatory and verification optional:
45 of this project's 142 commits (32%) touched only the ledger files and changed no code, while a
visible UI bug survived four rounds. The Stop hook now checks the **oracle** instead
(`.claude/hooks/stop-oracle-check.sh`), and the ledger runs on convention:

- **Start of session:** read `SESSION_STATE.md` if present.
- **Append-only, newest first, ~10 lines per session.** Three things: what shipped, what is
  blocked, the next step. Never re-summarize or restructure old entries — rewriting a growing file
  costs a read-modify-write of the whole thing every time, which is how `ARCHIVED_SESSIONS.md`
  reached 45 KB. Old entries just sink; prune only when the human asks.
- **Never its own commit.** Fold the ledger edit into the code commit it describes. A standalone
  `docs(session-state):` commit records that work happened without advancing it.
- **Durable facts belong in durable places.** A root cause worth remembering becomes an assertion in
  the oracle; an invariant becomes a test; a decision becomes a line in a `[SPEC]`. The ledger is
  for *in-flight* state only — anything still true next month is in the wrong file.
- **Record verification in the commit, not in prose.** Add a `Verified-With:` trailer naming the
  oracle that was run, e.g. `Verified-With: e2e/leverage-table.spec.ts @ mobile-touch-dark`.
- Treat `SESSION_STATE.md` as episodic memory; the repo (`src/`, `tests/`, `.claude/agents/`, the
  data) is the source of truth. Surface any conflict to the human rather than trusting a stale
  ledger. Where a doc and a test disagree, **the test wins.**
