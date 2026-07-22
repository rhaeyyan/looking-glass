"""D3 three-way corroboration badge — Task 4 of specs/001-ingest-pipeline.md.

D3's overall-skills CSV is a *corroboration badge* ("confirmed across 360k postings"), never a
hard-join requirement: it flags which of the 141-skill core also shows up in D3, without ever
dropping or reordering a core row.
"""

import dataclasses

from src.ingest.join_core import SkillCoreRow
from src.ingest.normalize import normalize_skill
from src.ingest.parse import D3OverallRow


def corroborate(
    core_rows: list[SkillCoreRow], d3_overall_rows: list[D3OverallRow]
) -> list[SkillCoreRow]:
    """Flag every core row whose skill_key matches a D3 overall-skills row (via normalize_skill).

    Never drops or reorders core_rows: output has exactly len(core_rows) rows, same skills, same
    order. Matched rows get d3_corroborated=True plus both d3 count/pct fields populated;
    unmatched rows keep d3_corroborated=False and both d3 fields None.
    """
    d3_by_key = {normalize_skill(row.skill): row for row in d3_overall_rows}

    result: list[SkillCoreRow] = []
    for row in core_rows:
        d3_match = d3_by_key.get(row.skill_key)
        if d3_match is None:
            result.append(row)
            continue
        result.append(
            dataclasses.replace(
                row,
                d3_corroborated=True,
                d3_postings_with_skill=d3_match.postings_with_skill,
                d3_pct_of_all_postings=d3_match.pct_of_all_postings,
            )
        )

    return result
