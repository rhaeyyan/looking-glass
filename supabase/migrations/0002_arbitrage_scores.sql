-- Task 4 of specs/002-arbitrage-score.md: the deterministic Arbitrage Score table + its
-- read-side view.
--
-- Applied via the Supabase CLI (supabase db push / migration up) — never through the Python
-- client. Data loading (src/scoring/load_supabase.py) is a separate concern from this DDL.
--
-- Column-level constraints mirror src/scoring/arbitrage.py::ArbitrageScoreRow exactly (see
-- tests/test_arbitrage_schema.py, the source of truth for this file).
--
-- Unlike skill_role_profile's soft reference to skills_core, skill_key here gets a real,
-- enforced FOREIGN KEY: scoring runs over the full skills_core set, so every skills_core row
-- gets exactly one arbitrage-score row (total coverage, no dangling reference possible).

CREATE TABLE skill_arbitrage_scores (
    skill_key                   text PRIMARY KEY REFERENCES skills_core(skill_key),
    demand_score                double precision NOT NULL,
    scarcity_index              double precision NOT NULL,
    scarcity_data_completeness  text NOT NULL,
    arbitrage_score             double precision NOT NULL
);

CREATE VIEW arbitrage_scores AS
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
        skill_arbitrage_scores.arbitrage_score
    FROM skills_core
    JOIN skill_arbitrage_scores ON skill_arbitrage_scores.skill_key = skills_core.skill_key;
