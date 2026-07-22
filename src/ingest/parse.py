"""CSV parsers for Looking Glass's three raw Kaggle datasets (D1, D2, D3).

Each function takes a file-like object (so callers can pass `io.StringIO(csv_text)` in tests
or an open file handle in production) and returns a list of typed dataclass rows, one per CSV
data line. No join/aggregation/normalization logic here — that's Task 3/4's join_core.py and
this package's normalize.py, respectively. Fields are parsed 1:1 from each CSV's real columns
(see data/schema-notes.md); string fields pass through verbatim, unnormalized.
"""

import csv
from dataclasses import dataclass


def _optional_float(value: str) -> float | None:
    """Parse a possibly-empty CSV cell to a float, or None if the cell is empty.

    D1's `median_days_open`/`salary_premium_pct` columns have real empty cells (not "0" or
    "NaN") — those must become None, never 0.0, and never be conflated with a merely-zero
    but present value elsewhere on the same row.
    """
    return float(value) if value != "" else None


@dataclass
class D1Row:
    snapshot_date: str
    category: str
    skill_name: str
    demand_count: int
    demand_pct: float
    median_days_open: float | None
    salary_premium_pct: float | None
    repost_rate_pct: float
    scarcity_score: float


@dataclass
class D2Row:
    snapshot_date: str
    category: str
    skill: str
    skill_group: str
    listing_count: int
    total_listings: int
    demand_pct: float
    required_count: int


@dataclass
class D3OverallRow:
    skill: str
    postings_with_skill: int
    pct_of_all_postings: float


@dataclass
class D3RoleRow:
    role_family: str
    role_postings: int
    skill: str
    postings_with_skill: int
    pct_of_role: float


def parse_d1(fileobj) -> list[D1Row]:
    reader = csv.DictReader(fileobj)
    return [
        D1Row(
            snapshot_date=row["snapshot_date"],
            category=row["category"],
            skill_name=row["skill_name"],
            demand_count=int(row["demand_count"]),
            demand_pct=float(row["demand_pct"]),
            median_days_open=_optional_float(row["median_days_open"]),
            salary_premium_pct=_optional_float(row["salary_premium_pct"]),
            repost_rate_pct=float(row["repost_rate_pct"]),
            scarcity_score=float(row["scarcity_score"]),
        )
        for row in reader
    ]


def parse_d2(fileobj) -> list[D2Row]:
    reader = csv.DictReader(fileobj)
    return [
        D2Row(
            snapshot_date=row["snapshot_date"],
            category=row["category"],
            skill=row["skill"],
            skill_group=row["skill_group"],
            listing_count=int(row["listing_count"]),
            total_listings=int(row["total_listings"]),
            demand_pct=float(row["demand_pct"]),
            required_count=int(row["required_count"]),
        )
        for row in reader
    ]


def parse_d3_overall(fileobj) -> list[D3OverallRow]:
    reader = csv.DictReader(fileobj)
    return [
        D3OverallRow(
            skill=row["skill"],
            postings_with_skill=int(row["postings_with_skill"]),
            pct_of_all_postings=float(row["pct_of_all_postings"]),
        )
        for row in reader
    ]


def parse_d3_by_role(fileobj) -> list[D3RoleRow]:
    reader = csv.DictReader(fileobj)
    return [
        D3RoleRow(
            role_family=row["role_family"],
            role_postings=int(row["role_postings"]),
            skill=row["skill"],
            postings_with_skill=int(row["postings_with_skill"]),
            pct_of_role=float(row["pct_of_role"]),
        )
        for row in reader
    ]
