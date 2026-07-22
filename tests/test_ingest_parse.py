"""Failing tests (RED phase) for the four CSV parsers — Task 1 of specs/001-ingest-pipeline.md.

`src/ingest/parse.py` does not exist yet (that's Task 2, Redwood). Importing it here is expected
to raise ModuleNotFoundError until Task 2 lands. These tests define the parsing contract Redwood's
implementation must satisfy: four functions, each taking a file-like object (so callers can pass
`io.StringIO(csv_text)` in tests or an open file handle in production) and returning a list of
typed rows (dataclass instances).

Fixtures below are transcribed verbatim from data/schema-notes.md's sample-row tables (Birch's
extraction of the real Kaggle CSVs) — no dependency on data/raw/ (gitignored, may be absent in
CI), per this task's Constraints.

Expected module contract:
    parse_d1(fileobj) -> list[D1Row]
    parse_d2(fileobj) -> list[D2Row]
    parse_d3_overall(fileobj) -> list[D3OverallRow]
    parse_d3_by_role(fileobj) -> list[D3RoleRow]

Row dataclasses mirror each CSV's columns 1:1 (no join/aggregation logic in this task — that's
Task 3/4's join_core.py):
    D1Row: snapshot_date, category, skill_name, demand_count (int), demand_pct (float),
           median_days_open (float | None), salary_premium_pct (float | None),
           repost_rate_pct (float), scarcity_score (float)
    D2Row: snapshot_date, category, skill, skill_group, listing_count (int),
           total_listings (int), demand_pct (float), required_count (int)
    D3OverallRow: skill, postings_with_skill (int), pct_of_all_postings (float)
    D3RoleRow: role_family, role_postings (int), skill, postings_with_skill (int),
               pct_of_role (float)
"""

import io

import pytest

from src.ingest.parse import (
    D1Row,
    D2Row,
    D3OverallRow,
    D3RoleRow,
    parse_d1,
    parse_d2,
    parse_d3_by_role,
    parse_d3_overall,
)

# --- Fixtures transcribed from data/schema-notes.md -------------------------------------------

D1_CSV = """snapshot_date,category,skill_name,demand_count,demand_pct,median_days_open,salary_premium_pct,repost_rate_pct,scarcity_score
2026-07-12,ai,A/B Testing,115,4.7,1.0,3.9,2.0,49.2
2026-07-12,ai,AI Agents,153,6.3,,45.5,5.9,72.0
2026-07-12,ai,AI Coding Tools,32,1.3,,,0.0,0.0
2026-07-12,ai,CI/CD,65,2.7,1.0,-29.2,17.4,51.8
"""

D2_CSV = """snapshot_date,category,skill,skill_group,listing_count,total_listings,demand_pct,required_count
2026-07-22,data,SQL,Language,834,7447,11.2,827
2026-07-22,data,Python,Language,686,7447,9.2,668
2026-07-22,data,AWS,Cloud,307,7447,4.1,294
"""

D3_OVERALL_CSV = """skill,postings_with_skill,pct_of_all_postings
communication,83239,23.09
ai,71253,19.77
python,67062,18.6
aws,40549,11.25
"""

D3_BY_ROLE_CSV = """role_family,role_postings,skill,postings_with_skill,pct_of_role
Data Scientist / ML,12500,python,9800,78.4
Data Scientist / ML,12500,sql,7600,60.8
DevOps / Cloud / SRE,8400,aws,6200,73.8
Backend,15000,java,9000,60.0
"""


# --- D1 ------------------------------------------------------------------------------------


