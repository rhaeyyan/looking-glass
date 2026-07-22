"""CLI entrypoint for the ingest pipeline — Task 6 of specs/001-ingest-pipeline.md.

    python -m src.ingest

Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment, runs the deterministic
parse -> join -> corroborate -> role-profile pipeline (src/ingest/pipeline.py) against
`data/raw/`, then upserts the results into Supabase.

This is the one place in the codebase a real `supabase-py` Client is constructed — kept out of
every test path (tests inject a FakeSupabaseClient into load_supabase.py's functions directly).
No Supabase URL/key literals ever appear here; both are read from the environment only.
"""

import os
import sys
from pathlib import Path

from src.ingest.load_supabase import upsert_role_profiles, upsert_skill_core
from src.ingest.pipeline import run_pipeline
from supabase import create_client

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the "
            "environment (see .env.example) — halting before any DB write.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    client = create_client(url, key)

    core_rows, role_profile_rows = run_pipeline(RAW_DIR)

    upsert_skill_core(client, core_rows)
    upsert_role_profiles(client, role_profile_rows)

    print(
        f"loaded {len(core_rows)} skills_core rows, "
        f"{len(role_profile_rows)} skill_role_profile rows"
    )


if __name__ == "__main__":
    main()
