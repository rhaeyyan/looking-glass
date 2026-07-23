# Looking Glass

**A High-Leverage Pivot Engine for career-changers.** Pick the role you're aiming for, paste
your resume, and Looking Glass shows you not a generic list of ten things to learn, but the
*single highest-leverage skill gap to close first* on the path to that role — the one where the
market is hiring hard **and** talent is scarcest.

> The name: a looking glass shows you the market as it really is, and where *you* stand in it.

## The idea

Every "skills gap" tool hands you a flat to-do list. Looking Glass starts from **where you want
to go** — a target role — then ranks the gaps between you and that role by an **Arbitrage
Score**: a deterministic measure of where demand is high *and* the skill is hard to hire for.
High demand + high scarcity = the path of least resistance to the highest leverage. Learn that
first (the "snowball" method: tackle the biggest constraint first), then move down the ladder.

For example: you're aiming for **Backend Engineer**. Both *Kafka* and *Redis* show up as gaps
in your resume and both are in demand, but scarcity data shows Kafka talent is far harder to
hire — so Looking Glass routes you to Kafka first: same demand, less competition, faster payoff.

## The primary flow

1. **Pick your target role** (e.g. Backend, Data Scientist/ML, DevOps).
2. **Paste your resume** — Looking Glass extracts the skills you already have.
3. **See the gap** — the role's skill profile minus your skills, ranked by Arbitrage Score.
4. **Learn the top gap first**, with a short rationale for why it's the highest-leverage move.

A whole-market "explore" mode (all skills, no target role) is available as a secondary view.

### Bounded AI, by design

The Arbitrage Score is **computed deterministically** in SQL/Python — never estimated by a
language model. As of specs 005 and 006, this bound is total: both result narration ("learn X
before Y, here's why") and resume-skill extraction are also fully deterministic (a template
engine and vocabulary-scoped regex matching, respectively), so the app currently makes **zero
LLM calls anywhere**. The bounded-single-call mechanism (a server-side-proxied, schema-validated,
swappable-provider LLM call) remains the documented pattern-in-reserve should a future feature
need it — narration and extraction just don't need it today.

## How the score works

```
demand_score     = d2_demand_pct
scarcity_index   = 0.6 * scarcity_score
                 + 0.2 * min(salary_premium_pct, 100)      [if present]
                 + 0.2 * min(median_days_open, 60) / 60 * 100  [if present]
                   (weights renormalize — never zero-substitute — when a term is missing)
arbitrage_score  = demand_score * scarcity_index
```

- **Demand** — `demand_score` is `d2_demand_pct` verbatim, from the Skill Demand Index (D2). D1
  also carries a demand figure, but it's kept only as a passthrough audit field, never averaged
  in: blending two datasets' demand numbers would fabricate a figure not traceable to one real
  source row — D2 is the one dataset actually scoped as the demand index with a documented
  denominator.
- **Scarcity** — `scarcity_index` is a weighted composite: `scarcity_score` (weight 0.6, always
  present, never clipped) + salary premium (weight 0.2, clipped at 100%) + median days a role
  stays open (weight 0.2, capped at 60 days). Salary premium and days-open are nullable for some
  skills; when one is missing, its weight isn't zero-substituted — the remaining weights
  renormalize proportionally, and a `scarcity_data_completeness` label (`full` /
  `missing_salary_premium` / `missing_days_open` / `missing_both`) travels with the score so no
  consumer mistakes a partial-data score for a complete one.
- **D3 corroboration** — whether a skill is confirmed in D3's 360k+ postings is a separate badge
  field (`d3_corroborated` / `d3_pct_of_all_postings`), never blended into the numeric score.

Both axes come straight from the source data, and the formula reads each row's own fields only —
no dataset-wide statistics — so any single score is reproducible and auditable in isolation.

> **Note on the "2026 prediction" axis.** An earlier design imagined a third,
> forward-looking axis. The source datasets are all *current snapshots*, not forecasts, so
> the honest model is two-axis: **demand × scarcity**. Cleaner, and fully grounded in data.

## Data sources

Three public Kaggle datasets, joined on skill name:

