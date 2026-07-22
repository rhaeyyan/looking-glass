"""Supabase data loader — Task 6 of specs/001-ingest-pipeline.md.

Upserts the Task 4 pipeline outputs (`list[SkillCoreRow]`, `list[RoleProfileRow]`) into the
`skills_core` / `skill_role_profile` tables defined by
`supabase/migrations/0001_init_skills_schema.sql`.

Fully deterministic: no scoring, no LLM, no schema/DDL here — this module only writes
already-computed rows through an already-constructed `supabase-py` client (dependency injection;
see `src/ingest/__main__.py` for the one place a real client is built). It never reads
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` itself.

Idempotency: both upserts pass `on_conflict=<primary key column(s)>` so re-running with the same
rows is a no-op (Postgres `ON CONFLICT ... DO UPDATE`), and re-running with a changed field for an
existing key updates that row in place rather than duplicating it.
"""

import dataclasses

from src.ingest.join_core import SkillCoreRow
from src.ingest.role_profile import RoleProfileRow

SKILLS_CORE_TABLE = "skills_core"
SKILL_ROLE_PROFILE_TABLE = "skill_role_profile"


def upsert_skill_core(client, rows: list[SkillCoreRow]) -> None:
    """Upsert `rows` into `skills_core`, keyed on `skill_key`. Empty `rows` is a no-op."""
    if not rows:
        return
    records = [dataclasses.asdict(row) for row in rows]
    client.table(SKILLS_CORE_TABLE).upsert(records, on_conflict="skill_key").execute()


def upsert_role_profiles(client, rows: list[RoleProfileRow]) -> None:
    """Upsert `rows` into `skill_role_profile`, keyed on (role_family, skill_name_raw).

    Empty `rows` is a no-op.
    """
    if not rows:
        return
    records = [dataclasses.asdict(row) for row in rows]
    client.table(SKILL_ROLE_PROFILE_TABLE).upsert(
        records, on_conflict="role_family,skill_name_raw"
    ).execute()
