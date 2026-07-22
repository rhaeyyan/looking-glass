"""Failing tests (RED phase) for the arbitrage-score migration SQL — Task 3 of
specs/002-arbitrage-score.md.

`supabase/migrations/0002_arbitrage_scores.sql` does not exist yet (that's Task 4, Redwood).
Reading it here is expected to raise `FileNotFoundError` until Task 4 lands — that is the
correct RED-phase failure mode per this task's [SPEC].

This suite never connects to a live Supabase instance (Security / Zero-Trust,
AGENTS.md's security-isolation gate): it only reads the migration file as plain text and applies
regex/structural assertions. No `SUPABASE_URL`/service-role key is required or read anywhere in
this file. The `arbitrage_scores` VIEW does zero computation of its own (a pure join/projection
of already-computed columns from `skills_core` + `skill_arbitrage_scores`), so a text/structural
assertion is sufficient to validate it — no live-Postgres execution needed to trust its
correctness (see Task 3's [SPEC] "Intellectual Control").

Expected schema contract (this file is the source of truth for column-level constraints;
`src/scoring/arbitrage.py::ArbitrageScoreRow` is the source of truth for field *names and Python
types* — the two must agree):

    CREATE TABLE skill_arbitrage_scores (
        skill_key                   ...  PRIMARY KEY, FOREIGN KEY REFERENCES skills_core(skill_key)
        demand_score                ...  NOT NULL
        scarcity_index              ...  NOT NULL
        scarcity_data_completeness  ...  NOT NULL
        arbitrage_score             ...  NOT NULL
    );

    CREATE VIEW arbitrage_scores AS
        SELECT ... skills_core's passthrough columns (d1_demand_pct, d2_demand_pct,
        scarcity_score, salary_premium_pct, median_days_open, d3_corroborated,
        d3_pct_of_all_postings) plus skill_arbitrage_scores's computed columns (demand_score,
        scarcity_index, scarcity_data_completeness, arbitrage_score) ...
        FROM skills_core JOIN skill_arbitrage_scores ...;

Unlike `skill_role_profile`'s soft reference to `skills_core`, `skill_key` on
`skill_arbitrage_scores` gets a *real* FOREIGN KEY — every `skills_core` row gets exactly one
arbitrage-score row (total coverage), so no dangling reference is possible and enforcement is
safe.

Formatting assumption: one column definition per line (matches this repo's Python dataclass
style, and Task 6/001's precedent). This is a documented constraint on Redwood's migration, not
an accident of the test implementation.
"""

import re
from pathlib import Path

import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "0002_arbitrage_scores.sql"
)

SKILLS_CORE_TABLE = "skills_core"
ARBITRAGE_SCORES_TABLE = "skill_arbitrage_scores"
ARBITRAGE_SCORES_VIEW = "arbitrage_scores"

ARBITRAGE_TABLE_PRIMARY_KEY = ["skill_key"]
ARBITRAGE_TABLE_NOT_NULL = [
    "demand_score",
    "scarcity_index",
    "scarcity_data_completeness",
    "arbitrage_score",
]

# Passthrough columns the view must select from skills_core (already computed there; zero
# recomputation in the view itself).
VIEW_SKILLS_CORE_PASSTHROUGH_COLUMNS = [
    "d1_demand_pct",
    "d2_demand_pct",
    "scarcity_score",
    "salary_premium_pct",
    "median_days_open",
    "d3_corroborated",
    "d3_pct_of_all_postings",
]

# Computed columns the view must select from skill_arbitrage_scores.
VIEW_ARBITRAGE_COMPUTED_COLUMNS = [
    "demand_score",
    "scarcity_index",
    "scarcity_data_completeness",
    "arbitrage_score",
]


# --- Fixtures -------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migration_sql() -> str:
    """Read the migration file as plain text. No DB connection, no credentials."""
    return MIGRATION_PATH.read_text(encoding="utf-8")


# --- Helpers ------------------------------------------------------------------------------------