class TestParseD1:
    def test_returns_one_row_per_csv_data_line(self):
        rows = parse_d1(io.StringIO(D1_CSV))
        assert len(rows) == 4

    def test_rows_are_d1row_instances(self):
        rows = parse_d1(io.StringIO(D1_CSV))
        assert all(isinstance(r, D1Row) for r in rows)

    def test_string_fields_pass_through_untouched(self):
        rows = parse_d1(io.StringIO(D1_CSV))
        first = rows[0]
        assert first.snapshot_date == "2026-07-12"
        assert first.category == "ai"
        assert first.skill_name == "A/B Testing"

    def test_numeric_fields_are_typed_not_left_as_strings(self):
        rows = parse_d1(io.StringIO(D1_CSV))
        first = rows[0]
        assert isinstance(first.demand_count, int)
        assert first.demand_count == 115
        assert isinstance(first.demand_pct, float)
        assert first.demand_pct == pytest.approx(4.7)
        assert isinstance(first.scarcity_score, float)
        assert first.scarcity_score == pytest.approx(49.2)

    def test_empty_median_days_open_parses_to_none_not_zero_or_nan(self):
        rows = parse_d1(io.StringIO(D1_CSV))
        ai_agents = next(r for r in rows if r.skill_name == "AI Agents")
        assert ai_agents.median_days_open is None
        # salary_premium_pct IS present on this row, so it must parse as a float, not None.
        assert ai_agents.salary_premium_pct == pytest.approx(45.5)

    def test_both_nullable_fields_empty_parse_to_none(self):
        rows = parse_d1(io.StringIO(D1_CSV))
        coding_tools = next(r for r in rows if r.skill_name == "AI Coding Tools")
        assert coding_tools.median_days_open is None
        assert coding_tools.salary_premium_pct is None

    def test_non_null_scarcity_score_not_conflated_with_complete_input_data(self):
        # "AI Coding Tools" has BOTH nullable fields empty, yet scarcity_score is a real 0.0 —
        # the parser must not treat 0.0 as "missing" and must not backfill/drop it, and must not
        # infer "no input data" from a merely-zero (but present) scarcity_score.
        rows = parse_d1(io.StringIO(D1_CSV))
        coding_tools = next(r for r in rows if r.skill_name == "AI Coding Tools")
        assert coding_tools.scarcity_score is not None
        assert coding_tools.scarcity_score == pytest.approx(0.0)
        assert isinstance(coding_tools.scarcity_score, float)

    def test_negative_salary_premium_pct_parses_as_negative_float(self):
        # Real D1 data contains negative salary_premium_pct (e.g. CI/CD: -29.2) — must not be
        # clamped to 0 or treated as invalid.
        rows = parse_d1(io.StringIO(D1_CSV))
        ci_cd = next(r for r in rows if r.skill_name == "CI/CD")
        assert ci_cd.salary_premium_pct == pytest.approx(-29.2)

    def test_skill_name_ci_cd_captured_verbatim_with_original_casing(self):
        # normalize_skill is a separate concern (test_normalize.py) — the raw parser must NOT
        # normalize/lowercase skill_name itself.
        rows = parse_d1(io.StringIO(D1_CSV))
        ci_cd = next(r for r in rows if r.skill_name == "CI/CD")
        assert ci_cd.skill_name == "CI/CD"


# --- D2 ------------------------------------------------------------------------------------


class TestParseD2:
    def test_returns_one_row_per_csv_data_line(self):
        rows = parse_d2(io.StringIO(D2_CSV))
        assert len(rows) == 3

    def test_rows_are_d2row_instances(self):
        rows = parse_d2(io.StringIO(D2_CSV))
        assert all(isinstance(r, D2Row) for r in rows)

    def test_fields_typed_correctly(self):
        rows = parse_d2(io.StringIO(D2_CSV))
        sql_row = next(r for r in rows if r.skill == "SQL")
        assert sql_row.snapshot_date == "2026-07-22"
        assert sql_row.category == "data"
        assert sql_row.skill_group == "Language"
        assert isinstance(sql_row.listing_count, int)
        assert sql_row.listing_count == 834
        assert isinstance(sql_row.total_listings, int)
        assert sql_row.total_listings == 7447
        assert isinstance(sql_row.demand_pct, float)
        assert sql_row.demand_pct == pytest.approx(11.2)
        assert isinstance(sql_row.required_count, int)
        assert sql_row.required_count == 827

    def test_no_nulls_expected_in_d2_per_schema_notes(self):
        # data/schema-notes.md: "No nulls in any column (checked all 8 columns, 0 empty across
        # 700 rows)." All fields on every parsed row must be non-None.
        rows = parse_d2(io.StringIO(D2_CSV))
        for row in rows:
            for value in (
                row.snapshot_date,
                row.category,
                row.skill,
                row.skill_group,
                row.listing_count,
                row.total_listings,
                row.demand_pct,
                row.required_count,
            ):
                assert value is not None

    def test_aws_skill_captured_verbatim(self):
        rows = parse_d2(io.StringIO(D2_CSV))
        aws_row = next(r for r in rows if r.skill == "AWS")
        assert aws_row.skill_group == "Cloud"


