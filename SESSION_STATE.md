# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-22 (Ingest + arbitrage_score SPECs built and verified live against Supabase)

### Accomplished
- Reviewed the full repo against the multi-agent orchestration pipeline; ported missing
  `.claude/skills/`, `.claude/hooks/`, and two dangling handoff schemas from the seed repo;
  documented the orchestrator's role (subagents can't invoke each other). Committed `26e8d74`.
- Extracted the three Kaggle datasets, found real drift from documented invariants (D1+D2 core
  is 141 not 139, D2's own count is 148 not 147; three-way 58 and six V1 roles both checked out).
- **`specs/001-ingest-pipeline.md`** (7 tasks, all complete): parse → normalize → join/
  corroborate/role-profile → Supabase schema (`skills_core`, `skill_role_profile`) + idempotent
  loader → docs reconciliation (139→141, 147→148). `supabase-py` added as the one authorized
  dependency. Committed through `4d2e323`.
- **`specs/002-arbitrage-score.md`** (5 tasks, all complete): `compute_arbitrage_score`
  (demand_score = `d2_demand_pct` verbatim; scarcity_index = weighted composite of
  `scarcity_score`/`salary_premium_pct`/`median_days_open` with weight-renormalization, never
  zero-substitution, on missing fields) → `skill_arbitrage_scores` table (real FK to
  `skills_core`) + `arbitrage_scores` view + idempotent loader → README reconciliation. Also
  formalized `pytest` as a tracked dev dependency. Committed through `155c2ed`.
- **Both SPECs fully complete**: README's MVP steps 1 and 2 are built, tested (178 passed),
  and doc-reconciled end-to-end, all pushed to `origin/main`.
- **Live Supabase smoke test — passed.** Walked the user through: confirming free tier is
  sufficient, creating `.env`, Supabase's API key rebrand (Publishable Key = new `anon`, not
  needed here; Secret Keys = new `service_role`, used for `SUPABASE_SERVICE_ROLE_KEY`), applying
  both migrations via the SQL Editor, enabling RLS on all three tables (safe no-op for the
  loaders, which use the Secret key and bypass RLS regardless; closes the "public tables wide
  open" gap for when the frontend eventually uses the Publishable key). Hit one real bug:
  `PGRST125 — Invalid path specified in request URL` on the first `python -m src.ingest` run,
  root-caused to a malformed `SUPABASE_URL` value. **Corrected the URL, both loaders then ran
  clean**, and the user independently verified via the SQL Editor: `skills_core` = 141,
  `skill_role_profile` = 450, `skill_arbitrage_scores` = 141 — all exact matches. This is the
  first time either pipeline has run against a real (not mocked) database.
- Invoked **Cedar** for MVP step 3 (role picker + demand×scarcity matrix) — the first-ever
  frontend work in this repo (confirmed greenfield). Cedar resolved two forced decisions:
  (1) direct-to-Supabase client-side fetching via the Publishable/anon key, no backend API tier
  — enforced by new RLS policies, not application code; (2) a new `role_skill_arbitrage` view
  (`skill_role_profile LEFT JOIN arbitrage_scores`) so the role→score join lives in one
  auditable place, reusable by step 4. Both approved, along with the first-ever frontend
  dependency set (React 19, Vite 6, TS 5, vitest/testing-library/jest-axe, eslint+a11y plugins;
  no charting library yet — deferred to Magnolia's task). SPIKE for the frontend
  scaffold/skeleton, standard TDD for the matrix once the data contract is frozen. 7 tasks,
  persisted to `specs/003-role-picker-matrix.md`.
- Dispatched **Task 1** (Cypress): failing tests for the new `0003_frontend_read_layer.sql`
  migration (RLS policies + `role_skill_arbitrage` view) —
  `tests/test_frontend_read_layer_migration.py`, 20 tests, RED confirmed (`FileNotFoundError`).
  Locks in: per-table anon SELECT policies, negative guard against any anon write policy,
  `security_invoker = true` on both the retrofitted `arbitrage_scores` view and the new view,
  and a `LEFT JOIN` (not `INNER`) regression guard.

### Unfinished / Blocked
- Tasks 2–7 of `specs/003-role-picker-matrix.md` not started (migration → frontend scaffold →
  walking skeleton → characterization tests → matrix/ladder tests → Magnolia's build).
- README.md's MVP step 4 (resume gap layer) not specced yet.
- Two pre-existing lint items flagged but out of scope where found: long-line (`E501`) warnings
  in `tests/test_ingest_parse.py`, unsorted imports in `tests/test_skill_core_join.py`.

### Next Steps
- Dispatch Task 2 to Redwood: write `supabase/migrations/0003_frontend_read_layer.sql` against
  Task 1's exact contract, apply it to the live Supabase project, and empirically verify anon-key
  read access.
- Continue the sequential pipeline: Task 3 (Redwood SPIKE, frontend scaffold) → Task 4 (Redwood
  SPIKE, walking skeleton) → Task 5 (Cypress, characterization tests) → Task 6 (Cypress, matrix/
  ladder tests) → Task 7 (Magnolia, the actual accessible matrix + ladder build).
