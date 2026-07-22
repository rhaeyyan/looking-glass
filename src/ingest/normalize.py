"""Deterministic skill-name normalization for the D1/D2/D3 join key.

Rule (measured against real data, see data/schema-notes.md's "Join test results" section):
lowercase, collapse whitespace / `/` / `-` / `_` to a single space, but KEEP `#`, `+`, `.`
intact — so `C#` != `C++` != `C`.

Scope note: this is case-fold + separator-collapse only. No alias/acronym-expansion table
(e.g. "Amazon Web Services" -> "aws") — the real D1/D2/D3 data has no such variants, and
Cedar is the sole authority for expanding this scope (see specs/001-ingest-pipeline.md, Task 1).
"""

import re

# Whitespace, `/`, `-`, `_` are equivalent separators; runs of any mix collapse to one space.
# `#`, `+`, `.` are deliberately excluded — they must survive verbatim.
_SEPARATOR_RUN_RE = re.compile(r"[\s/_-]+")


def normalize_skill(name: str) -> str:
    """Fold `name` to a stable, case-insensitive join key.

    Deterministic and idempotent: normalize_skill(normalize_skill(x)) == normalize_skill(x).
    """
    lowered = name.lower()
    collapsed = _SEPARATOR_RUN_RE.sub(" ", lowered)
    return collapsed.strip()
