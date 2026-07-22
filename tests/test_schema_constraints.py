"""Failing tests (RED phase) for the Supabase migration SQL — Task 5 of
specs/001-ingest-pipeline.md.

`supabase/migrations/0001_init_skills_schema.sql` does not exist yet (that's Task 6, Redwood).
Reading it here is expected to raise `FileNotFoundError` until Task 6 lands — that is the
correct RED-phase failure mode per this task's [SPEC].

This suite never connects to a live Supabase instance (Security / Zero-Trust,
AGENTS.md's security-isolation gate): it only reads the migration file as plain text and applies
regex/structural assertions. No `SUPABASE_URL`/service-role key is required or read anywhere in
this file.

Expected schema contract (this file is the source of truth for column-level constraints;
`src/ingest/join_core.py::SkillCoreRow` and `src/ingest/role_profile.py::RoleProfileRow` are the
source of truth for field *names and Python types* — the two must agree):

    CREATE TABLE skills_core (
        skill_key                   ...  PRIMARY KEY   -- normalize_skill(skill_name)
        skill_name                  ...  NOT NULL
        skill_group                 ...  NULL          -- from D2, may be absent
        d1_primary_category         ...  NOT NULL
        d2_primary_category         ...  NOT NULL
        d1_demand_count             ...  NOT NULL
        d1_demand_pct               ...  NOT NULL
        median_days_open            ...  NULL          -- D1 empty-string cells
        salary_premium_pct          ...  NULL          -- D1 empty-string cells
        repost_rate_pct             ...  NOT NULL
        scarcity_score              ...  NOT NULL
        d2_listing_count            ...  NOT NULL
        d2_total_listings           ...  NOT NULL
        d2_demand_pct               ...  NOT NULL
        d2_required_count           ...  NOT NULL
        d3_corroborated             ...  NOT NULL      -- always an explicit bool from corroborate()
        d3_postings_with_skill      ...  NULL          -- only set when d3_corroborated
        d3_pct_of_all_postings      ...  NULL          -- only set when d3_corroborated
    );

    CREATE TABLE skill_role_profile (
        role_family                 ...  NOT NULL      -- } composite PRIMARY KEY
        skill_name_raw              ...  NOT NULL      -- }
        skill_key                   ...  NULL          -- unenforced soft-reference, NO FK
        postings_with_skill         ...  NOT NULL
        pct_of_role                 ...  NOT NULL
        role_postings                ... NOT NULL
        PRIMARY KEY (role_family, skill_name_raw)
    );

Formatting assumption: one column definition per line (matches this repo's Python dataclass
style — one field per line). This is a documented constraint on Redwood's migration, not an
accident of the test implementation — Task 6 should write the SQL this way.
"""

import re
from pathlib import Path

import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "0001_init_skills_schema.sql"
)

SKILLS_CORE_TABLE = "skills_core"
SKILL_ROLE_PROFILE_TABLE = "skill_role_profile"

# Column classification, derived directly from SkillCoreRow / RoleProfileRow's field types.
SKILLS_CORE_PRIMARY_KEY = ["skill_key"]
SKILLS_CORE_NOT_NULL = [
    "skill_name",
    "d1_primary_category",
    "d2_primary_category",
    "d1_demand_count",
    "d1_demand_pct",
    "repost_rate_pct",
    "scarcity_score",
    "d2_listing_count",
    "d2_total_listings",
    "d2_demand_pct",
    "d2_required_count",
    "d3_corroborated",
]
SKILLS_CORE_NULLABLE = [
    "skill_group",
    "median_days_open",
    "salary_premium_pct",
    "d3_postings_with_skill",
    "d3_pct_of_all_postings",
]

SKILL_ROLE_PROFILE_PRIMARY_KEY = ["role_family", "skill_name_raw"]
SKILL_ROLE_PROFILE_NOT_NULL = ["postings_with_skill", "pct_of_role", "role_postings"]
SKILL_ROLE_PROFILE_NULLABLE = ["skill_key"]


# --- Fixtures -----------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migration_sql() -> str:
    """Read the migration file as plain text. No DB connection, no credentials."""
    return MIGRATION_PATH.read_text(encoding="utf-8")


# --- Helpers --------------------------------------------------------------------------------------


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


