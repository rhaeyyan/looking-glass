"""Deterministic Arbitrage Score formula — Task 2 of specs/002-arbitrage-score.md.

Turns one already-joined `SkillCoreRow` into one `ArbitrageScoreRow`: demand, scarcity, and
the blended arbitrage score. Pure, single-row-only — no dataset-wide statistics (min/max/mean
across other rows) are ever computed, so any one row's score is independently reproducible and
auditable without needing the rest of the dataset. See tests/test_arbitrage_score.py for the
exact contract this module satisfies.
"""

from dataclasses import dataclass

from src.ingest.join_core import SkillCoreRow

SCARCITY_SCORE_WEIGHT = 0.6
SALARY_PREMIUM_WEIGHT = 0.2
DAYS_OPEN_WEIGHT = 0.2
DAYS_OPEN_CAP = 60.0
SALARY_PREMIUM_CAP = 100.0


@dataclass
class ArbitrageScoreRow:
    skill_key: str
    demand_score: float
    scarcity_index: float
    scarcity_data_completeness: str
    arbitrage_score: float


def compute_arbitrage_score(row: SkillCoreRow) -> ArbitrageScoreRow:
    """Pure, deterministic, single-row-only. demand_score = row.d2_demand_pct verbatim —
    row.d1_demand_pct is never read/blended.

    scarcity_index is a weighted composite of row.scarcity_score (always present, never
    clipped), a salary-premium sub-component (row.salary_premium_pct clipped to
    SALARY_PREMIUM_CAP), and a days-open sub-component (row.median_days_open capped at
    DAYS_OPEN_CAP, rescaled onto a 0-100 range). When a nullable sub-component is missing, its
    term drops out entirely and the remaining weight(s) renormalize proportionally — never
    substituted with zero.
    """
    demand_score = row.d2_demand_pct

    salary_present = row.salary_premium_pct is not None
    days_present = row.median_days_open is not None

    weighted_terms: list[tuple[float, float]] = [(SCARCITY_SCORE_WEIGHT, row.scarcity_score)]
    if salary_present:
        salary_sub = min(row.salary_premium_pct, SALARY_PREMIUM_CAP)
        weighted_terms.append((SALARY_PREMIUM_WEIGHT, salary_sub))
    if days_present:
        days_sub = min(row.median_days_open, DAYS_OPEN_CAP) / DAYS_OPEN_CAP * 100.0
        weighted_terms.append((DAYS_OPEN_WEIGHT, days_sub))

    total_weight = sum(weight for weight, _ in weighted_terms)
    scarcity_index = sum(weight * value for weight, value in weighted_terms) / total_weight

    if salary_present and days_present:
        scarcity_data_completeness = "full"
    elif days_present:
        scarcity_data_completeness = "missing_salary_premium"
    elif salary_present:
        scarcity_data_completeness = "missing_days_open"
    else:
        scarcity_data_completeness = "missing_both"

    return ArbitrageScoreRow(
        skill_key=row.skill_key,
        demand_score=demand_score,
        scarcity_index=scarcity_index,
        scarcity_data_completeness=scarcity_data_completeness,
        arbitrage_score=demand_score * scarcity_index,
    )
