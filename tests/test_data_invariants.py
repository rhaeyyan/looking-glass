"""Failing tests (RED phase) for the real-data D1+D2+D3 invariants — Task 3 of
specs/001-ingest-pipeline.md.

`src/ingest/pipeline.py` (and the join_core/corroborate/role_profile modules it composes) do
not exist yet (that's Task 4, Redwood). Importing it here is expected to raise
ModuleNotFoundError until Task 4 lands.

These are INTEGRATION tests: they read the real CSVs under `data/raw/` (gitignored, present
only on a machine that has run the Kaggle extraction — see data/schema-notes.md). Per this
task's Constraints, the whole module is skipped with a clear message when that directory is
absent, so a fresh clone / CI run never fails because of missing gitignored data.

Once Task 4 lands, this file is the actual regression guard for the 139->141 discrepancy
documented in specs/001-ingest-pipeline.md: `len(core) == 141` becomes an enforced assertion,
not a doc claim.

Expected module contract (src/ingest/pipeline.py):

    def run_pipeline(raw_dir: Path | str) -> tuple[list[SkillCoreRow], list[RoleProfileRow]]:
        '''Read data/raw/d1/skill-scarcity-index.csv, data/raw/d2/skill-demand-index.csv,
        data/raw/d3/skills-2026-overall.csv, and data/raw/d3/skills-2026-by-role.csv (all
        relative to `raw_dir`), parse them (src.ingest.parse), and compose
        build_skill_core -> corroborate -> build_role_profiles (src.ingest.join_core /
        .corroborate / .role_profile) into the final (core_rows, role_profile_rows) tuple.
        Fully deterministic: no network access beyond reading local files, no LLM.'''
"""

from collections import Counter
from pathlib import Path

import pytest

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

pytestmark = pytest.mark.skipif(
    not RAW_DIR.exists(),
    reason=(
        "data/raw/ is gitignored and absent on this machine (fresh clone/CI) — integration "
        "tests for the real 141-skill core / 58-skill corroboration / 450-row role-profile "
        "invariants are skipped. Run the Kaggle extraction locally (see data/schema-notes.md) "
        "to exercise this file."
    ),
)

# The six V1 roles, EXACT strings including internal slash-spacing (data/schema-notes.md).
V1_ROLE_FAMILIES = {
    "Backend",
    "Full Stack",
    "Data Scientist / ML",
    "Data Engineer",
    "Software Engineer",
    "DevOps / Cloud / SRE",
}

# All 15 role_family values D3's by-role CSV actually contains.
ALL_15_ROLE_FAMILIES = V1_ROLE_FAMILIES | {
    "Business Analyst",
    "Data Analyst / BI",
    "Designer (UX/UI)",
    "Frontend",
    "Mobile",
    "Product Manager",
    "Project / Program Mgr",
    "QA / Test",
    "Security",
}


@pytest.fixture(scope="module")
def pipeline_result():
    from src.ingest.pipeline import run_pipeline

    return run_pipeline(RAW_DIR)


class TestSkillCoreSize:
    def test_core_has_exactly_141_skills(self, pipeline_result):
        # Regression-locks the measured 141 (not AGENTS.md/README's stale "139") per
        # specs/001-ingest-pipeline.md's discrepancy note.
        core, _ = pipeline_result
        assert len(core) == 141

    def test_core_skill_keys_are_unique(self, pipeline_result):
        core, _ = pipeline_result
        skill_keys = [row.skill_key for row in core]
        assert len(skill_keys) == len(set(skill_keys))

    def test_duckdb_is_excluded_from_the_core(self, pipeline_result):
        # duckdb is one of D2's 7 D1-less skills (data/schema-notes.md) — must never appear.
        from src.ingest.normalize import normalize_skill

        core, _ = pipeline_result
        assert normalize_skill("DuckDB") not in {row.skill_key for row in core}

    def test_all_seven_d2_only_skills_are_excluded(self, pipeline_result):
        from src.ingest.normalize import normalize_skill

        core, _ = pipeline_result
        core_keys = {row.skill_key for row in core}
        d2_only = {"duckdb", "qlik", "r", "ray", "streamlit", "supabase", "talend"}
        for skill in d2_only:
            assert normalize_skill(skill) not in core_keys, (
                f"{skill!r} is D2-only per data/schema-notes.md and must be excluded from "
                "the 141-skill core, not silently included with null D1 fields"
            )


