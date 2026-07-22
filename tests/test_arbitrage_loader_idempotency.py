"""Failing tests (RED phase) for the arbitrage-score loader's upsert idempotency — Task 3 of
specs/002-arbitrage-score.md.

`src/scoring/load_supabase.py` does not exist yet (that's Task 4, Redwood). Importing it here is
expected to raise `ModuleNotFoundError` until Task 4 lands — that is the correct RED-phase
failure mode per this task's [SPEC].

Zero-Trust constraint (Security, AGENTS.md): this suite never constructs a real `supabase-py`
Client and never reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. It exercises the loader
against `FakeSupabaseClient` below — the exact same in-memory stand-in used by
`tests/test_loader_idempotency.py` for Task 6/001 — that faithfully emulates Postgres
`ON CONFLICT (...) DO UPDATE` semantics for
`.table(name).upsert(records, on_conflict=...).execute()` — no network, no credentials, ever
required to make this suite pass.

Expected module contract (this file is the source of truth for this signature):

    # src/scoring/load_supabase.py
    ARBITRAGE_SCORES_TABLE: str = "skill_arbitrage_scores"

    def upsert_arbitrage_scores(client, rows: list[ArbitrageScoreRow]) -> None:
        '''Upsert `rows` into `skill_arbitrage_scores`, keyed on `skill_key` (PK, real FK to
        skills_core). Re-running with the same rows must not change row count or duplicate
        rows; re-running with a changed field (e.g. arbitrage_score) for an existing skill_key
        must update that row in place. Empty `rows` is a no-op (does not call the client). Must
        not read SUPABASE_* env vars itself — the caller supplies an already-constructed
        `client`.'''

`client` is expected to be duck-typed against `supabase-py`'s `Client`: only
`client.table(name).upsert(records, on_conflict=...).execute()` is used — nothing else of the
real client's surface is required, so `FakeSupabaseClient` below is a legitimate stand-in for
both this test suite and (via dependency injection) any future live smoke test.
"""

import dataclasses

import pytest

from src.scoring.arbitrage import ArbitrageScoreRow

# --- In-memory stand-in for supabase-py's Client (mirrors tests/test_loader_idempotency.py) -----


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


# --- Fixtures ---------------------------------------------------------------------------------


@pytest.fixture
def client() -> FakeSupabaseClient:
    return FakeSupabaseClient()


def _arbitrage_score_row(skill_key: str = "python", **overrides) -> ArbitrageScoreRow:
    defaults = dict(
        skill_key=skill_key,
        demand_score=12.0,
        scarcity_index=0.67,
        scarcity_data_completeness="full",
        arbitrage_score=8.04,
    )
    defaults.update(overrides)
    return ArbitrageScoreRow(**defaults)


# --- upsert_arbitrage_scores --------------------------------------------------------------------


def test_upsert_arbitrage_scores_writes_rows(client):
    from src.scoring.load_supabase import ARBITRAGE_SCORES_TABLE, upsert_arbitrage_scores

    rows = [_arbitrage_score_row("python"), _arbitrage_score_row("aws")]
    upsert_arbitrage_scores(client, rows)

    stored = client.rows(ARBITRAGE_SCORES_TABLE)
    assert len(stored) == 2
    assert {row["skill_key"] for row in stored} == {"python", "aws"}


def test_upsert_arbitrage_scores_uses_skill_key_as_conflict_target(client):
    from src.scoring.load_supabase import ARBITRAGE_SCORES_TABLE, upsert_arbitrage_scores

    upsert_arbitrage_scores(client, [_arbitrage_score_row("python")])

    assert client.last_on_conflict[ARBITRAGE_SCORES_TABLE] == "skill_key"


def test_upsert_arbitrage_scores_is_idempotent_same_rows_no_duplicates(client):
    from src.scoring.load_supabase import ARBITRAGE_SCORES_TABLE, upsert_arbitrage_scores

    rows = [_arbitrage_score_row("python"), _arbitrage_score_row("aws")]

    upsert_arbitrage_scores(client, rows)
    upsert_arbitrage_scores(client, rows)  # re-run with identical rows

    assert len(client.rows(ARBITRAGE_SCORES_TABLE)) == 2


def test_upsert_arbitrage_scores_updates_arbitrage_score_in_place(client):
    """Edge case from the SPEC: re-running with an updated arbitrage_score for an existing
    skill_key must update that row in place, not insert a duplicate row."""
    from src.scoring.load_supabase import ARBITRAGE_SCORES_TABLE, upsert_arbitrage_scores

    upsert_arbitrage_scores(client, [_arbitrage_score_row("python", arbitrage_score=8.04)])
    upsert_arbitrage_scores(client, [_arbitrage_score_row("python", arbitrage_score=15.5)])

    stored = client.rows(ARBITRAGE_SCORES_TABLE)
    assert len(stored) == 1
    assert stored[0]["arbitrage_score"] == 15.5


def test_upsert_arbitrage_scores_preserves_scarcity_data_completeness_label(client):
    from src.scoring.load_supabase import ARBITRAGE_SCORES_TABLE, upsert_arbitrage_scores

    row = _arbitrage_score_row("duckdb", scarcity_data_completeness="missing_both")
    upsert_arbitrage_scores(client, [row])

    stored = client.rows(ARBITRAGE_SCORES_TABLE)[0]
    assert stored["scarcity_data_completeness"] == "missing_both"


def test_upsert_arbitrage_scores_empty_rows_is_a_noop(client):
    from src.scoring.load_supabase import ARBITRAGE_SCORES_TABLE, upsert_arbitrage_scores

    upsert_arbitrage_scores(client, [])

    assert client.rows(ARBITRAGE_SCORES_TABLE) == []


def test_upsert_arbitrage_scores_does_not_require_supabase_env_vars(client, monkeypatch):
    from src.scoring.load_supabase import upsert_arbitrage_scores

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    # Must not raise despite no live credentials being present anywhere in the environment.
    upsert_arbitrage_scores(client, [_arbitrage_score_row("python")])


# --- Dataclass-field / column-name agreement guard ----------------------------------------------


def test_arbitrage_score_row_fields_match_fixture_helper():
    """Guards against this test file's fixture drifting from arbitrage.py's real field list."""
    expected = {f.name for f in dataclasses.fields(ArbitrageScoreRow)}
    built = set(dataclasses.asdict(_arbitrage_score_row()).keys())
    assert built == expected
