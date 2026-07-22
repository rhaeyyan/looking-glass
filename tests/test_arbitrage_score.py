"""Failing tests (RED phase) for the deterministic arbitrage-score formula — Task 1 of
specs/002-arbitrage-score.md.

`src/scoring/arbitrage.py` does not exist yet (that's Task 2, Redwood). Importing it here is
expected to raise ModuleNotFoundError until Task 2 lands. These tests define the exact contract
Redwood's implementation must satisfy — see specs/002-arbitrage-score.md's Task 1 [SPEC] for the
full formula rationale (demand = d2_demand_pct only; scarcity = a 0.6/0.2/0.2 weighted composite
with a 60-day cap on median_days_open and a 100 cap on salary_premium_pct; graceful weight
renormalization on missing nullable scarcity inputs, never zero-substitution).

Expected module contract (this file is the source of truth for these signatures):

    # src/scoring/arbitrage.py
    @dataclass
    class ArbitrageScoreRow:
        skill_key: str
        demand_score: float
        scarcity_index: float
        scarcity_data_completeness: str   # "full" | "missing_salary_premium" |
                                           # "missing_days_open" | "missing_both"
        arbitrage_score: float

    def compute_arbitrage_score(row: SkillCoreRow) -> ArbitrageScoreRow:
        '''Pure, deterministic, single-row-only (no dataset-wide stats). demand_score =
        row.d2_demand_pct verbatim — row.d1_demand_pct is never read/blended.

        scarcity_index is a weighted composite of:
          - row.scarcity_score, uncapped/untouched, weight 0.6 (always present, never clipped);
          - a salary-premium sub-component = min(row.salary_premium_pct, 100.0), weight 0.2;
          - a days-open sub-component = min(row.median_days_open, 60.0) / 60.0 * 100.0, weight
            0.2 (rescaled onto a 0-100 range so it composites with the other two terms).

        When salary_premium_pct or median_days_open is None, that term drops out entirely and the
        remaining weight(s) renormalize proportionally (0.6/0.2 -> 0.75/0.25) — never substituted
        with zero. When both are None, scarcity_index == row.scarcity_score exactly.
        scarcity_data_completeness labels which of the four cases applied.

        arbitrage_score = demand_score * scarcity_index.

        row.d3_corroborated / row.d3_postings_with_skill / row.d3_pct_of_all_postings never
        participate in any of the above — pure D3 passthrough fields, scored separately (or not
        at all) by later consumers.
        '''
"""

import dataclasses

import pytest
from src.scoring.arbitrage import ArbitrageScoreRow, compute_arbitrage_score

from src.ingest.join_core import SkillCoreRow

DAYS_OPEN_CAP = 60.0
SALARY_PREMIUM_CAP = 100.0


def _days_sub(median_days_open: float) -> float:
    """Oracle for the days-open sub-component: cap at 60, rescale to a 0-100 range."""
    return min(median_days_open, DAYS_OPEN_CAP) / DAYS_OPEN_CAP * 100.0


def _salary_sub(salary_premium_pct: float) -> float:
    """Oracle for the salary-premium sub-component: cap at 100, no rescaling needed."""
    return min(salary_premium_pct, SALARY_PREMIUM_CAP)


def _core_row(**overrides) -> SkillCoreRow:
    """Build a SkillCoreRow fixture with sensible, real-data-shaped defaults.

    Baseline values are drawn from data/schema-notes.md's D1 sample row for "A/B Testing"
    (demand_pct=4.7, median_days_open=1.0, salary_premium_pct=3.9, repost_rate_pct=2.0,
    scarcity_score=49.2) and D2's sample row for "AWS" (demand_pct=4.1, listing_count=307,
    total_listings=7447, required_count=294) — mixed deliberately so d1_demand_pct (4.7) and
    d2_demand_pct (4.1) are distinct real values, which is what TestDemandScoreSource depends on.
    Individual tests override only the fields relevant to the behavior under test.
    """
    defaults = dict(
        skill_key="a b testing",
        skill_name="A/B Testing",
        skill_group="Practice",
        d1_primary_category="ai",
        d2_primary_category="data",
        d1_demand_count=115,
        d1_demand_pct=4.7,  # real D1 sample value — must never be read by compute_arbitrage_score
        median_days_open=1.0,
        salary_premium_pct=3.9,
        repost_rate_pct=2.0,
        scarcity_score=49.2,
        d2_listing_count=307,
        d2_total_listings=7447,
        d2_demand_pct=4.1,  # real D2 sample value — demand_score must equal this exactly
        d2_required_count=294,
        d3_corroborated=False,
        d3_postings_with_skill=None,
        d3_pct_of_all_postings=None,
    )
    defaults.update(overrides)
    return SkillCoreRow(**defaults)