class TestThreeWayCorroboration:
    def test_exactly_58_skills_are_corroborated_by_d3(self, pipeline_result):
        core, _ = pipeline_result
        corroborated = [row for row in core if row.d3_corroborated]
        assert len(corroborated) == 58

    def test_corroborated_rows_have_both_d3_fields_populated(self, pipeline_result):
        core, _ = pipeline_result
        for row in core:
            if row.d3_corroborated:
                assert row.d3_postings_with_skill is not None
                assert row.d3_pct_of_all_postings is not None

    def test_uncorroborated_rows_have_both_d3_fields_null(self, pipeline_result):
        # Never partially populated: badge False must imply both fields None.
        core, _ = pipeline_result
        for row in core:
            if not row.d3_corroborated:
                assert row.d3_postings_with_skill is None
                assert row.d3_pct_of_all_postings is None

    def test_83_skills_remain_uncorroborated(self, pipeline_result):
        # 141 - 58 = 83, sanity-checks the two counts are complementary and partition the core.
        core, _ = pipeline_result
        uncorroborated = [row for row in core if not row.d3_corroborated]
        assert len(uncorroborated) == 141 - 58


class TestRoleProfileTable:
    def test_exactly_450_role_profile_rows(self, pipeline_result):
        _, role_profiles = pipeline_result
        assert len(role_profiles) == 450

    def test_exactly_15_distinct_role_families(self, pipeline_result):
        _, role_profiles = pipeline_result
        assert {row.role_family for row in role_profiles} == ALL_15_ROLE_FAMILIES

    def test_exactly_30_rows_per_role(self, pipeline_result):
        _, role_profiles = pipeline_result
        counts = Counter(row.role_family for row in role_profiles)
        assert len(counts) == 15
        for role_family, count in counts.items():
            assert count == 30, f"{role_family!r} has {count} rows, expected 30"

    def test_all_six_v1_roles_present_with_exact_spacing(self, pipeline_result):
        _, role_profiles = pipeline_result
        role_families = {row.role_family for row in role_profiles}
        for role in V1_ROLE_FAMILIES:
            assert role in role_families
        # Explicitly guard against AGENTS.md's compact (no-space) shorthand leaking in.
        assert "Data Scientist/ML" not in role_families
        assert "DevOps/Cloud/SRE" not in role_families

    def test_soft_skill_without_core_match_still_appears_in_role_profile(self, pipeline_result):
        # "communication" is a D3 role-skill with no match in the 141-skill core — it must be
        # surfaced, never silently dropped, per this task's Edge Cases.
        core, role_profiles = pipeline_result
        core_keys = {row.skill_key for row in core}
        communication_rows = [row for row in role_profiles if row.skill_name_raw == "communication"]
        assert len(communication_rows) > 0
        for row in communication_rows:
            assert row.skill_key is not None
            assert row.skill_key not in core_keys

    def test_every_role_profile_row_has_a_non_null_skill_key(self, pipeline_result):
        # skill_key is always computed via normalize_skill, even absent a core match.
        _, role_profiles = pipeline_result
        assert all(row.skill_key is not None for row in role_profiles)


class TestDeterminism:
    def test_running_the_pipeline_twice_produces_identical_core(self):
        import dataclasses

        from src.ingest.pipeline import run_pipeline

        core_a, _ = run_pipeline(RAW_DIR)
        core_b, _ = run_pipeline(RAW_DIR)
        assert [dataclasses.asdict(r) for r in core_a] == [dataclasses.asdict(r) for r in core_b]

    def test_running_the_pipeline_twice_produces_identical_role_profiles(self):
        import dataclasses

        from src.ingest.pipeline import run_pipeline

        _, profiles_a = run_pipeline(RAW_DIR)
        _, profiles_b = run_pipeline(RAW_DIR)
        assert [dataclasses.asdict(r) for r in profiles_a] == [
            dataclasses.asdict(r) for r in profiles_b
        ]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
