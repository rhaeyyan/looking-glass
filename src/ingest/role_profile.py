"""D3 per-role skill-profile table — Task 4 of specs/001-ingest-pipeline.md.

Builds the 450-row (15 roles x 30 skills) role-profile table straight from D3's by-role CSV,
1:1 — every input row survives, even role-skills (e.g. soft skills like "communication") that
have no match in the 141-skill core. Membership in core_rows is a downstream (MVP step 4)
concern, never a gate here.
"""

from dataclasses import dataclass

from src.ingest.join_core import SkillCoreRow
from src.ingest.normalize import normalize_skill
from src.ingest.parse import D3RoleRow


@dataclass
class RoleProfileRow:
    role_family: str
    skill_name_raw: str
    skill_key: str
    postings_with_skill: int
    pct_of_role: float
    role_postings: int


def build_role_profiles(
    d3_role_rows: list[D3RoleRow], core_rows: list[SkillCoreRow]
) -> list[RoleProfileRow]:
    """Return one RoleProfileRow per input D3RoleRow, 1:1 — never dropped, never merged.

    skill_key is always normalize_skill(skill_name_raw), whether or not it resolves against
    core_rows. core_rows is accepted for callers that want to spot-check/log unmatched keys,
    but it never gates whether a row appears in the output.
    """
    return [
        RoleProfileRow(
            role_family=role_row.role_family,
            skill_name_raw=role_row.skill,
            skill_key=normalize_skill(role_row.skill),
            postings_with_skill=role_row.postings_with_skill,
            pct_of_role=role_row.pct_of_role,
            role_postings=role_row.role_postings,
        )
        for role_row in d3_role_rows
    ]
