# Data schema notes — extracted 2026-07-22 (Birch, for Cedar's ingest SPEC)

Source: `kaggle-datasets/*.zip` extracted to `data/raw/{d1,d2,d3}/` (gitignored, local-only).

## D1 — `data/raw/d1/skill-scarcity-index.csv`
Columns: `snapshot_date, category, skill_name, demand_count, demand_pct, median_days_open,
salary_premium_pct, repost_rate_pct, scarcity_score`
- 3438 rows total. **Grain is (snapshot_date, category, skill_name), NOT skill_name alone.**
- 8 snapshot_date values (2026-07-12 .. 2026-07-22, sparse). 6 categories: ai, data, devops,
  engineering, product, security. 141 distinct skill_name values.
- Every skill_name appears once per (snapshot_date × category) it's tracked in — e.g. "AWS" has
  48 rows (6 categories × 8 dates).
- Nulls: `median_days_open` empty in 624/3438 rows; `salary_premium_pct` empty in 742/3438 rows.
  `scarcity_score` can still be non-null (e.g. 0.0) when these inputs are null — don't assume
  scarcity_score=0 means "no data."
- `d1/skill-scarcity-index.json` is a schema/license manifest (name, description, column
  descriptions, `latest_snapshot_date: "2026-07-22"`), not additional row data.
- Sample rows (2026-07-12, category=ai):
  ```
  snapshot_date,category,skill_name,demand_count,demand_pct,median_days_open,salary_premium_pct,repost_rate_pct,scarcity_score
  2026-07-12,ai,A/B Testing,115,4.7,1.0,3.9,2.0,49.2
  2026-07-12,ai,AI Agents,153,6.3,,45.5,5.9,72.0
  2026-07-12,ai,AI Coding Tools,32,1.3,,,0.0,0.0
  ```

## D2 — `data/raw/d2/skill-demand-index.csv`
Columns: `snapshot_date, category, skill, skill_group, listing_count, total_listings,
demand_pct, required_count`
- 700 rows. **Grain is (category, skill)** — single snapshot_date (`2026-07-22` for every row,
  unlike D1's 8 dates). 6 categories (same set as D1). 148 distinct skill values.
- A skill can repeat across categories with different listing_count/demand_pct per category
  (e.g. "SQL" has 6 rows: data, engineering, product, devops, security, ai).
- No nulls in any column (checked all 8 columns, 0 empty across 700 rows).
- `d2/skill-demand-index.json` is likewise a schema manifest only.
- Sample rows:
  ```
  snapshot_date,category,skill,skill_group,listing_count,total_listings,demand_pct,required_count
  2026-07-22,data,SQL,Language,834,7447,11.2,827
  2026-07-22,data,Python,Language,686,7447,9.2,668
  2026-07-22,data,AWS,Cloud,307,7447,4.1,294
  ```

## D3 — `data/raw/d3/`
### `skills-2026-overall.csv`
Columns: `skill, postings_with_skill, pct_of_all_postings`. 250 rows, 250 distinct skills
(no duplicates). All-lowercase, mostly single-token vocabulary. Sample:
```
skill,postings_with_skill,pct_of_all_postings
communication,83239,23.09
ai,71253,19.77
python,67062,18.6
aws,40549,11.25
```

### `skills-2026-by-role.csv`
Columns: `role_family, role_postings, skill, postings_with_skill, pct_of_role`. 450 rows = exactly
**15 roles × 30 skills** each, confirmed via row-count-per-role. `pct_of_role` is numeric in all
450 rows (no dtype surprises).

**Exact `role_family` strings** (note: spaces around `/`, unlike AGENTS.md's compact form):
`Backend`, `Business Analyst`, `Data Analyst / BI`, `Data Engineer`, `Data Scientist / ML`,
`Designer (UX/UI)`, `DevOps / Cloud / SRE`, `Frontend`, `Full Stack`, `Mobile`, `Product Manager`,
`Project / Program Mgr`, `QA / Test`, `Security`, `Software Engineer`.

The six V1 roles ARE present with these exact strings: `Backend`, `Full Stack`,
`Data Scientist / ML`, `Data Engineer`, `Software Engineer`, `DevOps / Cloud / SRE`. Any UI
role-picker enum / SQL filter must match these exact strings (with the internal slash-spacing),
not AGENTS.md's `Data Scientist/ML` / `DevOps/Cloud/SRE` shorthand.

### `ai-2026-by-seniority.csv`
Columns: `seniority, postings, ai_postings, ai_pct_of_level`. 8 rows (Internship, Entry Level,
Mid-Senior Level, Principal, Director, ...). Not part of the ingest/join scope — orthogonal
seniority breakdown, no skill_name column at all.

## Join test results (normalized: lowercase, collapse whitespace/`/`/`-`/`_` to single space,
## keep `#`/`+`/`.` intact so `C#` != `C++` != `C`)

- **D1 ∩ D2 = 141** (both exact string match AND normalized match — D1's skill_name set is a
  byte-identical subset of D2's skill set; zero case/punctuation variance between D1 and D2).
  **This contradicts AGENTS.md/README's claimed "139."** D2 has 7 skills D1 lacks: `duckdb`,
  `qlik`, `r`, `ray`, `streamlit`, `supabase`, `talend`.
- **Three-way D1∩D2∩D3 (normalized) = 58** — matches AGENTS.md/README exactly.
  All 58 differ from D1/D2 only by casing (D3 is all-lowercase); e.g. D1 `AWS` / `Angular` /
  `CI/CD` vs D3 `aws` / `angular` / `ci/cd`. **No real "AWS" vs "Amazon Web Services"-style
  full-name-vs-acronym variant was found in any of the three files** — the acronym-expansion
  test case cypress.md cites doesn't occur in this actual dataset (D1, D2, and D3 all use the
  bare acronym `AWS`/`aws`). It's still a reasonable defensive test case for future data drift,
  but Cedar/Cypress should know current data only requires case-folding, not alias-table fuzzy
  matching, to hit the 139/141-skill core.
- Naive normalization gotcha: replacing `#`/`+` with a separator space collapses `C#` and `C++`
  to the same token (`c`) — both appear as distinct skills in D1 and D2 and must stay distinct.
