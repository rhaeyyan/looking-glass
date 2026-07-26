-- Task 6 of specs/001-ingest-pipeline.md: initial schema for the 141-skill core and the
-- per-role skill-profile table produced by src/ingest/pipeline.py::run_pipeline().
--
-- Applied via the Supabase CLI (supabase db push / migration up) — never through the Python
-- client. Data loading (src/ingest/load_supabase.py) is a separate concern from this DDL.
--
-- Column-level constraints mirror src/ingest/join_core.py::SkillCoreRow and
-- src/ingest/role_profile.py::RoleProfileRow exactly (see tests/test_schema_constraints.py,
-- the source of truth for this file).

CREATE TABLE skills_core (
    skill_key                text PRIMARY KEY,
    skill_name                text NOT NULL,
    skill_group               text,
    d1_primary_category       text NOT NULL,
    d2_primary_category       text NOT NULL,
    d1_demand_count           integer NOT NULL,
    d1_demand_pct             double precision NOT NULL,
    median_days_open          double precision,
    salary_premium_pct        double precision,
    repost_rate_pct           double precision NOT NULL,
    scarcity_score            double precision NOT NULL,
    d2_listing_count          integer NOT NULL,
    d2_total_listings         integer NOT NULL,
    d2_demand_pct             double precision NOT NULL,
    d2_required_count         integer NOT NULL,
    d3_corroborated           boolean NOT NULL DEFAULT false,
    d3_postings_with_skill    integer,
    d3_pct_of_all_postings    double precision
);

CREATE TABLE skill_role_profile (
    role_family               text NOT NULL,
    skill_name_raw            text NOT NULL,
    skill_key                 text,
    postings_with_skill       integer NOT NULL,
    pct_of_role               double precision NOT NULL,
    role_postings             integer NOT NULL,
    PRIMARY KEY (role_family, skill_name_raw)
);
