"""Failing tests (RED phase) for the frontend read-layer migration SQL — Task 1 of
specs/003-role-picker-matrix.md.

`supabase/migrations/0003_frontend_read_layer.sql` does not exist yet (that's Task 2, Redwood).
Reading it here is expected to raise `FileNotFoundError` until Task 2 lands — that is the correct
RED-phase failure mode per this task's [SPEC] (same pattern as
`tests/test_arbitrage_schema.py`, Task 3/`specs/002-arbitrage-score.md`).

This suite never connects to a live Supabase instance (Security / Zero-Trust,
AGENTS.md's security-isolation gate): it only reads the migration file as plain text and applies
regex/structural assertions. No `SUPABASE_URL`/service-role key is required or read anywhere in
this file.

Why this is worth locking with a test rather than trusting manual SQL review (Task 1's
[SPEC] "Intellectual Control"): RLS is the actual security boundary for a public, PII-free,
anon-key frontend (Decision 2 of specs/003-role-picker-matrix.md — no app-server tier). Two
concrete footguns motivate the exact assertions below:

  1. It is easy to accidentally leave a table wide-open (grant a write policy `TO anon`) or
     forget a `SELECT` policy on one of the three underlying tables the frontend actually reads.
  2. Postgres views run as their *owner* by default — bypassing the querying role's RLS
     entirely — unless `security_invoker = true` is set explicitly (both on the pre-existing
     `arbitrage_scores` view, retrofitted here, and on the new `role_skill_arbitrage` view).

Expected contract (this file is the source of truth for the RLS/view shape;
`supabase/migrations/0001_init_skills_schema.sql` and `0002_arbitrage_scores.sql` are the source
of truth for the table/column names referenced below — the three must agree):

    -- SELECT-only, anon-readable, on all three underlying tables:
    CREATE POLICY ... ON skills_core           FOR SELECT TO anon USING (true);
    CREATE POLICY ... ON skill_role_profile    FOR SELECT TO anon USING (true);
    CREATE POLICY ... ON skill_arbitrage_scores FOR SELECT TO anon USING (true);

    -- No write policy anywhere in the file may be granted TO anon (Secret-key-only writes):
    -- (negative assertion, scanned across every CREATE POLICY statement in the file)

    -- Retrofit the existing view against the owner-bypass footgun:
    ALTER VIEW arbitrage_scores SET (security_invoker = true);

    -- New read-only join view for the matrix, same footgun addressed on creation, and a LEFT
    -- JOIN (not INNER) so a role skill with no D1/D2 arbitrage-score match still surfaces
    -- ("demand only" — the gap-correctness invariant from AGENTS.md/Cypress's brief):
    CREATE VIEW role_skill_arbitrage
        WITH (security_invoker = true)
        AS
            SELECT
                role_family, skill_name_raw, skill_key, pct_of_role, postings_with_skill,
                demand_score, scarcity_index, arbitrage_score, scarcity_data_completeness,
                d3_corroborated, d3_pct_of_all_postings
            FROM skill_role_profile
            LEFT JOIN arbitrage_scores ON arbitrage_scores.skill_key = skill_role_profile.skill_key;

Formatting assumption: `CREATE POLICY` clauses appear in the fixed Postgres grammar order
(`... ON table [AS ...] [FOR command] [TO role] [USING (...)] [WITH CHECK (...)];`) — this is a
Postgres syntax rule, not an accident of the test implementation, so extracting the `FOR` and `TO`
clauses in that order is safe regardless of the implementer's whitespace/line-break choices.
"""

import re
from pathlib import Path

import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "0003_frontend_read_layer.sql"
)

SKILLS_CORE_TABLE = "skills_core"
SKILL_ROLE_PROFILE_TABLE = "skill_role_profile"
ARBITRAGE_SCORES_TABLE = "skill_arbitrage_scores"  # underlying table (not the view below)
ARBITRAGE_SCORES_VIEW = "arbitrage_scores"
ROLE_SKILL_ARBITRAGE_VIEW = "role_skill_arbitrage"

# The three underlying tables the frontend must be able to SELECT from directly (per-table
# regex, not one blanket "RLS exists somewhere" check).
SELECT_ANON_TABLES = [SKILLS_CORE_TABLE, SKILL_ROLE_PROFILE_TABLE, ARBITRAGE_SCORES_TABLE]

