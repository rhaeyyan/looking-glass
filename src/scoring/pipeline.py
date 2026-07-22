"""End-to-end scoring pipeline composition — Task 4 of specs/002-arbitrage-score.md.

Reuses the already-tested ingest chain (`src.ingest.pipeline.run_pipeline`) to get the full
`list[SkillCoreRow]` straight from the raw CSVs — no read-time Supabase dependency, and no
ingestion/join logic duplicated here — then applies `compute_arbitrage_score` to every row.
Fully deterministic: no LLM, no DB write (that's `src/scoring/load_supabase.py`).
"""

from pathlib import Path

from src.ingest.pipeline import run_pipeline
from src.scoring.arbitrage import ArbitrageScoreRow, compute_arbitrage_score


def run_scoring_pipeline(raw_dir: Path | str) -> list[ArbitrageScoreRow]:
    """Re-run the ingest chain against `raw_dir` and score every resulting skills_core row.

    Operates on the full skills_core set independent of any role — role-gap filtering is a
    later concern, not this pipeline's.
    """
    core_rows, _role_profile_rows = run_pipeline(raw_dir)
    return [compute_arbitrage_score(row) for row in core_rows]
