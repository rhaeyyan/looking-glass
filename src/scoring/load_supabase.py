"""Supabase data loader — Task 4 of specs/002-arbitrage-score.md.

Upserts the arbitrage-scoring pipeline's output (`list[ArbitrageScoreRow]`) into the
`skill_arbitrage_scores` table defined by `supabase/migrations/0002_arbitrage_scores.sql`.

Fully deterministic: no scoring, no LLM, no schema/DDL here — this module only writes
already-computed rows through an already-constructed `supabase-py` client (dependency injection;
see `src/scoring/__main__.py` for the one place a real client is built). It never reads
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` itself.

Idempotency: the upsert passes `on_conflict="skill_key"` (the table's primary key, and a real
foreign key into `skills_core`) so re-running with the same rows is a no-op (Postgres
`ON CONFLICT ... DO UPDATE`), and re-running with a changed field for an existing skill_key
updates that row in place rather than duplicating it.
"""

import dataclasses

from src.scoring.arbitrage import ArbitrageScoreRow

ARBITRAGE_SCORES_TABLE = "skill_arbitrage_scores"


def upsert_arbitrage_scores(client, rows: list[ArbitrageScoreRow]) -> None:
    """Upsert `rows` into `skill_arbitrage_scores`, keyed on `skill_key`. Empty `rows` is a
    no-op."""
    if not rows:
        return
    records = [dataclasses.asdict(row) for row in rows]
    client.table(ARBITRAGE_SCORES_TABLE).upsert(records, on_conflict="skill_key").execute()
