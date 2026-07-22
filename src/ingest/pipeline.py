"""End-to-end ingest pipeline composition — Task 4 of specs/001-ingest-pipeline.md.

Reads the four real CSVs under `raw_dir/{d1,d2,d3}/*.csv`, parses them, and composes
build_skill_core -> corroborate -> build_role_profiles into the final (core_rows,
role_profile_rows) tuple. Fully deterministic: no network access beyond reading local files,
no LLM, no DB write (that's Task 6).
"""

from pathlib import Path

from src.ingest.corroborate import corroborate
from src.ingest.join_core import SkillCoreRow, build_skill_core
from src.ingest.parse import parse_d1, parse_d2, parse_d3_by_role, parse_d3_overall
from src.ingest.role_profile import RoleProfileRow, build_role_profiles


def run_pipeline(raw_dir: Path | str) -> tuple[list[SkillCoreRow], list[RoleProfileRow]]:
    """Parse D1/D2/D3 under `raw_dir` and compose the join -> corroborate -> role-profile chain."""
    raw_dir = Path(raw_dir)

    with open(raw_dir / "d1" / "skill-scarcity-index.csv", newline="", encoding="utf-8") as f:
        d1_rows = parse_d1(f)

    with open(raw_dir / "d2" / "skill-demand-index.csv", newline="", encoding="utf-8") as f:
        d2_rows = parse_d2(f)

    with open(raw_dir / "d3" / "skills-2026-overall.csv", newline="", encoding="utf-8") as f:
        d3_overall_rows = parse_d3_overall(f)

    with open(raw_dir / "d3" / "skills-2026-by-role.csv", newline="", encoding="utf-8") as f:
        d3_role_rows = parse_d3_by_role(f)

    core_rows = build_skill_core(d1_rows, d2_rows)
    core_rows = corroborate(core_rows, d3_overall_rows)
    role_profile_rows = build_role_profiles(d3_role_rows, core_rows)

    return core_rows, role_profile_rows
