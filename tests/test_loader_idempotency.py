"""Failing tests (RED phase) for the Supabase loader's upsert idempotency — Task 5 of
specs/001-ingest-pipeline.md.

`src/ingest/load_supabase.py` does not exist yet (that's Task 6, Redwood). Importing it here is
expected to raise `ModuleNotFoundError` until Task 6 lands — that is the correct RED-phase
failure mode per this task's [SPEC].

Zero-Trust constraint (Security, AGENTS.md): this suite never constructs a real `supabase-py`
Client and never reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. It exercises the loader
against `FakeSupabaseClient` below, an in-memory stand-in that faithfully emulates Postgres
`ON CONFLICT (...) DO UPDATE` semantics for
`.table(name).upsert(records, on_conflict=...).execute()` — no network, no credentials, ever
required to make this suite pass.

Expected module contract (this file is the source of truth for these signatures):

    # src/ingest/load_supabase.py
    SKILLS_CORE_TABLE: str = "skills_core"
    SKILL_ROLE_PROFILE_TABLE: str = "skill_role_profile"

    def upsert_skill_core(client, rows: list[SkillCoreRow]) -> None:
        '''Upsert `rows` into `skills_core`, keyed on `skill_key` (PK). Re-running with the same
        rows must not change row count or duplicate rows; re-running with a changed field (e.g.
        scarcity_score) for an existing skill_key must update that row in place. Empty `rows` is
        a no-op (does not call the client). Must not read SUPABASE_* env vars itself — the caller
        supplies an already-constructed `client`.'''

    def upsert_role_profiles(client, rows: list[RoleProfileRow]) -> None:
        '''Upsert `rows` into `skill_role_profile`, keyed on the composite
        (role_family, skill_name_raw). Same idempotency contract as upsert_skill_core.'''

`client` is expected to be duck-typed against `supabase-py`'s `Client`: only
`client.table(name).upsert(records, on_conflict=...).execute()` is used — nothing else of the
real client's surface is required, so `FakeSupabaseClient` below is a legitimate stand-in for
both this test suite and (via dependency injection) any future live smoke test.
"""

import dataclasses

import pytest

from src.ingest.join_core import SkillCoreRow
from src.ingest.role_profile import RoleProfileRow

# --- In-memory stand-in for supabase-py's Client -------------------------------------------------


class _FakeQueryResult:
    def __init__(self, data: list[dict]):
        self.data = data


class _FakeTableQuery:
    """Mimics the chainable `client.table(name).upsert(records, on_conflict=...).execute()`
    surface of supabase-py's PostgREST query builder — nothing more."""

    def __init__(self, client: "FakeSupabaseClient", table_name: str):
        self._client = client
        self._table_name = table_name
        self._pending_upsert: list[dict] | None = None
        self._on_conflict: str | None = None

    def upsert(self, records: list[dict], on_conflict: str | None = None) -> "_FakeTableQuery":
        self._pending_upsert = records
        self._on_conflict = on_conflict
        return self

    def execute(self) -> _FakeQueryResult:
        assert self._pending_upsert is not None, "execute() called without a prior upsert(...)"
        self._client.last_on_conflict[self._table_name] = self._on_conflict
        assert self._on_conflict, (
            f"upsert into {self._table_name!r} must pass on_conflict=<key column(s)> for "
            "idempotent conflict resolution"
        )
        conflict_keys = [k.strip() for k in self._on_conflict.split(",") if k.strip()]

        table = self._client._store.setdefault(self._table_name, {})
        written: list[dict] = []
        for record in self._pending_upsert:
            key = tuple(record[k] for k in conflict_keys)
            table[key] = dict(record)  # insert-or-overwrite-in-place, like ON CONFLICT DO UPDATE
            written.append(dict(record))
        return _FakeQueryResult(written)


class FakeSupabaseClient:
    """In-memory stand-in for supabase-py's `Client` — no network, no credentials.

    Faithfully emulates Postgres `ON CONFLICT (...) DO UPDATE` semantics: a record whose
    conflict-key value already exists in the table overwrites that row in place (no duplicate
    row, no row-count change); a record with a new conflict-key value is appended. This is
    exactly the idempotency contract the loader must rely on.
    """

    def __init__(self):
        self._store: dict[str, dict[tuple, dict]] = {}
        self.last_on_conflict: dict[str, str | None] = {}

    def table(self, name: str) -> _FakeTableQuery:
        return _FakeTableQuery(self, name)

    def rows(self, table_name: str) -> list[dict]:
        """Test helper only (not part of the real supabase-py surface): current rows in a table."""
        return list(self._store.get(table_name, {}).values())