# --- Full completeness: all three scarcity inputs present -----------------------------------


class TestFullCompleteness:
    def test_all_three_present_yields_full_completeness_label(self):
        row = _core_row()
        result = compute_arbitrage_score(row)
        assert result.scarcity_data_completeness == "full"

    def test_weighted_0_6_0_2_0_2_composite(self):
        row = _core_row()
        result = compute_arbitrage_score(row)
        expected = (
            0.6 * row.scarcity_score
            + 0.2 * _salary_sub(row.salary_premium_pct)
            + 0.2 * _days_sub(row.median_days_open)
        )
        assert result.scarcity_index == pytest.approx(expected)


# --- Missing salary_premium_pct: renormalize to 0.75/0.25, never zero-substitute -------------


class TestMissingSalaryPremium:
    def test_completeness_label(self):
        row = _core_row(salary_premium_pct=None)
        result = compute_arbitrage_score(row)
        assert result.scarcity_data_completeness == "missing_salary_premium"

    def test_weights_renormalize_to_75_25_not_zero_substituted(self):
        row = _core_row(salary_premium_pct=None)
        result = compute_arbitrage_score(row)
        expected = 0.75 * row.scarcity_score + 0.25 * _days_sub(row.median_days_open)
        assert result.scarcity_index == pytest.approx(expected)
        # Guard against the wrong-but-tempting shortcut of substituting 0 for the missing
        # component while keeping the original 0.6/0.2/0.2 weights — must NOT match that.
        zero_substituted = (
            0.6 * row.scarcity_score + 0.2 * 0.0 + 0.2 * _days_sub(row.median_days_open)
        )
        assert result.scarcity_index != pytest.approx(zero_substituted)


# --- Missing median_days_open: renormalize to 0.75/0.25, never zero-substitute ---------------


class TestMissingDaysOpen:
    def test_completeness_label(self):
        row = _core_row(median_days_open=None)
        result = compute_arbitrage_score(row)
        assert result.scarcity_data_completeness == "missing_days_open"

    def test_weights_renormalize_to_75_25_not_zero_substituted(self):
        row = _core_row(median_days_open=None)
        result = compute_arbitrage_score(row)
        expected = 0.75 * row.scarcity_score + 0.25 * _salary_sub(row.salary_premium_pct)
        assert result.scarcity_index == pytest.approx(expected)
        zero_substituted = (
            0.6 * row.scarcity_score + 0.2 * _salary_sub(row.salary_premium_pct) + 0.2 * 0.0
        )
        assert result.scarcity_index != pytest.approx(zero_substituted)


# --- Both missing: scarcity_index falls back to scarcity_score exactly ----------------------


class TestMissingBoth:
    def test_completeness_label_using_real_ai_coding_tools_sample(self):
        # Real sample from data/schema-notes.md: D1's "AI Coding Tools" row
        # (2026-07-12,ai,AI Coding Tools,32,1.3,,,0.0,0.0) has BOTH median_days_open and
        # salary_premium_pct empty in the source CSV.
        row = _core_row(
            skill_key="ai coding tools",
            skill_name="AI Coding Tools",
            d1_demand_count=32,
            d1_demand_pct=1.3,
            median_days_open=None,
            salary_premium_pct=None,
            repost_rate_pct=0.0,
            scarcity_score=0.0,
        )
        result = compute_arbitrage_score(row)
        assert result.scarcity_data_completeness == "missing_both"

    def test_scarcity_index_equals_scarcity_score_exactly(self):
        row = _core_row(median_days_open=None, salary_premium_pct=None, scarcity_score=72.0)
        result = compute_arbitrage_score(row)
        assert result.scarcity_index == pytest.approx(72.0)
        assert result.scarcity_index == pytest.approx(row.scarcity_score)


# --- median_days_open cap (60 days) -----------------------------------------------------------


class TestDaysOpenCap:
    def test_above_cap_is_clipped_sub_component_never_exceeds_100(self):
        row = _core_row(median_days_open=90.0)  # above the 60-day cap
        result = compute_arbitrage_score(row)
        expected = (
            0.6 * row.scarcity_score
            + 0.2 * _salary_sub(row.salary_premium_pct)
            + 0.2 * 100.0
        )
        assert result.scarcity_index == pytest.approx(expected)
        # Prove it's actually clipped, not the raw over-cap rescale (90 / 60 * 100 == 150.0,
        # which would push the sub-component above 100 — forbidden by the SPEC).
        uncapped = (
            0.6 * row.scarcity_score
            + 0.2 * _salary_sub(row.salary_premium_pct)
            + 0.2 * (90.0 / 60.0 * 100.0)
        )
        assert result.scarcity_index != pytest.approx(uncapped)


