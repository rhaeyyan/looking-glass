[SPEC]
- **Objective**: Update `README.md`'s "Role coverage" section and MVP-scope step 3, plus
  `AGENTS.md`'s "V1 ships six high-coverage technical roles" line, so the docs state the true
  shipped behavior: all 15 `role_family` values are selectable; coverage density (Strong/
  Moderate/Weak — 15-22, 8-9, or 3-6 of 30 skills carrying a real arbitrage score) still varies
  by role and is still a useful reference for why gaps in some roles skew toward "demand only,
  scarcity unknown," but it is no longer a shipping gate.
- **Inputs/Outputs**: Prose only — no code, no schema, no test fixtures.
  - `README.md`: rename/reframe the "Role coverage (why V1 is scoped to technical roles)" heading
    (e.g., "Role coverage (why arbitrage-score density varies by role)"); keep the existing
    Strong/Moderate/Weak table and its skill-count figures (these are unchanged, verified facts),
    but drop the "(V1)" / "(later)" / "(V2+)" ship-gating parentheticals since all three tiers now
    ship simultaneously; replace "**V1 ships the six 'Strong' technical roles**" with a sentence
    stating all 15 roles ship, and that a skill with no arbitrage score still surfaces as a gap
    flagged "demand only, scarcity unknown" rather than being dropped (this sentence is already
    true and stays). Update MVP-scope step 3's "select one of the six V1 technical roles" to
    "select any of the 15 `role_family` values."
  - `AGENTS.md` (verify first whether `CLAUDE.md` is a symlink to it or a separate copy — if
    symlinked, one edit suffices; if a distinct file, mirror the edit in both): replace "**V1
    ships six high-coverage technical roles**: Backend, Full Stack, Data Scientist/ML, Data
    Engineer, Software Engineer, DevOps/Cloud/SRE." with a line stating V1 ships all 15
    `role_family` values from D3's per-role profiles, with a pointer to README's coverage table
    for the Strong/Moderate/Weak density breakdown.
- **Design Pattern**: none — simple case (documentation correction).
- **Bounded-AI boundary**: N/A — no code path affected.
- **Intellectual Control**: Docs must never assert an invariant the code doesn't enforce (the
  Session Continuity rule in `AGENTS.md` itself: "treat `SESSION_STATE.md`/docs as a hint; the
  repo is the source of truth" — this task closes that gap rather than leaving a live drift).
- **Constraints**: Do not alter the still-accurate data invariants above this section (141-skill
  core, 58-skill three-way overlap, 450-row/15-role ingest figures) — those remain correct and
  untouched. Do not remove the Strong/Moderate/Weak skill-count table; it remains genuinely useful
  context for interpreting why some roles show more "demand only" gaps than others.
- **Edge Cases**: N/A (prose).
- **Files**:
  - `README.md`
  - `AGENTS.md` (and `CLAUDE.md` only if confirmed to be a distinct file, not a symlink)
- **Tipping Point**: N/A.

[FORCES]
1. Docs matching shipped reality > leaving a stale "V1 scope" narrative for historical flavor
2. Simplicity > Pattern purity