# --- Fixtures -------------------------------------------------------------------------------------


@pytest.fixture
def client() -> FakeSupabaseClient:
    return FakeSupabaseClient()


def _skill_core_row(skill_key: str = "python", **overrides) -> SkillCoreRow:
    defaults = dict(
        skill_key=skill_key,
        skill_name="Python",
        skill_group="Programming Languages",
        d1_primary_category="Backend",
        d2_primary_category="Backend",
        d1_demand_count=500,
        d1_demand_pct=12.5,
        median_days_open=30.0,
        salary_premium_pct=8.2,
        repost_rate_pct=4.1,
        scarcity_score=0.62,
        d2_listing_count=480,
        d2_total_listings=4000,
        d2_demand_pct=12.0,
        d2_required_count=460,
        d3_corroborated=True,
        d3_postings_with_skill=12000,
        d3_pct_of_all_postings=3.3,
    )
    defaults.update(overrides)
    return SkillCoreRow(**defaults)


def _role_profile_row(
    role_family: str = "Backend", skill_name_raw: str = "Python", **overrides
) -> RoleProfileRow:
    defaults = dict(
        role_family=role_family,
        skill_name_raw=skill_name_raw,
        skill_key="python",
        postings_with_skill=9000,
        pct_of_role=45.0,
        role_postings=20000,
    )
    defaults.update(overrides)
    return RoleProfileRow(**defaults)


# --- upsert_skill_core ------------------------------------------------------------------------


def test_upsert_skill_core_writes_rows(client):
    from src.ingest.load_supabase import SKILLS_CORE_TABLE, upsert_skill_core

    rows = [_skill_core_row("python"), _skill_core_row("aws", skill_name="AWS")]
    upsert_skill_core(client, rows)

    stored = client.rows(SKILLS_CORE_TABLE)
    assert len(stored) == 2
    assert {row["skill_key"] for row in stored} == {"python", "aws"}


def test_upsert_skill_core_uses_skill_key_as_conflict_target(client):
    from src.ingest.load_supabase import SKILLS_CORE_TABLE, upsert_skill_core

    upsert_skill_core(client, [_skill_core_row("python")])

    assert client.last_on_conflict[SKILLS_CORE_TABLE] == "skill_key"


def test_upsert_skill_core_is_idempotent_same_rows_no_duplicates(client):
    from src.ingest.load_supabase import SKILLS_CORE_TABLE, upsert_skill_core

    rows = [_skill_core_row("python"), _skill_core_row("aws", skill_name="AWS")]

    upsert_skill_core(client, rows)
    upsert_skill_core(client, rows)  # re-run with identical rows

    assert len(client.rows(SKILLS_CORE_TABLE)) == 2


def test_upsert_skill_core_updates_scarcity_score_in_place(client):
    """Edge case from the SPEC: re-running with an updated scarcity_score for an existing
    skill_key must update that row in place, not insert a duplicate row."""
    from src.ingest.load_supabase import SKILLS_CORE_TABLE, upsert_skill_core

    upsert_skill_core(client, [_skill_core_row("python", scarcity_score=0.62)])
    upsert_skill_core(client, [_skill_core_row("python", scarcity_score=0.91)])

    stored = client.rows(SKILLS_CORE_TABLE)
    assert len(stored) == 1
    assert stored[0]["scarcity_score"] == 0.91


def test_upsert_skill_core_preserves_nullable_fields_as_none(client):
    from src.ingest.load_supabase import SKILLS_CORE_TABLE, upsert_skill_core

    row = _skill_core_row(
        "duckdb",
        skill_group=None,
        median_days_open=None,
        salary_premium_pct=None,
        d3_corroborated=False,
        d3_postings_with_skill=None,
        d3_pct_of_all_postings=None,
    )
    upsert_skill_core(client, [row])

    stored = client.rows(SKILLS_CORE_TABLE)[0]
    assert stored["skill_group"] is None
    assert stored["median_days_open"] is None
    assert stored["salary_premium_pct"] is None
    assert stored["d3_corroborated"] is False
    assert stored["d3_postings_with_skill"] is None
    assert stored["d3_pct_of_all_postings"] is None


def test_upsert_skill_core_empty_rows_is_a_noop(client):
    from src.ingest.load_supabase import SKILLS_CORE_TABLE, upsert_skill_core

    upsert_skill_core(client, [])

    assert client.rows(SKILLS_CORE_TABLE) == []


