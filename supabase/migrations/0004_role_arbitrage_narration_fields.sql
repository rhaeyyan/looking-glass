-- Task 2 of specs/005-template-narrator.md: expose two already-computed narration fields.
--
-- Applied via the Supabase CLI (supabase db push / migration up) — never through the Python
-- client. This migration is pure DDL: it appends two existing `skills_core`-origin columns
-- (already flowing into `arbitrage_scores` since spec 002) to the `role_skill_arbitrage` view.
-- Zero new computation, zero new joins — the same LEFT JOIN from
-- supabase/migrations/0003_frontend_read_layer.sql, unchanged.
--
-- `CREATE OR REPLACE VIEW` requires the new columns to be appended at the END of the existing
-- SELECT list (Postgres will refuse an in-place column reorder/removal), so
-- `salary_premium_pct, median_days_open` are added last, in that order, and every pre-existing
-- column keeps its original position. `WITH (security_invoker = true)` is repeated verbatim so
-- the replace does not silently reintroduce the owner-bypass RLS footgun
-- (see tests/test_frontend_read_layer_migration.py, the source of truth for this file).

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
            arbitrage_scores.median_days_open
        FROM skill_role_profile
        LEFT JOIN arbitrage_scores ON arbitrage_scores.skill_key = skill_role_profile.skill_key;