# Minimum column set the new join view must select (per Task 1's [SPEC] edge cases).
ROLE_SKILL_ARBITRAGE_COLUMNS = [
    "role_family",
    "skill_name_raw",
    "skill_key",
    "pct_of_role",
    "postings_with_skill",
    "demand_score",
    "scarcity_index",
    "arbitrage_score",
    "scarcity_data_completeness",
    "d3_corroborated",
    "d3_pct_of_all_postings",
]


# --- Fixtures -------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migration_sql() -> str:
    """Read the migration file as plain text. No DB connection, no credentials."""
    return MIGRATION_PATH.read_text(encoding="utf-8")


# --- Helpers ------------------------------------------------------------------------------------


def _policy_statements(sql: str) -> list[tuple[str, str]]:
    """Return `(table_name, statement_body)` for every `CREATE POLICY ... ON <table> ...;`
    statement in the file. `statement_body` is everything between the table name and the closing
    `;` (the `[AS ...] [FOR ...] [TO ...] [USING (...)] [WITH CHECK (...)]` clauses, verbatim)."""
    pattern = re.compile(
        r'create\s+policy\s+"?\w+"?\s+on\s+(?:\w+\.)?"?(\w+)"?\s+(.*?);',
        re.IGNORECASE | re.DOTALL,
    )
    return [(match.group(1), match.group(2)) for match in pattern.finditer(sql)]


