"""Failing tests (RED phase) for the D1+D2 grain-collapse join and D3 corroboration badge —
Task 3 of specs/001-ingest-pipeline.md.

`src/ingest/join_core.py` and `src/ingest/corroborate.py` do not exist yet (that's Task 4,
Redwood). Importing them here is expected to raise ModuleNotFoundError until Task 4 lands.
These tests define the exact contract Redwood's implementation must satisfy.

Fixture-based only (no dependency on data/raw/) per this task's Constraints — the real-data
regression guard (141/58 counts) lives in test_data_invariants.py's integration layer instead.

Expected module contract (this file is the source of truth for these signatures):

    # src/ingest/join_core.py
    @dataclass
    class SkillCoreRow:
        skill_key: str                        # normalize_skill(skill_name), PK
        skill_name: str                        # D1's display casing, verbatim
        skill_group: str | None                # from D2
        d1_primary_category: str
        d2_primary_category: str
        d1_demand_count: int
        d1_demand_pct: float
        median_days_open: float | None
        salary_premium_pct: float | None
        repost_rate_pct: float
        scarcity_score: float
        d2_listing_count: int
        d2_total_listings: int
        d2_demand_pct: float
        d2_required_count: int
        d3_corroborated: bool = False
        d3_postings_with_skill: int | None = None
        d3_pct_of_all_postings: float | None = None

    def build_skill_core(d1_rows: list[D1Row], d2_rows: list[D2Row]) -> list[SkillCoreRow]:
        '''Collapse D1's and D2's (snapshot_date x category) grain to one row per skill.

        Only skills present in BOTH d1_rows and d2_rows survive (inner join on skill name).
        Dominant-category rule (Task 4's Intellectual Control, verbatim): for D1's side, group
        a skill's rows by category, pick the single source row whose d1_demand_count is the
        overall max across ALL of that skill's D1 rows (not a per-category sum) — ties broken
        alphabetically by category name. All D1-derived scalar fields on the output row
        (d1_demand_pct, median_days_open, salary_premium_pct, repost_rate_pct, scarcity_score)
        come from that exact winning source row, verbatim — never averaged/blended across rows.
        The same independent argmax+tie-break procedure is applied separately on D2's side
        (keyed on d2_listing_count) to select d2_primary_category and the D2-derived fields.
        d1_primary_category and d2_primary_category may legitimately differ for the same skill.

        d3_corroborated/d3_postings_with_skill/d3_pct_of_all_postings default to
        False/None/None here — populated later by corroborate().
        '''

    # src/ingest/corroborate.py
    def corroborate(
        core_rows: list[SkillCoreRow], d3_overall_rows: list[D3OverallRow]
    ) -> list[SkillCoreRow]:
        '''Set d3_corroborated=True and populate d3_postings_with_skill/d3_pct_of_all_postings
        for every core row whose skill_key matches normalize_skill(d3_row.skill) for some
        d3_overall_rows entry. Never drops or reorders a core row — output has exactly
        len(core_rows) rows, same skills. Non-matched rows keep d3_corroborated=False and both
        d3 fields None (never partially populated: badge False implies both fields None, badge
        True implies both fields non-None).'''
"""

import dataclasses

import pytest

from src.ingest.corroborate import corroborate
from src.ingest.join_core import SkillCoreRow, build_skill_core
from src.ingest.normalize import normalize_skill
from src.ingest.parse import D1Row, D2Row, D3OverallRow

# --- Fixture builders --------------------------------------------------------------------------


def _d1(
    skill_name: str,
    category: str,
    demand_count: int,
    *,
    demand_pct: float = 1.0,
    median_days_open: float | None = 1.0,
    salary_premium_pct: float | None = 1.0,
    repost_rate_pct: float = 1.0,
    scarcity_score: float = 1.0,
    snapshot_date: str = "2026-07-22",
) -> D1Row:
    return D1Row(
        snapshot_date=snapshot_date,
        category=category,
        skill_name=skill_name,
        demand_count=demand_count,
        demand_pct=demand_pct,
        median_days_open=median_days_open,
        salary_premium_pct=salary_premium_pct,
        repost_rate_pct=repost_rate_pct,
        scarcity_score=scarcity_score,
    )


