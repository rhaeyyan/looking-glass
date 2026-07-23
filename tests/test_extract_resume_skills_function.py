"""Characterization tests for `supabase/functions/extract-resume-skills/index.ts` — Task 2 of
specs/004-resume-gap-layer.md, written after the SPIKE skeleton per the SPIKE path.

Task 2's [SPEC] prose in specs/004-resume-gap-layer.md still describes the *original*
Claude-based implementation (`ANTHROPIC_API_KEY`, an `sk-ant-...` literal check, an
`x-api-key` header). That text is stale: Task 1 was amended (same spec file, "Task 1
(amended)" section) to re-point the function at OpenRouter's OpenAI-compatible Chat
Completions API before this test was written/re-executed. Per that amendment's explicit
"Out of scope / follow-ups" note, this file asserts against the CURRENT, deployed contract:

  - `Deno.env.get('OPENROUTER_API_KEY')` (not `ANTHROPIC_API_KEY`)
  - `Authorization: Bearer <apiKey>` (not `x-api-key`)
  - `https://openrouter.ai/api/v1/chat/completions`
  - `google/gemma-4-31b-it:free`
  - OpenAI-style `tools`/`tool_choice` request shape and
    `choices[0].message.tool_calls[0].function.arguments` (a JSON string, `JSON.parse`'d
    inside its own try/catch) response shape

This suite never calls the deployed function and never reads a live secret (Security /
Zero-Trust, AGENTS.md's security-isolation gate): it only reads the function's source as
plain text and applies regex/structural assertions, the same style as
`tests/test_frontend_read_layer_migration.py` (spec 003, Task 1). No `OPENROUTER_API_KEY`/
`SUPABASE_*` credential is required or read anywhere in this file.

Why this is worth locking with a test rather than trusting manual review (this task's
[SPEC] "Intellectual Control"): the security-critical invariants here (secret sourced from
`Deno.env`, never a hardcoded/client-visible key; no logging of resume content; no DB
write; the function stays stateless) are exactly the kind of thing a future edit could
silently regress (e.g. reverting to a literal header value, or adding a debug `console.log`
of the request body) without a human noticing in review.
"""

import re
from pathlib import Path

import pytest

FUNCTION_PATH = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "functions"
    / "extract-resume-skills"
    / "index.ts"
)


@pytest.fixture(scope="module")
def source() -> str:
    return FUNCTION_PATH.read_text()


class TestFileExists:
    def test_function_source_exists(self):
        assert FUNCTION_PATH.is_file(), (
            f"{FUNCTION_PATH} does not exist — the edge function has not been built yet."
        )