def test_upsert_skill_core_does_not_require_supabase_env_vars(client, monkeypatch):
    from src.ingest.load_supabase import upsert_skill_core

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    # Must not raise despite no live credentials being present anywhere in the environment.
    upsert_skill_core(client, [_skill_core_row("python")])


# --- upsert_role_profiles ------------------------------------------------------------------------


def test_upsert_role_profiles_writes_rows(client):
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    rows = [
        _role_profile_row("Backend", "Python"),
        _role_profile_row("Backend", "Communication", skill_key=None),
    ]
    upsert_role_profiles(client, rows)

    stored = client.rows(SKILL_ROLE_PROFILE_TABLE)
    assert len(stored) == 2


def test_upsert_role_profiles_uses_composite_conflict_target(client):
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    upsert_role_profiles(client, [_role_profile_row("Backend", "Python")])

    on_conflict = client.last_on_conflict[SKILL_ROLE_PROFILE_TABLE]
    conflict_columns = {c.strip() for c in on_conflict.split(",")}
    assert conflict_columns == {"role_family", "skill_name_raw"}


def test_upsert_role_profiles_is_idempotent_same_rows_no_duplicates(client):
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    rows = [
        _role_profile_row("Backend", "Python"),
        _role_profile_row("Backend", "SQL", skill_key="sql"),
    ]

    upsert_role_profiles(client, rows)
    upsert_role_profiles(client, rows)

    assert len(client.rows(SKILL_ROLE_PROFILE_TABLE)) == 2


def test_upsert_role_profiles_updates_pct_of_role_in_place(client):
    """Same idempotency contract as skills_core, applied to the composite key: an updated
    pct_of_role for the same (role_family, skill_name_raw) pair updates in place."""
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    upsert_role_profiles(client, [_role_profile_row("Backend", "Python", pct_of_role=45.0)])
    upsert_role_profiles(client, [_role_profile_row("Backend", "Python", pct_of_role=52.5)])

    stored = client.rows(SKILL_ROLE_PROFILE_TABLE)
    assert len(stored) == 1
    assert stored[0]["pct_of_role"] == 52.5


def test_upsert_role_profiles_distinguishes_same_skill_across_roles(client):
    """(role_family, skill_name_raw) is composite — the same skill in two different roles must
    be two distinct rows, never collapsed into one."""
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    rows = [
        _role_profile_row("Backend", "Python"),
        _role_profile_row("Data Scientist / ML", "Python"),
    ]
    upsert_role_profiles(client, rows)

    stored = client.rows(SKILL_ROLE_PROFILE_TABLE)
    assert len(stored) == 2
    assert {row["role_family"] for row in stored} == {"Backend", "Data Scientist / ML"}


def test_upsert_role_profiles_preserves_null_skill_key_for_unmatched_soft_skills(client):
    """A role skill with no match in the 141-skill core (e.g. a soft skill) must load with a
    null skill_key, per Task 4/6's "never dropped, never enforced" edge case."""
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    row = _role_profile_row("Backend", "Communication", skill_key=None)
    upsert_role_profiles(client, [row])

    stored = client.rows(SKILL_ROLE_PROFILE_TABLE)[0]
    assert stored["skill_key"] is None


def test_upsert_role_profiles_empty_rows_is_a_noop(client):
    from src.ingest.load_supabase import SKILL_ROLE_PROFILE_TABLE, upsert_role_profiles

    upsert_role_profiles(client, [])

    assert client.rows(SKILL_ROLE_PROFILE_TABLE) == []


def test_upsert_role_profiles_does_not_require_supabase_env_vars(client, monkeypatch):
    from src.ingest.load_supabase import upsert_role_profiles

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    upsert_role_profiles(client, [_role_profile_row("Backend", "Python")])


# --- Dataclass-field / column-name agreement guard -----------------------------------------------


def test_skill_core_row_fields_match_fixture_helper():
    """Guards against this test file's fixture drifting from join_core.py's real field list."""
    expected = {f.name for f in dataclasses.fields(SkillCoreRow)}
    built = set(dataclasses.asdict(_skill_core_row()).keys())
    assert built == expected


def test_role_profile_row_fields_match_fixture_helper():
    expected = {f.name for f in dataclasses.fields(RoleProfileRow)}
    built = set(dataclasses.asdict(_role_profile_row()).keys())
    assert built == expected