# --- D3 overall ----------------------------------------------------------------------------


class TestParseD3Overall:
    def test_returns_one_row_per_csv_data_line(self):
        rows = parse_d3_overall(io.StringIO(D3_OVERALL_CSV))
        assert len(rows) == 4

    def test_rows_are_d3overallrow_instances(self):
        rows = parse_d3_overall(io.StringIO(D3_OVERALL_CSV))
        assert all(isinstance(r, D3OverallRow) for r in rows)

    def test_fields_typed_correctly(self):
        rows = parse_d3_overall(io.StringIO(D3_OVERALL_CSV))
        aws_row = next(r for r in rows if r.skill == "aws")
        assert isinstance(aws_row.postings_with_skill, int)
        assert aws_row.postings_with_skill == 40549
        assert isinstance(aws_row.pct_of_all_postings, float)
        assert aws_row.pct_of_all_postings == pytest.approx(11.25)

    def test_skill_lowercasing_from_source_is_preserved_verbatim(self):
        # D3's own file is already all-lowercase; the raw parser must not alter it either way.
        rows = parse_d3_overall(io.StringIO(D3_OVERALL_CSV))
        assert {r.skill for r in rows} == {"communication", "ai", "python", "aws"}


# --- D3 by-role ------------------------------------------------------------------------------


class TestParseD3ByRole:
    def test_returns_one_row_per_csv_data_line(self):
        rows = parse_d3_by_role(io.StringIO(D3_BY_ROLE_CSV))
        assert len(rows) == 4

    def test_rows_are_d3rolerow_instances(self):
        rows = parse_d3_by_role(io.StringIO(D3_BY_ROLE_CSV))
        assert all(isinstance(r, D3RoleRow) for r in rows)

    def test_fields_typed_correctly(self):
        rows = parse_d3_by_role(io.StringIO(D3_BY_ROLE_CSV))
        backend_java = next(r for r in rows if r.role_family == "Backend")
        assert isinstance(backend_java.role_postings, int)
        assert backend_java.role_postings == 15000
        assert backend_java.skill == "java"
        assert isinstance(backend_java.postings_with_skill, int)
        assert backend_java.postings_with_skill == 9000
        assert isinstance(backend_java.pct_of_role, float)
        assert backend_java.pct_of_role == pytest.approx(60.0)

    def test_role_family_captured_verbatim_with_internal_slash_spacing_data_scientist(
        self,
    ):
        # Must be "Data Scientist / ML" (spaces around the slash), NOT AGENTS.md's compact
        # "Data Scientist/ML" shorthand.
        rows = parse_d3_by_role(io.StringIO(D3_BY_ROLE_CSV))
        role_families = {r.role_family for r in rows}
        assert "Data Scientist / ML" in role_families
        assert "Data Scientist/ML" not in role_families

    def test_role_family_captured_verbatim_with_internal_slash_spacing_devops(self):
        # Must be "DevOps / Cloud / SRE", NOT AGENTS.md's compact "DevOps/Cloud/SRE" shorthand.
        rows = parse_d3_by_role(io.StringIO(D3_BY_ROLE_CSV))
        role_families = {r.role_family for r in rows}
        assert "DevOps / Cloud / SRE" in role_families
        assert "DevOps/Cloud/SRE" not in role_families

    def test_multiple_rows_for_same_role_family_are_all_retained(self):
        rows = parse_d3_by_role(io.StringIO(D3_BY_ROLE_CSV))
        ds_ml_rows = [r for r in rows if r.role_family == "Data Scientist / ML"]
        assert len(ds_ml_rows) == 2
        assert {r.skill for r in ds_ml_rows} == {"python", "sql"}


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
