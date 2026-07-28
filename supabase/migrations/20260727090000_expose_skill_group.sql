-- Task 2 of specs/026-skill-group-breakdown.md: expose `skills_core.skill_group` through the
-- existing view chain — `arbitrage_scores` -> `role_skill_arbitrage`.
--
-- Applied via the Supabase CLI (supabase db push / migration up) — never through the Python
-- client. This migration is pure DDL: it appends one already-loaded `skills_core`-origin column
-- (populated by src/ingest/join_core.py's dominant-D2-row collapse, same algorithm already used
-- for d1_primary_category/d2_primary_category) to both `arbitrage_scores` and
-- `role_skill_arbitrage`. Zero new computation, zero new joins.
--
-- `arbitrage_scores` was previously a plain `CREATE VIEW` retrofitted via a separate
-- `ALTER VIEW arbitrage_scores SET (security_invoker = true);` statement
-- (supabase/migrations/20260722160652_frontend_read_layer.sql). This migration consolidates that
-- into a single `CREATE OR REPLACE VIEW ... WITH (security_invoker = true) AS ...`, preserving
-- every pre-existing column from supabase/migrations/20260722140908_arbitrage_scores.sql and
-- appending `skill_group` last.
--
-- `role_skill_arbitrage` keeps its existing `CREATE OR REPLACE VIEW ... WITH
-- (security_invoker = true)` shape (established by
-- supabase/migrations/20260723122104_role_arbitrage_narration_fields.sql), with `skill_group`
-- appended at the end of its SELECT list too, passed through from `arbitrage_scores.skill_group`
-- — never sourced from `skill_role_profile`, which has no such column.
--
-- `CREATE OR REPLACE VIEW` requires the new column to be appended at the END of each existing
-- SELECT list (Postgres will refuse an in-place column reorder/removal), so every pre-existing
-- column keeps its original position. `WITH (security_invoker = true)` is repeated verbatim on
-- both views so this replace does not silently reintroduce the owner-bypass RLS footgun
-- (see tests/test_frontend_read_layer_migration.py, the source of truth for this file).

CREATE OR REPLACE VIEW arbitrage_scores
    WITH (security_invoker = true)
    AS
        SELECT
            skills_core.skill_key,
            skills_core.d1_demand_pct,
            skills_core.d2_demand_pct,
            skills_core.scarcity_score,
            skills_core.salary_premium_pct,
            skills_core.median_days_open,
            skills_core.d3_corroborated,
            skills_core.d3_pct_of_all_postings,
            skill_arbitrage_scores.demand_score,
            skill_arbitrage_scores.scarcity_index,
            skill_arbitrage_scores.scarcity_data_completeness,
            skill_arbitrage_scores.arbitrage_score,
            skills_core.skill_group
        FROM skills_core
        JOIN skill_arbitrage_scores ON skill_arbitrage_scores.skill_key = skills_core.skill_key;

CREATE OR REPLACE VIEW role_skill_arbitrage
    WITH (security_invoker = true)
    AS
        SELECT
            skill_role_profile.role_family,
            skill_role_profile.skill_name_raw,
            skill_role_profile.skill_key,
            skill_role_profile.pct_of_role,
            skill_role_profile.postings_with_skill,
            arbitrage_scores.demand_score,
            arbitrage_scores.scarcity_index,
            arbitrage_scores.arbitrage_score,
            arbitrage_scores.scarcity_data_completeness,
            arbitrage_scores.d3_corroborated,
            arbitrage_scores.d3_pct_of_all_postings,
            arbitrage_scores.salary_premium_pct,
            arbitrage_scores.median_days_open,
            arbitrage_scores.skill_group
        FROM skill_role_profile
        LEFT JOIN arbitrage_scores ON arbitrage_scores.skill_key = skill_role_profile.skill_key;
