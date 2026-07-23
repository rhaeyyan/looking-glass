# Looking Glass — Agent Operating Manual

Operational rules for AI agents (Claude Code, Gemini CLI) building **Looking Glass**, the
High-Leverage Pivot Engine. Read this before working in the repo. Product spec lives in
[README.md](README.md).

> This roster is adapted from the Pursuit AI Native fellowship's agent team.

## Project Context
Looking Glass ranks a user's skill gaps toward a **target role** by a deterministic
**Arbitrage Score** (demand × scarcity) computed across three Kaggle datasets, then routes them
to the highest-leverage skill first. The primary flow: **pick target role → paste resume →
arbitrage-ranked gap list → LLM narrates the top move.**

**Data invariants (verified against source CSVs — do not drift without re-validating):**
- **D1 + D2 = 141-skill core** (skill-scarcity-index + skill-demand-index; same publisher, perfect join). Carries demand, `scarcity_score`, salary premium, days-open, skill_group. D2's own distinct-skill count is 148 (7 skills D1 lacks: `duckdb`, `qlik`, `r`, `ray`, `streamlit`, `supabase`, `talend`). Re-validated against the raw CSVs on 2026-07-22 — corrected from the earlier 139/147; both figures are now locked in as passing, enforced assertions in `tests/test_data_invariants.py`.
- **Three-way overlap with D3 = 58 skills** — D3 (`most-in-demand-job-skills-2026`) is a *corroboration badge* ("confirmed across 360k postings"), never a hard-join requirement.
- **Per-role profiles** come from D3's `skills-2026-by-role.csv` (15 roles × top 30 skills).
- **V1 ships six high-coverage technical roles**: Backend, Full Stack, Data Scientist/ML, Data Engineer, Software Engineer, DevOps/Cloud/SRE.

## Stack
- **Data / DB**: Supabase (Postgres). Deterministic scoring in SQL / Python 3.12.
- **Frontend**: React + TypeScript (Vite SPA); ESLint + Prettier.
- **AI layer**: OpenRouter (`google/gemma-4-31b-it:free`, OpenAI-compatible endpoint, native
  function-calling) for resume skill-extraction and result narration **only** (bounded,
  non-numeric); structured output schema-validated (Zod/Pydantic). Model/provider is swappable —
  no assumption elsewhere in the codebase depends on this being Claude specifically, only that it
  is a single, server-side-proxied, bounded LLM call.
- **Test**: `pytest` (Python), `vitest` + `@testing-library/react` + `axe-core` (TS).
- **Lint**: `ruff` (Python), `eslint` + `eslint-plugin-jsx-a11y` (TS).
- **Deploy**: Vercel (frontend), Supabase hosted (DB).

## The Pipeline (match ceremony to the task)
This is an **L1 solo MVP** → default to the **minimal path**:

```
Pine (route) → Cedar ([SPEC]/[SPIKE]) → Cypress (failing tests) → Redwood / Magnolia (build)
```

Invoke **Birch** (context) and **Banyan** (review/refactor) **on-demand**: Birch when codebase
context is non-trivial (Cedar requests a `[CONTEXT-PACKET]`), Banyan when a coupling/bloat smell
or refactor is flagged, or to mediate a stalled rejection loop. Use the **SPIKE path** for
exploratory prototyping (Cypress audits *after* the walking skeleton is built).

### The orchestrator (the main session)

Subagents cannot invoke other subagents — every arrow in the pipeline above is the main session
relaying a handoff block between two agents that otherwise share no context. The main session
therefore owns, and no subagent does:

- **Relaying handoffs verbatim** — pasting Cedar's `[SPEC]` into Cypress's and Redwood's prompts
  unchanged, and passing `[COMPLIANCE-REPORT]`/`[COMPLETION-REPORT]` back the other way.
- **Persisting the SPEC.** Write every approved `[SPEC]`/`[SPIKE]` to `specs/NNN-slug.md` before
  dispatching it, so the contract survives context compaction and the HITL approval has a
  durable artifact to point at.
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

