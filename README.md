# Looking Glass

**A High-Leverage Pivot Engine for career-changers.** Paste your resume, and Looking Glass
shows you not a generic list of ten things to learn, but the *single highest-leverage skill
gap to close first* — the one where the market is hiring hard **and** talent is scarcest.

> The name: a looking glass shows you the market as it really is, and where *you* stand in it.

## The idea

Every "skills gap" tool hands you a flat to-do list. Looking Glass ranks your gaps by an
**Arbitrage Score** — a deterministic measure of where demand is high *and* the skill is hard
to hire for. High demand + high scarcity = the path of least resistance to the highest
leverage. Learn that first (the "snowball" method: tackle the biggest constraint first),
then move down the ladder.

For example: if both *Cloud Architecture* and *Agentic AI Tooling* are in high demand, but
scarcity data shows agentic-AI talent is far harder to hire, Looking Glass routes you to the
agentic-AI skill first — same demand, less competition, faster payoff.

### Bounded AI, by design

The Arbitrage Score is **computed deterministically** in SQL/Python — never estimated by the
LLM. The language model's only job is to *narrate* the result ("learn X before Y, here's
why") and to extract skills from the resume. Numbers come from data; words come from the model.

## How the score works

```
arbitrage_score = f( demand , scarcity )
```

- **Demand** — how much of the market is hiring for this skill (share of job listings).
- **Scarcity** — how hard the skill is to fill: scarcity index, salary premium, and median
  days a role stays open.

Both axes come straight from the source data; the score is a pure function of them, so it is
reproducible and auditable.

> **Note on the "2026 prediction" axis.** An earlier design imagined a third,
> forward-looking axis. The source datasets are all *current snapshots*, not forecasts, so
> the honest model is two-axis: **demand × scarcity**. Cleaner, and fully grounded in data.

## Data sources

Three public Kaggle datasets, joined on skill name:

| # | Dataset | Role | Distinct skills |
|---|---------|------|-----------------|
| D1 | [Skill Scarcity Index](https://www.kaggle.com/datasets/datamatastudios/skill-scarcity-index) ("Hardest Tech Skills to Hire For") | Scarcity: `scarcity_score`, `salary_premium_pct`, `median_days_open` + demand | 139 |
| D2 | [Skill Demand Index](https://www.kaggle.com/datasets/datamatastudios/skill-demand-index) | Demand: `demand_pct`, `required_count`, `skill_group` | 147 |
| D3 | [Most In-Demand Job Skills 2026](https://www.kaggle.com/datasets/alpha21/most-in-demand-job-skills-2026) (360k+ postings) | Demand corroboration across a large posting base | 250 |

### The join strategy (validated)

A three-way join was tested by normalizing skill names (case, punctuation, whitespace):

- **D1 ∩ D2 = 139** — a near-perfect join (same publisher, same taxonomy). This is the
  **core**: every skill carries both demand and scarcity signal.
- **Three-way ∩ = 58** — D3 uses a coarser, lowercase, single-token vocabulary
  (`ai`, `cloud`, `python`), so most of its 250 skills are generic soft skills or broad
  buckets absent from the tech-focused D1/D2.

Rather than force a lossy three-way join (which would discard 81 good skills), Looking Glass:

- builds its **139-skill core on D1 + D2**, and
- uses **D3 as an enrichment badge** — for the 58 skills it corroborates, the UI marks demand
  as "confirmed across 360k+ postings" (higher confidence).

All three datasets contribute; none is thrown away.

## MVP scope (walking skeleton)

The thinnest end-to-end slice that proves the core value hypothesis, in build order:

1. **Ingest** the three CSVs into Supabase; resolve the D1+D2 skill join (139-skill core).
2. **Compute** a deterministic `arbitrage_score` view (demand × scarcity), with D3 confidence badges.
3. **Market Map** — a static visual matrix of every skill by demand × scarcity (no auth, no resume).
4. **Resume gap layer** — paste a resume → extract skills → highlight *your* gaps on the same matrix.
5. **Narrative** — the LLM writes a short "learn X before Y, here's why" rationale for the top gap.

### The visual matrix

Not a text list — the interface is the product:

- **Quadrant scatter** — x = demand, y = scarcity, bubble size = market share, color = have vs.
  gap. The top-right (high demand + high scarcity) is the "learn this next" zone.
- **Arbitrage ladder** — a ranked bar list of *your* gaps by score, each with the one-line LLM rationale.

### Explicitly out of scope for V1

User accounts / saved plans, cohort aggregation, syllabus/curriculum auditing, skill-alias
fuzzy matching (a V2 refinement that would lift D3 coverage), and any forward-looking forecast axis.

## Stack

- **Data / DB** — Supabase (Postgres); deterministic scoring in SQL / Python.
- **Frontend** — React + TypeScript; the demand × scarcity matrix.
- **AI layer** — Claude for resume skill-extraction and result narration only (bounded, non-numeric).

## Status

Scoped and data-validated. Datasets downloaded and the join test run (results above).
Next: implementation planning and the walking-skeleton build.

---

*Built for the Pursuit AI Native Fellowship.*