class TestSecretSourcing:
    """The API key must always be sourced from Deno.env.get('OPENROUTER_API_KEY'), never
    hardcoded, and never the stale Anthropic secret name."""

    def test_reads_openrouter_api_key_from_deno_env(self, source):
        assert "Deno.env.get('OPENROUTER_API_KEY')" in source, (
            "Expected the current (post-amendment) secret name OPENROUTER_API_KEY sourced "
            "via Deno.env.get(...)."
        )

    def test_does_not_reference_stale_anthropic_secret_name(self, source):
        assert "ANTHROPIC_API_KEY" not in source, (
            "Found a reference to the stale ANTHROPIC_API_KEY secret name — the function "
            "should have been fully migrated to OPENROUTER_API_KEY by the Task 1 amendment."
        )

    def test_no_hardcoded_long_secret_like_literal(self, source):
        """No long base64/hex-ish string literal assigned to anything resembling an
        api-key/secret/token variable or constant. Generic because OpenRouter keys have no
        single fixed public prefix to convention-check (unlike Anthropic's sk-ant-...)."""
        suspicious_assignment = re.compile(
            r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{20,}['\"]"
        )
        matches = suspicious_assignment.findall(source)
        assert not matches, (
            f"Found what looks like a hardcoded secret literal assigned to a "
            f"key/secret/token-named binding: {matches}"
        )

    def test_authorization_header_never_a_literal_secret_string(self, source):
        """The Authorization header value must always flow through the apiKey parameter,
        never a literal string (which would indicate either a hardcoded secret or a stale
        reversion toward some other literal shape)."""
        # Any Authorization: '<literal, non-template, non-variable string>' assignment is
        # suspicious. The real implementation uses a template literal referencing apiKey.
        literal_auth_header = re.compile(r"Authorization\s*:\s*['\"](?!\$\{)[^'\"]*['\"]")
        assert not literal_auth_header.search(source), (
            "Authorization header appears to be a string literal rather than built from "
            "the apiKey parameter."
        )

    def test_authorization_header_built_from_api_key_param(self, source):
        assert re.search(r"Authorization\s*:\s*`Bearer \$\{apiKey\}`", source), (
            "Expected the Authorization header to be built as `Bearer ${apiKey}` (template "
            "literal referencing the apiKey parameter sourced from Deno.env.get(...))."
        )

    def test_no_stale_x_api_key_header(self, source):
        """The old Anthropic-shaped 'x-api-key' header must not have reappeared — that would
        indicate a stale reversion away from the OpenRouter Bearer-auth shape."""
        assert "x-api-key" not in source, (
            "Found a stale 'x-api-key' header — this is the old Anthropic auth shape; the "
            "current implementation must use 'Authorization: Bearer <apiKey>'."
        )

    def test_no_bearer_sk_literal_secret_shaped_string(self, source):
        """Generic negative check for any hardcoded 'Bearer sk-...'-shaped literal anywhere
        outside of a template-literal reference to apiKey."""
        assert not re.search(r"Bearer\s+sk-[A-Za-z0-9_\-]+", source), (
            "Found a hardcoded 'Bearer sk-...' literal — API keys must only ever flow "
            "through the apiKey parameter sourced from Deno.env.get(...)."
        )


class TestOpenRouterUpstreamShape:
    """Structural assertions confirming the upstream call actually targets OpenRouter's
    OpenAI-compatible endpoint/model/response-parsing shape, not the old Anthropic one."""

    def test_targets_openrouter_endpoint(self, source):
        assert "https://openrouter.ai/api/v1/chat/completions" in source

    def test_does_not_target_anthropic_endpoint(self, source):
        assert "api.anthropic.com" not in source

    def test_uses_expected_model(self, source):
        assert "google/gemma-4-31b-it:free" in source

    def test_uses_openai_style_tool_choice_shape(self, source):
        assert re.search(r"tool_choice\s*:\s*\{\s*type\s*:\s*['\"]function['\"]", source), (
            "Expected OpenAI-compatible tool_choice: { type: 'function', function: { name: ... } }"
        )

    def test_parses_tool_call_arguments_string(self, source):
        assert re.search(
            r"choices\??\.\[0\]\?\.message\?\.tool_calls\?\.\[0\]\s*\??\.function\?\.arguments",
            source,
        ), "Expected the response walk to read choices[0].message.tool_calls[0].function.arguments"

    def test_json_parses_arguments_in_its_own_try_catch(self, source):
        # The arguments value is a JSON *string* and must be JSON.parse'd defensively.
        assert "JSON.parse(rawArguments)" in source
        # It must be inside a try/catch that maps failure to the unparseable error, distinct
        # from a generic unhandled exception.
        parse_block = re.search(
            r"try\s*\{[^}]*JSON\.parse\(rawArguments\)[^}]*\}\s*catch[^{]*\{[^}]*"
            r"upstream_response_unparseable[^}]*\}",
            source,
            re.DOTALL,
        )
        assert parse_block, (
            "Expected JSON.parse(rawArguments) wrapped in its own try/catch that throws "
            "'upstream_response_unparseable' on failure."
        )

    def test_defensive_array_of_strings_shape_check_present(self, source):
        assert re.search(r"Array\.isArray\(skills\)\s*&&\s*!?skills\.every", source) or re.search(
            r"!Array\.isArray\(skills\)\s*\|\|\s*!skills\.every", source
        ), (
            "Expected the defensive Array.isArray(skills) && skills.every(... typeof "
            "skill === 'string') shape check before returning skills."
        )

    def test_handles_missing_tool_calls_without_crashing(self, source):
        """A response with no tool_calls array at all (model replied with plain text) must
        be handled by the same defensive check — asserted here via the optional-chaining walk
        (?. all the way down) rather than a direct index into an assumed-present array."""
        assert "tool_calls?.[0]" in source, (
            "Expected optional chaining through tool_calls so a missing/empty tool_calls "
            "array does not throw an unhandled exception."
        )


class TestNoResumeContentLogging:
    """No console.log/console.error/console.info call may include resumeText or the raw
    request/response body — Zero-Trust: resume content is PII-adjacent and must never be
    logged."""

    def test_no_console_log_of_resume_text_or_raw_body(self, source):
        console_calls = re.findall(r"console\.(?:log|error|info|warn|debug)\([^)]*\)", source)
        forbidden_terms = ("resumeText", "rawArguments", "parsedArguments", "response.json")
        offenders = [
            call for call in console_calls if any(term in call for term in forbidden_terms)
        ]
        assert not offenders, f"Found console logging of resume/request content: {offenders}"

    def test_no_console_calls_at_all(self, source):
        """Stronger check matching the observed skeleton: it contains zero console.* calls,
        so there is nothing to log resume content into in the first place."""
        assert not re.search(r"console\.(log|error|info|warn|debug)\(", source), (
            "Expected no console.* logging calls anywhere in the function (observed "
            "skeleton has none); a new one appearing is a regression risk for resume-content "
            "leakage."
        )


class TestStatelessness:
    """The function must never write to Supabase — it is a stateless proxy."""

    def test_no_supabase_client_import(self, source):
        assert "supabase-js" not in source
        assert not re.search(r"from\s+['\"]@supabase/", source)

    def test_no_insert_upsert_update_calls(self, source):
        for method in (".insert(", ".upsert(", ".update("):
            assert method not in source, f"Found a forbidden write call: {method}"


class TestInputValidation:
    def test_max_length_check_exists_before_upstream_call(self, source):
        max_len_check = source.find("resumeText.length > MAX_RESUME_LENGTH")
        upstream_call = source.find("callOpenRouter(resumeText, apiKey)")
        assert max_len_check != -1, "Expected a max-length check on resumeText."
        assert upstream_call != -1, "Expected a call to callOpenRouter(...)."
        assert max_len_check < upstream_call, (
            "The max-length check on resumeText must occur before the upstream call."
        )

    def test_empty_or_whitespace_resume_rejected_before_call(self, source):
        assert "resumeText.trim().length === 0" in source
        empty_check = source.find("resumeText.trim().length === 0")
        upstream_call = source.find("callOpenRouter(resumeText, apiKey)")
        assert 0 <= empty_check < upstream_call


class TestCorsNotWildcard:
    def test_cors_allow_origin_not_literal_wildcard(self, source):
        assert "'Access-Control-Allow-Origin': '*'" not in source
        assert '"Access-Control-Allow-Origin": "*"' not in source

    def test_no_bare_wildcard_cors_string_anywhere(self, source):
        assert not re.search(r"Allow-Origin['\"]?\s*[:=]\s*['\"]\*['\"]", source)


class TestGenericUpstreamErrorNeverForwarded:
    def test_502_error_message_is_generic(self, source):
        assert "'extraction_failed'" in source

    def test_raw_upstream_text_not_forwarded_in_error_response(self, source):
        # The catch block that maps to extraction_failed must not interpolate any upstream
        # error text into the response body.
        catch_block = re.search(r"catch\s*\{[^}]*extraction_failed[^}]*\}", source, re.DOTALL)
        assert catch_block, "Expected a catch block mapping any thrown error to extraction_failed."
        assert "${" not in catch_block.group(0), (
            "The generic error catch block must not interpolate upstream error details."
        )
