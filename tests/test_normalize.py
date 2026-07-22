"""Failing tests (RED phase) for `normalize_skill` — Task 1 of specs/001-ingest-pipeline.md.

`src/ingest/normalize.py` does not exist yet (that's Task 2, Redwood). Importing it here is
expected to raise ModuleNotFoundError until Task 2 lands. These tests define the contract
Redwood's implementation must satisfy.

Normalization rule under test (per data/schema-notes.md's "Join test results" section, the
ground truth Birch measured against the real D1/D2/D3 CSVs):

    lowercase, collapse whitespace / `/` / `-` / `_` to a single space, but KEEP `#`, `+`, `.`
    intact — so `C#` != `C++` != `C`.

Scope note (deliberate, do not expand without a Cedar SPEC update): schema-notes.md explicitly
found *zero* full-name-vs-acronym variants (e.g. "Amazon Web Services" vs "AWS") in the actual
D1/D2/D3 data — the only real-world normalization need is case-folding + separator-collapse.
Task 1's SPEC edge cases list does not include alias-table/fuzzy matching, and Cedar is the sole
authority for expanding that scope. `test_no_alias_table_expansion` below locks in and documents
that boundary so a future implementer doesn't silently bolt on fuzzy matching (which risks false
merges) without going back through Cedar.
"""

import pytest

from src.ingest.normalize import normalize_skill


class TestDistinctPunctuationVariants:
    """C#, C++, C must resolve to three distinct normalized keys.

    This is the highest-risk case: naively stripping/replacing `#` and `+` collapses all three
    to the token "c", silently corrupting the D1/D2 join (per schema-notes.md's explicit
    "naive normalization gotcha" callout).
    """

    def test_c_sharp_c_plus_plus_c_are_pairwise_distinct(self):
        c_sharp = normalize_skill("C#")
        c_plus_plus = normalize_skill("C++")
        c_plain = normalize_skill("C")

        assert c_sharp != c_plus_plus
        assert c_sharp != c_plain
        assert c_plus_plus != c_plain

    def test_c_sharp_preserves_hash_character(self):
        assert "#" in normalize_skill("C#")

    def test_c_plus_plus_preserves_plus_characters(self):
        assert normalize_skill("C++").count("+") == 2

    def test_c_sharp_is_stable_regardless_of_case(self):
        # Case-folding still applies to the letter, just not to the trailing punctuation.
        assert normalize_skill("C#") == normalize_skill("c#")


class TestCrossSourceCaseFold:
    """D1 and D3 spell the same skill with different casing/whitespace; normalization must
    fold them to the same key so the corroboration join (D1 ∩ D2 ∩ D3) works.
    """

    def test_ci_cd_matches_across_d1_and_d3_spelling(self):
        # D1 sample (data/schema-notes.md): "CI/CD"
        # D3 sample (data/schema-notes.md "Join test results"): "ci/cd"
        assert normalize_skill("CI/CD") == normalize_skill("ci/cd")

    def test_aws_matches_across_d1_and_d3_spelling(self):
        # D1: "AWS" (data/schema-notes.md D1 sample table implies AWS category=data row family;
        # explicitly named in the "Join test results" section as D1 `AWS` vs D3 `aws`).
        assert normalize_skill("AWS") == normalize_skill("aws")

    def test_angular_matches_across_d1_and_d3_spelling(self):
        # Also explicitly named in schema-notes.md's join-results section.
        assert normalize_skill("Angular") == normalize_skill("angular")


class TestSeparatorCollapse:
    """Whitespace, `/`, `-`, `_` all collapse to a single space; repeated separators collapse
    to exactly one space (no leading/trailing/double spaces leaking into the key).
    """

    def test_internal_slash_becomes_space(self):
        # D1 sample row: "A/B Testing"
        assert normalize_skill("A/B Testing") == normalize_skill("A B Testing")

    def test_hyphen_and_space_are_equivalent_separators(self):
        # "scikit-learn" appears verbatim in the real D1 CSV; hyphen must collapse like a space.
        assert normalize_skill("scikit-learn") == normalize_skill("scikit learn")

    def test_underscore_and_space_are_equivalent_separators(self):
        assert normalize_skill("full_stack") == normalize_skill("full stack")

    def test_repeated_separators_collapse_to_single_space(self):
        assert normalize_skill("A/B   Testing") == normalize_skill("A B Testing")

    def test_leading_and_trailing_whitespace_is_stripped(self):
        assert normalize_skill("  Python  ") == normalize_skill("Python")

    def test_no_double_spaces_in_output(self):
        assert "  " not in normalize_skill("A/B   Testing")


class TestPunctuationPreserved:
    """`.` (and `#`, `+`) must NOT be treated as a separator — collapsing it would create
    false merges (e.g. "Node.js" vs "Node js" are conceptually the same skill spelled once with
    the dot; the rule is simply: don't strip it, don't collapse it away).
    """

    def test_dot_is_preserved_not_stripped(self):
        assert "." in normalize_skill("Node.js")

    def test_dot_is_not_treated_as_a_separator(self):
        # If `.` were collapsed to a space like `/`/`-`/`_`, this would equal normalize_skill
        # of "Node js" (two tokens). It must not.
        assert normalize_skill("Node.js") != normalize_skill("Node js")


class TestNoUnauthorizedAliasExpansion:
    """Locks in current, Cedar-approved scope: case-fold + separator-collapse only.

    data/schema-notes.md found no acronym/full-name variant (e.g. "AWS" vs "Amazon Web
    Services") anywhere in the real D1/D2/D3 data, and Task 1's SPEC edge cases do not
    require alias-table resolution. This test documents that boundary so it isn't silently
    widened (risking false merges) without a Cedar SPEC update.
    """

    def test_full_name_does_not_silently_merge_with_acronym(self):
        assert normalize_skill("Amazon Web Services") != normalize_skill("aws")


class TestReturnTypeAndStability:
    def test_returns_a_string(self):
        assert isinstance(normalize_skill("Python"), str)

    def test_is_idempotent(self):
        once = normalize_skill("CI/CD")
        twice = normalize_skill(once)
        assert once == twice

    def test_is_deterministic_across_repeated_calls(self):
        # Guards the Determinism invariant — same input, same output, every time.
        results = {normalize_skill("AI Agents") for _ in range(10)}
        assert len(results) == 1


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