def _extract_table_block(sql: str, table_name: str) -> str:
    """Return the parenthesized body of `CREATE TABLE [schema.]table_name ( ... );`."""
    pattern = re.compile(
        r"create\s+table\s+(?:if\s+not\s+exists\s+)?"
        rf'(?:\w+\.)?"?{re.escape(table_name)}"?\s*\((.*?)\)\s*;',
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(sql)
    assert match, (
        f"expected a `CREATE TABLE {table_name} (...);` statement in the migration SQL, "
        f"got file contents:\n{sql}"
    )
    return match.group(1)


def _extract_view_block(sql: str, view_name: str) -> str:
    """Return the body of `CREATE VIEW [schema.]view_name AS ... ;` (the SELECT statement)."""
    pattern = re.compile(
        r"create\s+(?:or\s+replace\s+)?view\s+"
        rf'(?:\w+\.)?"?{re.escape(view_name)}"?\s+as\s+(.*?);',
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(sql)
    assert match, (
        f"expected a `CREATE VIEW {view_name} AS ...;` statement in the migration SQL, "
        f"got file contents:\n{sql}"
    )
    return match.group(1)


def _column_line(block: str, column: str) -> str:
    """Return the definition line for `column` within a CREATE TABLE body.

    Assumes one-column-per-line formatting (see module docstring). Fails with a clear message
    naming the missing column if not found.
    """
    pattern = re.compile(rf'^\s*"?{re.escape(column)}"?\s+\S.*$', re.IGNORECASE | re.MULTILINE)
    match = pattern.search(block)
    assert match, (
        f"expected a `{column}` column definition line in this CREATE TABLE body:\n{block}"
    )
    return match.group(0)


def _assert_not_null(line: str, column: str) -> None:
    assert re.search(r"not\s+null", line, re.IGNORECASE) or re.search(
        r"primary\s+key", line, re.IGNORECASE
    ), f"expected `{column}` to be NOT NULL (or PRIMARY KEY, which implies NOT NULL): {line!r}"


def _assert_primary_key(block: str, columns: list[str]) -> None:
    """Assert a PRIMARY KEY over exactly `columns` — inline (single column only) or table-level."""
    col_list_pattern = r"\s*,\s*".join(f'"?{re.escape(c)}"?' for c in columns)
    table_level = re.search(rf"primary\s+key\s*\(\s*{col_list_pattern}\s*\)", block, re.IGNORECASE)
    if table_level:
        return
    if len(columns) == 1:
        inline = re.search(
            rf'^\s*"?{re.escape(columns[0])}"?\s+\S.*primary\s+key',
            block,
            re.IGNORECASE | re.MULTILINE,
        )
        if inline:
            return
    pytest.fail(
        f"expected a PRIMARY KEY over {columns} in this CREATE TABLE body (inline for a single "
        f"column, or a table-level `PRIMARY KEY (...)` constraint for a composite key):\n{block}"
    )


def _assert_foreign_key_to_skills_core(block: str, column: str) -> None:
    """Assert a real FOREIGN KEY on `column` referencing skills_core(skill_key) — either inline
    (`column ... REFERENCES skills_core(skill_key)`) or a table-level
    `FOREIGN KEY (column) REFERENCES skills_core(skill_key)` constraint."""
    inline = re.search(
        rf'^\s*"?{re.escape(column)}"?\s+\S.*references\s+(?:\w+\.)?"?{re.escape(SKILLS_CORE_TABLE)}"?\s*\(\s*"?skill_key"?\s*\)',
        block,
        re.IGNORECASE | re.MULTILINE,
    )
    if inline:
        return
    table_level = re.search(
        rf'foreign\s+key\s*\(\s*"?{re.escape(column)}"?\s*\)\s*references\s+(?:\w+\.)?"?{re.escape(SKILLS_CORE_TABLE)}"?\s*\(\s*"?skill_key"?\s*\)',
        block,
        re.IGNORECASE,
    )
    if table_level:
        return
    pytest.fail(
        f"expected a real FOREIGN KEY on `{column}` REFERENCES {SKILLS_CORE_TABLE}(skill_key) "
        f"(inline or table-level) in this CREATE TABLE body — see Task 3's [SPEC]: every "
        f"skills_core row gets exactly one arbitrage-score row (total coverage), so an enforced "
        f"FK is safe here (unlike skill_role_profile's soft reference):\n{block}"
    )


# --- Structural / "syntactically well-formed" checks ---------------------------------------------


def test_migration_file_exists_and_is_nonempty():
    assert MIGRATION_PATH.is_file(), f"expected a migration file at {MIGRATION_PATH}"
    assert MIGRATION_PATH.read_text(encoding="utf-8").strip(), "migration file must not be empty"


def test_migration_parentheses_are_balanced(migration_sql):
    assert migration_sql.count("(") == migration_sql.count(")"), (
        "unbalanced parentheses in migration SQL — not syntactically well-formed"
    )


def test_migration_declares_skill_arbitrage_scores_table(migration_sql):
    # Raises AssertionError via _extract_table_block if the table is missing.
    _extract_table_block(migration_sql, ARBITRAGE_SCORES_TABLE)


def test_migration_declares_arbitrage_scores_view(migration_sql):
    # Raises AssertionError via _extract_view_block if the view is missing.
    _extract_view_block(migration_sql, ARBITRAGE_SCORES_VIEW)


# --- skill_arbitrage_scores: column presence + nullability + PK + FK -----------------------------


@pytest.mark.parametrize("column", ARBITRAGE_TABLE_NOT_NULL)
def test_arbitrage_scores_required_column_is_not_null(migration_sql, column):
    block = _extract_table_block(migration_sql, ARBITRAGE_SCORES_TABLE)
    line = _column_line(block, column)
    _assert_not_null(line, column)


def test_arbitrage_scores_primary_key_is_skill_key(migration_sql):
    block = _extract_table_block(migration_sql, ARBITRAGE_SCORES_TABLE)
    _assert_primary_key(block, ARBITRAGE_TABLE_PRIMARY_KEY)


def test_arbitrage_scores_skill_key_has_foreign_key_to_skills_core(migration_sql):
    """Unlike skill_role_profile's soft reference, skill_key here gets a real, enforced FK —
    every skills_core row gets exactly one arbitrage-score row (total coverage, no dangling
    references possible)."""
    block = _extract_table_block(migration_sql, ARBITRAGE_SCORES_TABLE)
    _assert_foreign_key_to_skills_core(block, "skill_key")


def test_arbitrage_scores_declares_all_expected_columns(migration_sql):
    block = _extract_table_block(migration_sql, ARBITRAGE_SCORES_TABLE)
    all_columns = ARBITRAGE_TABLE_PRIMARY_KEY + ARBITRAGE_TABLE_NOT_NULL
    for column in all_columns:
        _column_line(block, column)  # raises AssertionError naming the missing column


# --- arbitrage_scores view: passthrough + computed column projection -----------------------------


def test_arbitrage_scores_view_selects_skills_core_passthrough_columns(migration_sql):
    view_body = _extract_view_block(migration_sql, ARBITRAGE_SCORES_VIEW)
    for column in VIEW_SKILLS_CORE_PASSTHROUGH_COLUMNS:
        assert re.search(rf'"?{re.escape(column)}"?', view_body, re.IGNORECASE), (
            f"expected the `{ARBITRAGE_SCORES_VIEW}` view to select the passthrough column "
            f"`{column}` from `{SKILLS_CORE_TABLE}`:\n{view_body}"
        )


def test_arbitrage_scores_view_selects_computed_columns(migration_sql):
    view_body = _extract_view_block(migration_sql, ARBITRAGE_SCORES_VIEW)
    for column in VIEW_ARBITRAGE_COMPUTED_COLUMNS:
        assert re.search(rf'"?{re.escape(column)}"?', view_body, re.IGNORECASE), (
            f"expected the `{ARBITRAGE_SCORES_VIEW}` view to select the computed column "
            f"`{column}` from `{ARBITRAGE_SCORES_TABLE}`:\n{view_body}"
        )


def test_arbitrage_scores_view_joins_skills_core_and_arbitrage_scores_table(migration_sql):
    view_body = _extract_view_block(migration_sql, ARBITRAGE_SCORES_VIEW)
    assert re.search(rf"\b{re.escape(SKILLS_CORE_TABLE)}\b", view_body, re.IGNORECASE), (
        f"expected the `{ARBITRAGE_SCORES_VIEW}` view to reference `{SKILLS_CORE_TABLE}` "
        f"(FROM/JOIN):\n{view_body}"
    )
    assert re.search(rf"\b{re.escape(ARBITRAGE_SCORES_TABLE)}\b", view_body, re.IGNORECASE), (
        f"expected the `{ARBITRAGE_SCORES_VIEW}` view to reference "
        f"`{ARBITRAGE_SCORES_TABLE}` (FROM/JOIN):\n{view_body}"
    )
    assert re.search(r"\bjoin\b", view_body, re.IGNORECASE), (
        f"expected the `{ARBITRAGE_SCORES_VIEW}` view to JOIN `{SKILLS_CORE_TABLE}` and "
        f"`{ARBITRAGE_SCORES_TABLE}` — pure projection, zero computation:\n{view_body}"
    )
