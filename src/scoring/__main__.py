"""CLI entrypoint for the arbitrage-scoring pipeline — Task 4 of specs/002-arbitrage-score.md.

    python -m src.scoring

Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment, re-runs the deterministic
ingest chain against `data/raw/` (src/scoring/pipeline.py), computes the Arbitrage Score for
every skill, then upserts the results into Supabase.

This is the one place in this module a real `supabase-py` Client is constructed — kept out of
every test path (tests inject a FakeSupabaseClient into load_supabase.py's functions directly).
No Supabase URL/key literals ever appear here; both are read from the environment only.

Kept as an independent CLI from `src.ingest.__main__`: decouples "recompute scores" from
"re-ingest raw data" and avoids touching that already-tested entrypoint.
"""

import os
import sys
from pathlib import Path

from src.scoring.load_supabase import upsert_arbitrage_scores
from src.scoring.pipeline import run_scoring_pipeline
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

    score_rows = run_scoring_pipeline(RAW_DIR)

    upsert_arbitrage_scores(client, score_rows)

    print(f"loaded {len(score_rows)} skill_arbitrage_scores rows")


if __name__ == "__main__":
    main()
