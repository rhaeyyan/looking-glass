"""D1+D2 grain-collapse join — Task 4 of specs/001-ingest-pipeline.md.

D1's grain is (snapshot_date, category, skill_name); D2's grain is (category, skill). Both
must collapse to one row per skill before either dataset is usable for scoring. This module
performs that collapse plus the inner join, deterministically:

    group a skill's source rows -> pick the single row whose count field (d1_demand_count /
    d2_listing_count) is the overall max across ALL of that skill's rows (ties broken
    alphabetically by category) -> take every scalar field verbatim from that one winning row.

No per-category sum/average — see this module's Intellectual Control note in the SPEC:
auditable "one real source row per output row" beats a statistically blended but opaque figure.

d1_primary_category and d2_primary_category are resolved independently of one another (each is
its own argmax over its own dataset's rows for that skill) and may legitimately differ.
"""

from dataclasses import dataclass
from typing import TypeVar

from src.ingest.normalize import normalize_skill
from src.ingest.parse import D1Row, D2Row


@dataclass
class SkillCoreRow:
    skill_key: str
    skill_name: str
    skill_group: str | None
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


_Row = TypeVar("_Row")


def _dominant_row(rows: list[_Row], count_field: str, category_field: str) -> _Row:
    """Return the row with the max `count_field` across `rows`, ties broken alphabetically
    by `category_field`.

    Traceable-and-auditable: the winner is always one real source row, never a blend.
    """
    return sorted(
        rows,
        key=lambda r: (-getattr(r, count_field), getattr(r, category_field)),
    )[0]


def build_skill_core(d1_rows: list[D1Row], d2_rows: list[D2Row]) -> list[SkillCoreRow]:
    """Collapse D1's and D2's (snapshot_date x category) grain to one row per skill.

    Inner join on skill name (via skill_key): only skills present in both d1_rows and
    d2_rows survive. See this module's docstring for the dominant-category rule.
    """
    d1_by_key: dict[str, list[D1Row]] = {}
    for row in d1_rows:
        d1_by_key.setdefault(normalize_skill(row.skill_name), []).append(row)

    d2_by_key: dict[str, list[D2Row]] = {}
    for row in d2_rows:
        d2_by_key.setdefault(normalize_skill(row.skill), []).append(row)

    shared_keys = sorted(set(d1_by_key) & set(d2_by_key))

    core_rows: list[SkillCoreRow] = []
    for skill_key in shared_keys:
        d1_group = d1_by_key[skill_key]
        d2_group = d2_by_key[skill_key]

        d1_winner = _dominant_row(d1_group, "demand_count", "category")
        d2_winner = _dominant_row(d2_group, "listing_count", "category")

        core_rows.append(
            SkillCoreRow(
                skill_key=skill_key,
                skill_name=d1_winner.skill_name,
                skill_group=d2_winner.skill_group,
                d1_primary_category=d1_winner.category,
                d2_primary_category=d2_winner.category,
                d1_demand_count=d1_winner.demand_count,
                d1_demand_pct=d1_winner.demand_pct,
                median_days_open=d1_winner.median_days_open,
                salary_premium_pct=d1_winner.salary_premium_pct,
                repost_rate_pct=d1_winner.repost_rate_pct,
                scarcity_score=d1_winner.scarcity_score,
                d2_listing_count=d2_winner.listing_count,
                d2_total_listings=d2_winner.total_listings,
                d2_demand_pct=d2_winner.demand_pct,
                d2_required_count=d2_winner.required_count,
            )
        )

    return core_rows