| Agent | Role / Title | May edit files? | Job |
|---|---|---|---|
| `pine` | API Gateway / Intake | No (read-only) | Route tasks to Redwood, Magnolia, or Cedar |
| `birch` | Systems Analyst | No (read-only) | Gather exact files/docs/data-invariants a task needs |
| `cedar` | Tech Lead | No (read-only) | Turn goals into `[SPEC]`/`[SPIKE]` + `[FORCES]` (≤5 files); sole dependency/schema authority |
| `cypress` | SDET | Tests only | Write failing tests; audit for correctness, Bounded-AI, security, WCAG 2.2 AA |
| `redwood` | Software Engineer | Yes | Build the deterministic data/scoring layer + app code |
| `magnolia`| UI/UX Engineer | Yes | Build the accessible demand×scarcity matrix + styling |
| `banyan` | Platform Engineer / Reviewer | Yes (refactors only) | Reduce coupling; mediate rejection loops; coordinate merges |

## Workflow Rules
1. **Plan before building.** Non-trivial features start with a Cedar `[SPEC]`. Cedar rejects ambiguous goals and recommends `/grill-me`. The human approves the plan before code is written (HITL checkpoint).
2. **Intake & routing.** Pine routes only — never executes. Simple → Redwood; UI/matrix → Magnolia; exploratory → Cedar `[SPIKE]`; complex/data → Cedar `[SPEC]`; ambiguous → back to the human via `/grill-me`.
3. **TDD, black-box.** Cypress writes failing behavioral/integration tests from the `[SPEC]` before Redwood implements. Tests define Done. For `[SPIKE]`s, Cypress writes characterization tests after the skeleton.
4. **Task granularity.** No task modifies more than 5 files (Banyan exempt for atomic tree-wide refactors). Cedar splits anything bigger and limits SPEC references to 3 items. High-risk ops (schema migrations, mass replacements) run a dry-run rehearsal first.
5. **Walking skeleton first.** Thinnest end-to-end slice, then grow. No big-bang builds. See the README's 5-step MVP scope.
6. **Context diet.** Read only what the task needs. Birch retrieves via ripgrep + AST/LSP and reads matched sections only.
7. **Patterns are earned.** Apply a GoF pattern only when variance analysis shows real variation to encapsulate; otherwise state "no pattern needed." Default force: `Simplicity > Pattern purity`.
8. **Dependency & schema authority.** Only Cedar authorizes new NPM/PIP deps or Supabase migrations. Redwood/Magnolia halt and request a `[SPEC]` update — no shadow IT.
9. **Rejection loop (circuit breaker).** Cypress FAIL → developer retries. **Max 2 cycles**, then escalate to Banyan; only then to the human. Every autonomous loop carries a finite cap.
10. **Git protocol.** Conventional Commits (`feat:`, `fix:`, `docs:`…). Parallel work in Git Worktrees; Banyan coordinates merges to `main`. Never commit secrets/PII — verify `.gitignore` covers `.env*`.

## Quality Standards
### Bounded AI (the core discipline)
- **Compute deterministically, summarize generatively.** Never let the LLM calculate the arbitrage score, a gap, a join, or any ranking. Build deterministic SQL/Python first, then pass results to the LLM as context.
- The LLM's only jobs: **extract skills from a resume** and **narrate a computed result**. Enforce strict schema validation (Zod/Pydantic) on any structured LLM output.

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
- **Critical violations**: <must fix before merge; empty if PASS>
- **Recommendations**: <non-blocking improvements>
- **Test results**: <command run + summary of output>
```

### [COMPLETION-REPORT] — Redwood / Magnolia → Cypress
```markdown
[COMPLETION-REPORT]
- **Files changed**: <list>
- **Spec items satisfied**: <checklist against the SPEC>
- **Complexity justification**: <prove Jevon's Paradox was avoided; defend any lines added against bloat>
- **Known gaps**: <anything deferred, or "none">
- **Tipping Point progress**: <how close the implementation is to the defined Tipping Point>
```

### [HEALING-REPORT] — Banyan
(Defined in `.claude/agents/banyan.md`.)

## Session Continuity
- Start of session: read `SESSION_STATE.md` (Sprint Ledger) if present.
- End of session: record (1) what was accomplished, (2) what is unfinished/blocked, (3) explicit next steps.
- Treat `SESSION_STATE.md` as episodic memory (a hint); the repo (`src/`, `.claude/agents/`, the data) is the source of truth. Surface any conflict to the human rather than trusting a stale ledger.