def _d2(
    skill: str,
    category: str,
    listing_count: int,
    *,
    skill_group: str = "Cloud",
    total_listings: int = 1000,
    demand_pct: float = 1.0,
    required_count: int = 1,
    snapshot_date: str = "2026-07-22",
) -> D2Row:
    return D2Row(
        snapshot_date=snapshot_date,
        category=category,
        skill=skill,
        skill_group=skill_group,
        listing_count=listing_count,
        total_listings=total_listings,
        demand_pct=demand_pct,
        required_count=required_count,
    )


# AWS: present in both D1 and D2, with DIFFERENT dominant categories on each side, proving
# d1_primary_category and d2_primary_category are resolved independently.
AWS_D1_ROWS = [
    _d1(
        "AWS",
        "data",
        100,
        demand_pct=5.0,
        median_days_open=10.0,
        salary_premium_pct=5.0,
        repost_rate_pct=2.0,
        scarcity_score=40.0,
    ),
    _d1(
        "AWS",
        "engineering",
        300,
        demand_pct=9.0,
        median_days_open=None,
        salary_premium_pct=8.0,
        repost_rate_pct=3.0,
        scarcity_score=55.0,
    ),  # dominant: highest d1_demand_count
    _d1(
        "AWS",
        "devops",
        150,
        demand_pct=6.0,
        median_days_open=4.0,
        salary_premium_pct=6.0,
        repost_rate_pct=2.5,
        scarcity_score=45.0,
    ),
]
AWS_D2_ROWS = [
    _d2(
        "AWS",
        "data",
        200,
        skill_group="Cloud",
        total_listings=4000,
        demand_pct=5.0,
        required_count=190,
    ),  # dominant: highest d2_listing_count
    _d2(
        "AWS",
        "engineering",
        120,
        skill_group="Cloud",
        total_listings=5000,
        demand_pct=2.4,
        required_count=110,
    ),
    _d2(
        "AWS",
        "devops",
        80,
        skill_group="Cloud",
        total_listings=2000,
        demand_pct=4.0,
        required_count=75,
    ),
]

# Kubernetes: a tie on the count field within D1 AND within D2 — tests that tie-break is truly
# alphabetical-by-category, not "first row wins" (the alphabetically-later category is listed
# FIRST in the fixture list on purpose).
KUBERNETES_D1_ROWS = [
    _d1("Kubernetes", "security", 200, scarcity_score=60.0),  # listed first, NOT alphabetical
    _d1("Kubernetes", "devops", 200, scarcity_score=65.0),  # alphabetically first -> must win
]
KUBERNETES_D2_ROWS = [
    _d2("Kubernetes", "product", 90, skill_group="Platform"),  # listed first, NOT alphabetical
    _d2("Kubernetes", "devops", 90, skill_group="Platform"),  # alphabetically first -> must win
]

# DuckDB: present in D2 only, never in D1 -> must be excluded from the core entirely.
DUCKDB_D2_ROWS = [_d2("DuckDB", "data", 999, skill_group="Database")]

# Rust: present in D1 only, never in D2 -> must also be excluded (join is symmetric).
RUST_D1_ROWS = [_d1("Rust", "engineering", 999, scarcity_score=99.0)]


def _all_d1_rows() -> list[D1Row]:
    return [*AWS_D1_ROWS, *KUBERNETES_D1_ROWS, *RUST_D1_ROWS]


def _all_d2_rows() -> list[D2Row]:
    return [*AWS_D2_ROWS, *KUBERNETES_D2_ROWS, *DUCKDB_D2_ROWS]


# --- build_skill_core: join membership ------------------------------------------------------