def _extract_clause(body: str, start_keyword: str, end_keywords: list[str]) -> str:
    """Return the text between `start_keyword` and the next of `end_keywords` (or end of
    string) within a CREATE POLICY statement body. Relies on Postgres's fixed clause order."""
    end_pattern = "|".join(end_keywords)
    pattern = re.compile(
        rf"\b{start_keyword}\b\s*(.*?)(?:\b(?:{end_pattern})\b|$)",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(body)
    return match.group(1).strip() if match else ""


def _for_clause(body: str) -> str:
    return _extract_clause(body, "for", ["to", "using", "with"])


def _to_clause(body: str) -> str:
    return _extract_clause(body, "to", ["using", "with"])


def _extract_view_with_options(sql: str, view_name: str) -> tuple[str, str]:
    """Return `(with_options_body, select_body)` for a
    `CREATE VIEW <view_name> WITH (...) AS <select>;` statement. Fails loudly if the view is
    missing entirely, or present without a `WITH (...)` options clause (the
    `security_invoker = true` footgun this task exists to guard against)."""
    pattern = re.compile(
        r"create\s+(?:or\s+replace\s+)?view\s+"
        rf'(?:\w+\.)?"?{re.escape(view_name)}"?\s+with\s*\((.*?)\)\s*as\s+(.*?);',
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(sql)
    assert match, (
        f"expected `CREATE VIEW {view_name} WITH (security_invoker = true) AS ...;` in the "
        f"migration SQL (the options clause must be present on creation, not left to a later "
        f"ALTER) — got file contents:\n{sql}"
    )
    return match.group(1), match.group(2)


# --- Structural / "syntactically well-formed" checks ---------------------------------------------


def test_migration_file_exists_and_is_nonempty():
    assert MIGRATION_PATH.is_file(), f"expected a migration file at {MIGRATION_PATH}"
    assert MIGRATION_PATH.read_text(encoding="utf-8").strip(), "migration file must not be empty"


def test_migration_parentheses_are_balanced(migration_sql):
    assert migration_sql.count("(") == migration_sql.count(")"), (
        "unbalanced parentheses in migration SQL — not syntactically well-formed"
    )


# --- Anon SELECT policies: per-table, not a blanket check -----------------------------------------


@pytest.mark.parametrize("table", SELECT_ANON_TABLES)
def test_select_to_anon_policy_present_for_table(migration_sql, table):
    statements = _policy_statements(migration_sql)
    table_statements = [(t, b) for t, b in statements if t.lower() == table.lower()]
    assert table_statements, (
        f"expected at least one `CREATE POLICY ... ON {table} ...;` statement in the migration "
        f"SQL — got file contents:\n{migration_sql}"
    )

    found = False
    for _, body in table_statements:
        for_clause = _for_clause(body)
        to_clause = _to_clause(body)
        using_true = re.search(r"using\s*\(\s*true\s*\)", body, re.IGNORECASE)
        if (
            re.search(r"\bselect\b", for_clause, re.IGNORECASE)
            and re.search(r"\banon\b", to_clause, re.IGNORECASE)
            and using_true
        ):
            found = True
            break

    assert found, (
        f"expected `CREATE POLICY ... ON {table} FOR SELECT TO anon USING (true)` in the "
        f"migration SQL — found policies on {table} but none matching the exact "
        f"SELECT/anon/USING(true) shape:\n{table_statements}"
    )


def test_no_write_policy_granted_to_anon(migration_sql):
    """Negative assertion: scan every CREATE POLICY statement in the file (regardless of table)
    and fail if any INSERT/UPDATE/DELETE/ALL policy is granted TO anon. The write path must stay
    Secret-key-only per Decision 1 of specs/003-role-picker-matrix.md."""
    violations = []
    for table, body in _policy_statements(migration_sql):
        for_clause = _for_clause(body)
        to_clause = _to_clause(body)
        is_write_command = re.search(r"\b(insert|update|delete|all)\b", for_clause, re.IGNORECASE)
        is_granted_to_anon = re.search(r"\banon\b", to_clause, re.IGNORECASE)
        if is_write_command and is_granted_to_anon:
            violations.append((table, for_clause.strip(), to_clause.strip()))

    assert not violations, (
        f"found a write policy (INSERT/UPDATE/DELETE/ALL) granted TO anon — the write path must "
        f"stay Secret-key-only, never reachable via the public anon key: {violations}"
    )


# --- arbitrage_scores view: retrofit security_invoker (the owner-bypass footgun) ------------------


def test_arbitrage_scores_view_sets_security_invoker(migration_sql):
    pattern = re.compile(
        r"alter\s+view\s+"
        rf'(?:\w+\.)?"?{re.escape(ARBITRAGE_SCORES_VIEW)}"?\s+set\s*'
        r"\(\s*security_invoker\s*=\s*true\s*\)\s*;",
        re.IGNORECASE,
    )
    assert pattern.search(migration_sql), (
        f"expected `ALTER VIEW {ARBITRAGE_SCORES_VIEW} SET (security_invoker = true);` in the "
        f"migration SQL — without it, this view still runs as its owner and silently bypasses "
        f"RLS for any anon-key caller:\n{migration_sql}"
    )


# --- role_skill_arbitrage view: declared with security_invoker, LEFT JOIN, expected columns -------


def test_role_skill_arbitrage_view_declared_with_security_invoker(migration_sql):
    options, _ = _extract_view_with_options(migration_sql, ROLE_SKILL_ARBITRAGE_VIEW)
    assert re.search(r"security_invoker\s*=\s*true", options, re.IGNORECASE), (
        f"expected `CREATE VIEW {ROLE_SKILL_ARBITRAGE_VIEW} WITH (security_invoker = true) AS "
        f"...;` — got WITH options: {options!r}"
    )


def test_role_skill_arbitrage_view_left_joins_role_profile_and_arbitrage_scores(migration_sql):
    """Regression guard for the 'unscored role skill still surfaces' invariant: the join must be
    `skill_role_profile LEFT JOIN arbitrage_scores`, never an INNER JOIN (which would silently
    drop any role skill lacking a D1/D2 arbitrage-score match)."""
    _, body = _extract_view_with_options(migration_sql, ROLE_SKILL_ARBITRAGE_VIEW)

    assert re.search(
        rf"\b{re.escape(SKILL_ROLE_PROFILE_TABLE)}\b\s+left\s+join\s+"
        rf'(?:\w+\.)?"?{re.escape(ARBITRAGE_SCORES_VIEW)}"?\b',
        body,
        re.IGNORECASE,
    ), (
        f"expected the `{ROLE_SKILL_ARBITRAGE_VIEW}` view body to contain "
        f"`{SKILL_ROLE_PROFILE_TABLE} LEFT JOIN {ARBITRAGE_SCORES_VIEW}` — got body:\n{body}"
    )

    assert not re.search(r"\binner\s+join\b", body, re.IGNORECASE), (
        f"expected a LEFT JOIN, not an INNER JOIN, in the `{ROLE_SKILL_ARBITRAGE_VIEW}` view — "
        f"an INNER JOIN would silently drop any role skill lacking an arbitrage score instead of "
        f"surfacing it as 'demand only':\n{body}"
    )


@pytest.mark.parametrize("column", ROLE_SKILL_ARBITRAGE_COLUMNS)
def test_role_skill_arbitrage_view_selects_column(migration_sql, column):
    _, body = _extract_view_with_options(migration_sql, ROLE_SKILL_ARBITRAGE_VIEW)
    assert re.search(rf'"?{re.escape(column)}"?', body, re.IGNORECASE), (
        f"expected the `{ROLE_SKILL_ARBITRAGE_VIEW}` view to select `{column}`:\n{body}"
    )
