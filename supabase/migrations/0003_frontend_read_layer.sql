-- Task 2 of specs/003-role-picker-matrix.md: the anon-key frontend read layer.
--
-- Applied via the Supabase CLI (supabase db push / migration up) — never through the Python
-- client. This migration is pure DDL: RLS policies plus a new read-side join view. No data
-- loading or scoring logic lives here.
--
-- Decision 2 of specs/003-role-picker-matrix.md: the frontend talks to Supabase directly with
-- the public anon key (no app-server tier). RLS is therefore the real security boundary — every
-- table the frontend reads must have an explicit, narrow SELECT-only policy, and every view must
-- run with `security_invoker = true` so it enforces the *querying* role's RLS instead of quietly
-- running as its owner (see tests/test_frontend_read_layer_migration.py, the source of truth for
-- this file).

ALTER TABLE skills_core ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_role_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_arbitrage_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_skills_core"
    ON skills_core
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "anon_select_skill_role_profile"
    ON skill_role_profile
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "anon_select_skill_arbitrage_scores"
    ON skill_arbitrage_scores
    FOR SELECT
    TO anon
    USING (true);

-- Retrofit the pre-existing view (Task 6 of specs/002-arbitrage-score.md) against the
-- owner-bypass footgun: without this, arbitrage_scores would run as its owner and silently
-- bypass RLS for any anon-key caller.
ALTER VIEW arbitrage_scores SET (security_invoker = true);

-- New read-only join view for the role-picker matrix. LEFT JOIN (not INNER) so a role skill
-- with no D1/D2 arbitrage-score match still surfaces as "demand only" — the gap-correctness
-- invariant from AGENTS.md/Cypress's brief.
CREATE VIEW role_skill_arbitrage
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
            arbitrage_scores.d3_pct_of_all_postings
        FROM skill_role_profile
        LEFT JOIN arbitrage_scores ON arbitrage_scores.skill_key = skill_role_profile.skill_key;