class TestBuildSkillCoreJoinMembership:
    def test_only_skills_in_both_d1_and_d2_survive(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        skill_names = {row.skill_name for row in core}
        assert skill_names == {"AWS", "Kubernetes"}

    def test_d2_only_skill_is_excluded_not_included_with_nulls(self):
        # DuckDB is in D2 but not D1 — it must not appear at all, not appear with a
        # null/placeholder D1 side.
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        assert "DuckDB" not in {row.skill_name for row in core}
        assert normalize_skill("DuckDB") not in {row.skill_key for row in core}

    def test_d1_only_skill_is_also_excluded(self):
        # Rust is in D1 but not D2 — the join is symmetric, not D1-driven-with-D2-optional.
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        assert "Rust" not in {row.skill_name for row in core}

    def test_output_rows_are_skillcorerow_instances(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        assert all(isinstance(row, SkillCoreRow) for row in core)

    def test_empty_inputs_produce_empty_core(self):
        assert build_skill_core([], []) == []


# --- build_skill_core: dominant-category rule (D1 side) -----------------------------------


class TestDominantCategoryD1Side:
    def test_highest_demand_count_category_wins(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_name == "AWS")
        assert aws.d1_primary_category == "engineering"
        assert aws.d1_demand_count == 300

    def test_scalar_fields_come_verbatim_from_the_winning_row_not_blended(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_name == "AWS")
        # engineering row: demand_pct=9.0, median_days_open=None, salary_premium_pct=8.0,
        # repost_rate_pct=3.0, scarcity_score=55.0 — must match exactly, not averaged with the
        # data/devops rows.
        assert aws.d1_demand_pct == pytest.approx(9.0)
        assert aws.median_days_open is None
        assert aws.salary_premium_pct == pytest.approx(8.0)
        assert aws.repost_rate_pct == pytest.approx(3.0)
        assert aws.scarcity_score == pytest.approx(55.0)

    def test_tie_on_count_field_breaks_alphabetically_by_category(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        kube = next(row for row in core if row.skill_name == "Kubernetes")
        # devops (200) ties with security (200) on d1_demand_count; devops < security
        # alphabetically, and it must win even though "security" is listed first in the input.
        assert kube.d1_primary_category == "devops"
        assert kube.scarcity_score == pytest.approx(65.0)


# --- build_skill_core: dominant-category rule (D2 side, independent of D1) ------------------


class TestDominantCategoryD2Side:
    def test_highest_listing_count_category_wins(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_name == "AWS")
        assert aws.d2_primary_category == "data"
        assert aws.d2_listing_count == 200

    def test_d1_and_d2_primary_categories_are_resolved_independently(self):
        # AWS's dominant category differs between D1 ("engineering") and D2 ("data") — this
        # is only possible if the two sides are NOT constrained to agree.
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_name == "AWS")
        assert aws.d1_primary_category != aws.d2_primary_category
        assert aws.d1_primary_category == "engineering"
        assert aws.d2_primary_category == "data"

    def test_d2_scalar_fields_come_verbatim_from_the_winning_row(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_name == "AWS")
        assert aws.d2_total_listings == 4000
        assert aws.d2_demand_pct == pytest.approx(5.0)
        assert aws.d2_required_count == 190

    def test_tie_on_count_field_breaks_alphabetically_by_category(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        kube = next(row for row in core if row.skill_name == "Kubernetes")
        # devops (90) ties with product (90) on d2_listing_count; devops < product
        # alphabetically, and it must win even though "product" is listed first in the input.
        assert kube.d2_primary_category == "devops"

    def test_skill_group_populated_from_d2(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        kube = next(row for row in core if row.skill_name == "Kubernetes")
        assert kube.skill_group == "Platform"


# --- build_skill_core: skill_key / skill_name -----------------------------------------------


class TestSkillKeyAndName:
    def test_skill_key_is_normalized_form_of_skill_name(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_name == "AWS")
        assert aws.skill_key == normalize_skill("AWS")

    def test_skill_name_preserves_d1_display_casing_verbatim(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        aws = next(row for row in core if row.skill_key == normalize_skill("AWS"))
        assert aws.skill_name == "AWS"


# --- build_skill_core: pre-corroboration defaults -------------------------------------------


class TestPreCorroborationDefaults:
    def test_d3_fields_default_to_uncorroborated_before_corroborate_runs(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        for row in core:
            assert row.d3_corroborated is False
            assert row.d3_postings_with_skill is None
            assert row.d3_pct_of_all_postings is None


# --- build_skill_core: determinism (Bounded-AI invariant) -----------------------------------


class TestBuildSkillCoreDeterminism:
    def test_same_inputs_produce_identical_output_across_repeated_calls(self):
        d1_rows = _all_d1_rows()
        d2_rows = _all_d2_rows()
        first = build_skill_core(d1_rows, d2_rows)
        second = build_skill_core(d1_rows, d2_rows)
        assert [dataclasses.asdict(r) for r in first] == [dataclasses.asdict(r) for r in second]

    def test_output_does_not_mutate_input_rows(self):
        d1_rows = _all_d1_rows()
        d2_rows = _all_d2_rows()
        d1_before = [dataclasses.asdict(r) for r in d1_rows]
        d2_before = [dataclasses.asdict(r) for r in d2_rows]
        build_skill_core(d1_rows, d2_rows)
        assert [dataclasses.asdict(r) for r in d1_rows] == d1_before
        assert [dataclasses.asdict(r) for r in d2_rows] == d2_before


# --- corroborate: fixtures -------------------------------------------------------------------

D3_OVERALL_ROWS = [
    D3OverallRow(skill="aws", postings_with_skill=40549, pct_of_all_postings=11.25),
    # Deliberately no "kubernetes" entry — Kubernetes must come back uncorroborated.
]


class TestCorroborate:
    def test_never_drops_or_adds_rows(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        result = corroborate(core, D3_OVERALL_ROWS)
        assert len(result) == len(core)
        assert {row.skill_name for row in result} == {row.skill_name for row in core}

    def test_matched_skill_is_flagged_corroborated_with_populated_fields(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        result = corroborate(core, D3_OVERALL_ROWS)
        aws = next(row for row in result if row.skill_name == "AWS")
        assert aws.d3_corroborated is True
        assert aws.d3_postings_with_skill == 40549
        assert aws.d3_pct_of_all_postings == pytest.approx(11.25)

    def test_unmatched_skill_stays_uncorroborated_with_null_fields(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        result = corroborate(core, D3_OVERALL_ROWS)
        kube = next(row for row in result if row.skill_name == "Kubernetes")
        assert kube.d3_corroborated is False
        assert kube.d3_postings_with_skill is None
        assert kube.d3_pct_of_all_postings is None

    def test_matching_is_normalized_not_exact_string(self):
        # D1's "AWS" vs D3's "aws" — must match via normalize_skill, not byte-identical string
        # comparison.
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        result = corroborate(core, D3_OVERALL_ROWS)
        aws = next(row for row in result if row.skill_name == "AWS")
        assert aws.d3_corroborated is True

    def test_empty_d3_overall_leaves_everything_uncorroborated(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        result = corroborate(core, [])
        assert all(row.d3_corroborated is False for row in result)
        assert all(row.d3_postings_with_skill is None for row in result)

    def test_determinism_across_repeated_calls(self):
        core = build_skill_core(_all_d1_rows(), _all_d2_rows())
        first = corroborate(core, D3_OVERALL_ROWS)
        second = corroborate(core, D3_OVERALL_ROWS)
        assert [dataclasses.asdict(r) for r in first] == [dataclasses.asdict(r) for r in second]


# --- build_role_profiles: fixtures & tests --------------------------------------------------
#
# Expected module contract (src/ingest/role_profile.py):
#
#     @dataclass
#     class RoleProfileRow:
#         role_family: str                # verbatim, including internal slash-spacing
#         skill_name_raw: str             # verbatim from D3RoleRow.skill
#         skill_key: str                  # normalize_skill(skill_name_raw) — ALWAYS computed,
#                                          # never None, even when no core row matches it
#         postings_with_skill: int
#         pct_of_role: float
#         role_postings: int
#
#     def build_role_profiles(
#         d3_role_rows: list[D3RoleRow], core_rows: list[SkillCoreRow]
#     ) -> list[RoleProfileRow]:
#         '''One RoleProfileRow per input D3RoleRow — 1:1, never dropped, never merged, even for
#         role-skills (e.g. soft skills like "communication") that don't resolve against
#         core_rows. skill_key is always normalize_skill(skill_name_raw); core_rows is accepted
#         so implementations may spot-check/log unmatched keys, but membership in core_rows must
#         NOT gate whether a row appears in the output — that's a downstream (MVP step 4)
#         concern, not this function's.'''


class TestBuildRoleProfiles:
    def _core_rows(self) -> list[SkillCoreRow]:
        # A minimal core containing only "java" (skill_key), built directly via build_skill_core
        # so it's a real SkillCoreRow instance, not a hand-rolled stand-in.
        d1_rows = [_d1("Java", "engineering", 500, scarcity_score=42.0)]
        d2_rows = [_d2("Java", "engineering", 400, skill_group="Language")]
        return build_skill_core(d1_rows, d2_rows)

    def _role_rows(self):
        from src.ingest.parse import D3RoleRow

        return [
            D3RoleRow(
                role_family="Backend",
                role_postings=15000,
                skill="java",
                postings_with_skill=9000,
                pct_of_role=60.0,
            ),
            D3RoleRow(
                role_family="Data Scientist / ML",
                role_postings=12500,
                skill="communication",  # soft skill, absent from core_rows on purpose
                postings_with_skill=1822,
                pct_of_role=15.35,
            ),
        ]

    def test_one_output_row_per_input_row_none_dropped(self):
        from src.ingest.role_profile import build_role_profiles

        role_rows = self._role_rows()
        result = build_role_profiles(role_rows, self._core_rows())
        assert len(result) == len(role_rows) == 2

    def test_role_family_preserved_verbatim_with_internal_slash_spacing(self):
        from src.ingest.role_profile import build_role_profiles

        result = build_role_profiles(self._role_rows(), self._core_rows())
        role_families = {row.role_family for row in result}
        assert "Data Scientist / ML" in role_families
        assert "Backend" in role_families

    def test_pass_through_scalar_fields_are_unchanged(self):
        from src.ingest.role_profile import build_role_profiles

        result = build_role_profiles(self._role_rows(), self._core_rows())
        java_row = next(row for row in result if row.skill_name_raw == "java")
        assert java_row.role_postings == 15000
        assert java_row.postings_with_skill == 9000
        assert java_row.pct_of_role == pytest.approx(60.0)

    def test_skill_key_always_computed_via_normalize_skill_even_with_no_core_match(self):
        from src.ingest.role_profile import build_role_profiles

        result = build_role_profiles(self._role_rows(), self._core_rows())
        communication_row = next(row for row in result if row.skill_name_raw == "communication")
        # "communication" has NO match in core_rows, but skill_key must still be populated
        # (never None/dropped) — flagging "demand only" is a downstream concern, not this one.
        assert communication_row.skill_key == normalize_skill("communication")
        assert communication_row.skill_key is not None
        core_keys = {row.skill_key for row in self._core_rows()}
        assert communication_row.skill_key not in core_keys

    def test_matched_skill_key_equals_a_core_row_skill_key(self):
        from src.ingest.role_profile import build_role_profiles

        core_rows = self._core_rows()
        result = build_role_profiles(self._role_rows(), core_rows)
        java_row = next(row for row in result if row.skill_name_raw == "java")
        core_keys = {row.skill_key for row in core_rows}
        assert java_row.skill_key in core_keys
        assert java_row.skill_key == normalize_skill("java")

    def test_multiple_rows_for_same_skill_across_roles_all_retained(self):
        from src.ingest.parse import D3RoleRow
        from src.ingest.role_profile import build_role_profiles

        role_rows = [
            D3RoleRow("Backend", 15000, "java", 9000, 60.0),
            D3RoleRow("Software Engineer", 20000, "java", 11000, 55.0),
        ]
        result = build_role_profiles(role_rows, self._core_rows())
        assert len(result) == 2
        assert {row.role_family for row in result} == {"Backend", "Software Engineer"}

    def test_determinism_across_repeated_calls(self):
        from src.ingest.role_profile import build_role_profiles

        role_rows = self._role_rows()
        core_rows = self._core_rows()
        first = build_role_profiles(role_rows, core_rows)
        second = build_role_profiles(role_rows, core_rows)
        assert [dataclasses.asdict(r) for r in first] == [dataclasses.asdict(r) for r in second]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