def _column_line(block: str, column: str) -> str:
    """Return the definition line for `column` within a CREATE TABLE body.

    Assumes one-column-per-line formatting (see module docstring). Fails with a clear message
    naming the missing column if not found — this is the completeness check for column presence.
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


def _assert_nullable(line: str, column: str) -> None:
    assert not re.search(r"not\s+null", line, re.IGNORECASE), (
        f"expected `{column}` to be nullable (no NOT NULL) per the SPEC's edge cases: {line!r}"
    )
    assert not re.search(r"primary\s+key", line, re.IGNORECASE), (
        f"expected `{column}` to be nullable, but it is marked PRIMARY KEY: {line!r}"
    )


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


# --- Structural / "syntactically well-formed" checks ---------------------------------------------


def test_migration_file_exists_and_is_nonempty():
    assert MIGRATION_PATH.is_file(), f"expected a migration file at {MIGRATION_PATH}"
    assert MIGRATION_PATH.read_text(encoding="utf-8").strip(), "migration file must not be empty"


def test_migration_declares_exactly_two_create_table_statements(migration_sql):
    statements = re.findall(r"create\s+table", migration_sql, re.IGNORECASE)
    assert len(statements) == 2, (
        f"expected exactly 2 CREATE TABLE statements ({SKILLS_CORE_TABLE!r}, "
        f"{SKILL_ROLE_PROFILE_TABLE!r}), found {len(statements)}"
    )


def test_migration_parentheses_are_balanced(migration_sql):
    assert migration_sql.count("(") == migration_sql.count(")"), (
        "unbalanced parentheses in migration SQL — not syntactically well-formed"
    )


def test_migration_declares_skills_core_table(migration_sql):
    # Raises AssertionError via _extract_table_block if the table is missing.
    _extract_table_block(migration_sql, SKILLS_CORE_TABLE)


def test_migration_declares_skill_role_profile_table(migration_sql):
    _extract_table_block(migration_sql, SKILL_ROLE_PROFILE_TABLE)


# --- skills_core: column presence + nullability ---------------------------------------------------


@pytest.mark.parametrize("column", SKILLS_CORE_NOT_NULL)
def test_skills_core_required_column_is_not_null(migration_sql, column):
    block = _extract_table_block(migration_sql, SKILLS_CORE_TABLE)
    line = _column_line(block, column)
    _assert_not_null(line, column)


@pytest.mark.parametrize("column", SKILLS_CORE_NULLABLE)
def test_skills_core_optional_column_is_nullable(migration_sql, column):
    block = _extract_table_block(migration_sql, SKILLS_CORE_TABLE)
    line = _column_line(block, column)
    _assert_nullable(line, column)


def test_skills_core_primary_key_is_skill_key(migration_sql):
    block = _extract_table_block(migration_sql, SKILLS_CORE_TABLE)
    _assert_primary_key(block, SKILLS_CORE_PRIMARY_KEY)


def test_skills_core_declares_all_expected_columns(migration_sql):
    block = _extract_table_block(migration_sql, SKILLS_CORE_TABLE)
    all_columns = SKILLS_CORE_PRIMARY_KEY + SKILLS_CORE_NOT_NULL + SKILLS_CORE_NULLABLE
    for column in all_columns:
        _column_line(block, column)  # raises AssertionError naming the missing column


# --- skill_role_profile: column presence + nullability + composite PK ---------------------------


@pytest.mark.parametrize("column", SKILL_ROLE_PROFILE_NOT_NULL)
def test_skill_role_profile_required_column_is_not_null(migration_sql, column):
    block = _extract_table_block(migration_sql, SKILL_ROLE_PROFILE_TABLE)
    line = _column_line(block, column)
    _assert_not_null(line, column)


@pytest.mark.parametrize("column", SKILL_ROLE_PROFILE_NULLABLE)
def test_skill_role_profile_soft_reference_column_is_nullable(migration_sql, column):
    block = _extract_table_block(migration_sql, SKILL_ROLE_PROFILE_TABLE)
    line = _column_line(block, column)
    _assert_nullable(line, column)


def test_skill_role_profile_composite_primary_key(migration_sql):
    block = _extract_table_block(migration_sql, SKILL_ROLE_PROFILE_TABLE)
    _assert_primary_key(block, SKILL_ROLE_PROFILE_PRIMARY_KEY)


def test_skill_role_profile_declares_all_expected_columns(migration_sql):
    block = _extract_table_block(migration_sql, SKILL_ROLE_PROFILE_TABLE)
    all_columns = (
        SKILL_ROLE_PROFILE_PRIMARY_KEY + SKILL_ROLE_PROFILE_NOT_NULL + SKILL_ROLE_PROFILE_NULLABLE
    )
    for column in all_columns:
        _column_line(block, column)


def test_skill_role_profile_skill_key_has_no_foreign_key_constraint(migration_sql):
    """skill_key is an unenforced logical reference (Task 6 SPEC): many role-profile skills are
    generic/soft terms with no match in skills_core, so no FK constraint is permitted."""
    block = _extract_table_block(migration_sql, SKILL_ROLE_PROFILE_TABLE)
    assert not re.search(r"references", block, re.IGNORECASE), (
        "skill_key must be a soft/unenforced reference — no FOREIGN KEY/REFERENCES constraint "
        f"targeting {SKILLS_CORE_TABLE} is allowed in this table's body:\n{block}"
    )