# --- salary_premium_pct cap (100) --------------------------------------------------------------


class TestSalaryPremiumCap:
    def test_above_100_is_clipped_to_100_sub_component(self):
        row = _core_row(salary_premium_pct=150.0)
        result = compute_arbitrage_score(row)
        expected = 0.6 * row.scarcity_score + 0.2 * 100.0 + 0.2 * _days_sub(row.median_days_open)
        assert result.scarcity_index == pytest.approx(expected)
        uncapped = (
            0.6 * row.scarcity_score + 0.2 * 150.0 + 0.2 * _days_sub(row.median_days_open)
        )
        assert result.scarcity_index != pytest.approx(uncapped)


# --- demand_score source: d2_demand_pct only, d1_demand_pct never blended -------------------


class TestDemandScoreSource:
    def test_demand_score_equals_d2_demand_pct_verbatim(self):
        row = _core_row(d1_demand_pct=4.7, d2_demand_pct=4.1)
        result = compute_arbitrage_score(row)
        assert result.demand_score == pytest.approx(row.d2_demand_pct)

    def test_d1_demand_pct_is_never_read_or_blended_in(self):
        # Two rows identical except d1_demand_pct — an extreme outlier value that would visibly
        # shift any average/blend — must produce byte-identical demand_score.
        row_normal_d1 = _core_row(d1_demand_pct=4.7, d2_demand_pct=10.0)
        row_outlier_d1 = _core_row(d1_demand_pct=999.9, d2_demand_pct=10.0)
        result_normal = compute_arbitrage_score(row_normal_d1)
        result_outlier = compute_arbitrage_score(row_outlier_d1)
        assert result_normal.demand_score == pytest.approx(result_outlier.demand_score)
        assert result_normal.demand_score == pytest.approx(10.0)
        # Regression guard against "just average them": (4.7 + 10.0) / 2 != 10.0.
        naive_average = (row_normal_d1.d1_demand_pct + row_normal_d1.d2_demand_pct) / 2
        assert result_normal.demand_score != pytest.approx(naive_average)


# --- arbitrage_score = demand_score * scarcity_index, plus basic contract shape --------------


class TestArbitrageScoreFormula:
    def test_arbitrage_score_is_demand_times_scarcity_index(self):
        row = _core_row()
        result = compute_arbitrage_score(row)
        assert result.arbitrage_score == pytest.approx(
            result.demand_score * result.scarcity_index
        )

    def test_skill_key_passes_through_verbatim(self):
        row = _core_row(skill_key="a b testing")
        result = compute_arbitrage_score(row)
        assert result.skill_key == "a b testing"

    def test_output_is_arbitragescorerow_instance(self):
        result = compute_arbitrage_score(_core_row())
        assert isinstance(result, ArbitrageScoreRow)


# --- D3 badge fields never affect the score ---------------------------------------------------


class TestD3FieldsNeverAffectScore:
    def test_identical_rows_differing_only_in_d3_fields_score_identically(self):
        row_uncorroborated = _core_row(
            d3_corroborated=False,
            d3_postings_with_skill=None,
            d3_pct_of_all_postings=None,
        )
        row_corroborated = _core_row(
            d3_corroborated=True,
            d3_postings_with_skill=40549,
            d3_pct_of_all_postings=11.25,
        )
        result_uncorroborated = compute_arbitrage_score(row_uncorroborated)
        result_corroborated = compute_arbitrage_score(row_corroborated)
        assert result_uncorroborated.demand_score == pytest.approx(
            result_corroborated.demand_score
        )
        assert result_uncorroborated.scarcity_index == pytest.approx(
            result_corroborated.scarcity_index
        )
        assert result_uncorroborated.arbitrage_score == pytest.approx(
            result_corroborated.arbitrage_score
        )


# --- Determinism (Bounded-AI invariant: no LLM, no hidden state, reproducible) ---------------


class TestDeterminism:
    def test_same_input_row_yields_identical_output_across_repeated_calls(self):
        row = _core_row()
        first = compute_arbitrage_score(row)
        second = compute_arbitrage_score(row)
        assert dataclasses.asdict(first) == dataclasses.asdict(second)

    def test_input_row_is_not_mutated(self):
        row = _core_row()
        before = dataclasses.asdict(row)
        compute_arbitrage_score(row)
        assert dataclasses.asdict(row) == before


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