| # | Dataset | Role | Distinct skills |
|---|---------|------|-----------------|
| D1 | [Skill Scarcity Index](https://www.kaggle.com/datasets/datamatastudios/skill-scarcity-index) ("Hardest Tech Skills to Hire For") | Scarcity: `scarcity_score`, `salary_premium_pct`, `median_days_open` + demand | 141 |
| D2 | [Skill Demand Index](https://www.kaggle.com/datasets/datamatastudios/skill-demand-index) | Demand: `demand_pct`, `required_count`, `skill_group` | 148 |
| D3 | [Most In-Demand Job Skills 2026](https://www.kaggle.com/datasets/alpha21/most-in-demand-job-skills-2026) (360k+ postings) | Demand corroboration + **per-role skill profiles** (`skills-2026-by-role.csv`: 15 roles × top 30 skills) | 250 |

*Re-validated against the raw CSVs on 2026-07-22 — D1+D2 core is 141 (not the earlier 139) and
D2's own distinct-skill count is 148 (not 147); both are now locked in as passing, enforced
assertions in `tests/test_data_invariants.py`.*

### The join strategy (validated)

A three-way join was tested by normalizing skill names (case, punctuation, whitespace):

- **D1 ∩ D2 = 141** — a near-perfect join (same publisher, same taxonomy). This is the
  **core**: every skill carries both demand and scarcity signal. (D2 has 7 skills D1 lacks:
  `duckdb`, `qlik`, `r`, `ray`, `streamlit`, `supabase`, `talend`.)
- **Three-way ∩ = 58** — D3 uses a coarser, lowercase, single-token vocabulary
  (`ai`, `cloud`, `python`), so most of its 250 skills are generic soft skills or broad
  buckets absent from the tech-focused D1/D2.

Rather than force a lossy three-way join (which would discard 83 good skills), Looking Glass:

- builds its **141-skill core on D1 + D2**, and
- uses **D3 as an enrichment badge** — for the 58 skills it corroborates, the UI marks demand
  as "confirmed across 360k+ postings" (higher confidence).

All three datasets contribute; none is thrown away.

### Role coverage (why V1 is scoped to technical roles)

A target role's 30 skills come from D3's coarse vocabulary, so how many of them carry a real
Arbitrage Score varies by role. Technical/engineering roles are dense with hard skills that
live in the D1+D2 core; softer roles are mostly generic skills the tech-focused source data
doesn't score:

| Coverage | Roles | Skills with an arbitrage score |
|---|---|---|
| **Strong (V1)** | Backend, Full Stack, Data Scientist/ML, Data Engineer, Software Engineer, DevOps/Cloud/SRE | 15–22 of 30 |
| Moderate (later) | Frontend, Data Analyst/BI, Mobile | 8–9 of 30 |
| Weak (V2+) | Security, QA, Business Analyst, Designer, Product Manager, Project/Program Mgr | 3–6 of 30 |

**V1 ships the six "Strong" technical roles** — which is exactly the Pursuit career-changer-into-tech
audience. A skill that appears in a role but has no arbitrage score still surfaces as a gap,
flagged *"demand only, scarcity unknown"* rather than silently dropped.

## MVP scope (walking skeleton)

The thinnest end-to-end slice that proves the core value hypothesis, in build order:

1. **Ingest** the three CSVs into Supabase; resolve the D1+D2 skill join (141-skill core) and
   the D3 per-role skill profiles.
2. **Compute** a deterministic `arbitrage_score` view (demand × scarcity), with D3 confidence badges.
3. **Role picker** — select one of the six V1 technical roles; show its skill profile on the
   demand × scarcity matrix.
4. **Resume gap layer** — paste a resume → extract skills → subtract from the role profile →
   highlight *your* gaps on the matrix, ranked by Arbitrage Score.
5. **Narrative** — a short "learn X before Y, here's why" rationale for the top gap.

> **Steps 4 and 5 are both deterministic (specs 005, 006) — first zero-LLM state since spec
> 001.** Step 5's narration was replaced with a deterministic template engine (spec 005): every
> fact the rationale needs — demand, `scarcity_index`, salary premium, days-open, the exact rank
> ordering — is already computed by this stage, so a template function states the *precise*
> mathematical reason one gap outranks another with zero latency, zero cost, and zero risk of a
> hallucinated number. Step 4's extraction was originally kept LLM-backed (fuzzy string matching
> was rejected as a "100% zero-AI" pivot, since it regresses on single-letter skills — `r`
> matching "R&D" — negation — "no Kubernetes experience" reading as a false *have* — and
> contextual phrasing) — but that decision was later reversed once the LLM path's upstream
> free-tier rate limit made live verification impractical. Spec 006 replaced it with
> vocabulary-scoped regex matching (matching only against the *selected role's* own skill list,
> not the full skill catalog), with the two flagged regressions given concrete, bounded
> mitigations (lookaround-based word-boundary matching; a negation-cue list scanned in a
> clause-bounded window) — and their honest *residual* limits documented rather than claimed
> solved (e.g. `r` still false-matches inside "R&D"; a negation cue outside the scan window still
> slips through). No alias/synonym folding was added — that constraint is unchanged from spec 004.

### The visual matrix

Not a text list — the interface is the product:

- **Quadrant scatter** — x = demand, y = scarcity, bubble size = market share, color = have vs.
  gap. The top-right (high demand + high scarcity) is the "learn this next" zone.
- **Arbitrage ladder** — a ranked bar list of *your* gaps by score, each with a one-line rationale.

### Explicitly out of scope for V1

User accounts / saved plans, cohort aggregation, syllabus/curriculum auditing, the moderate-
and weak-coverage roles, skill-alias fuzzy matching (a V2 refinement that would lift D3
coverage), and any forward-looking forecast axis.

## Stack

- **Data / DB** — Supabase (Postgres); deterministic scoring in SQL / Python.
- **Frontend** — React + TypeScript; the demand × scarcity matrix.
- **AI layer** — none currently in the runtime path (specs 005/006 made both narration and
  resume-skill extraction fully deterministic). The bounded-single-call mechanism — a server-
  side-proxied, schema-validated, swappable-provider LLM call (bounded, non-numeric) — remains
  documented as the pattern-in-reserve should a future feature need one.

## Status

Scoped and data-validated. Datasets downloaded, join test and per-role coverage run (results
above). Primary flow is target-role → resume → arbitrage-ranked gaps, V1 scoped to the six
high-coverage technical roles. Next: implementation planning and the walking-skeleton build.

---

*Built for the Pursuit AI Native Fellowship.*
