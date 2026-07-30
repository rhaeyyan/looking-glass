# Candidate dataset evaluations

Register of datasets considered for the arbitrage engine and **rejected**, with the reason. Kept so
a rejected candidate doesn't get re-litigated from scratch, and so the reason survives context
compaction. Accepted datasets (D1/D2/D3) are documented in [schema-notes.md](schema-notes.md).

Verdict vocabulary: **REJECTED** (won't join / unsound) · **PARKED** (sound but out of V1 scope) ·
**CONTEXT-ONLY** (usable as framing copy, never as a score input).

---

## AI-Skills-in-Job-Requirements — *Datamata AI Requirements Index*

- **Evaluated**: 2026-07-26
- **Files**: `data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.{csv,json}`
  (gitignored, local-only). The JSON holds the same 2,169 rows plus a column/license manifest —
  it is not additional data.
- **License**: CC BY 4.0 · **Source**: https://www.datamatastudios.com/datasets/ai-requirements-index
- **Verdict: REJECTED as a join/score input for V1. PARKED for V2** as CONTEXT-ONLY framing copy —
  see "Park conditions" below for what would revive it.

### Shape

Grain is `(snapshot_date, category, seniority, tier)` — 2,169 rows.

| Field | Values |
|---|---|
| `snapshot_date` | 31 values, 2026-03-12 → 2026-07-22 |
| `category` | 6: ai, data, devops, engineering, product, security (same set as D1/D2) |
| `seniority` | 4: all, entry, mid, senior |
| `tier` | 3: any_ai, genai, ml |
| measures | `listings_with_ai`, `total_listings`, `pct`, `required_count` |

### Why it's rejected

**1. Wrong grain — the file contains no skill names.** Its finest resolution is "8.6% of data
listings mention any AI." The Arbitrage Score is per-skill over the 141-skill core; there is no key
to join on, to D1/D2's `skill_name` or to D3's per-role top-30. Confirmed by probing the JSON:
`tensorflow`, `langchain`, `python`, `sql`, `skill_name` all appear **zero** times; `pytorch` and
`llm` appear once each, inside the prose describing what the `genai` tier means.

**2. Wrong role axis.** 6 categories against the 15 `role_family` values V1 ships. The mapping is
lossy many-to-one — one blunt percentage smeared across several roles.

**3. The time series is a collection artifact, not a trend.** This is the load-bearing finding. Every
category's AI share falls steeply across the 31 snapshots (ai `any_ai` 95.1% → 43.0%; data 60.4% →
8.6%), which reads as a story until it's plotted against sample size:

```
date          pool     ai_pct   eng_pct
2026-07-02     4,180     82.3      17.7
2026-07-09     4,986     65.5      15.2
2026-07-10    20,857     45.8       9.9   <- pool 4x in one day, every pct roughly halves
2026-07-22    30,382     43.0       9.3
```

The pool grows 1,559 → 30,382 and `pct` moves inversely at every step, with a step discontinuity on
2026-07-10 where the snapshot cadence also silently changes from weekly to daily. That is a crawler
widening its coverage — the early snapshots are a small, AI-biased seed — not AI requirements
collapsing across the tech labor market.

**Any velocity / "AI demand is accelerating" feature derived from these snapshots would be reporting
the collector's backfill schedule.** It would also fail *silently* (INVARIANT lane per CLAUDE.md):
the numbers stay plausible while meaning nothing.

### Which cuts survive the artifact (tested 2026-07-26)

Every field shares one denominator — `total_listings`, the crawler's pool. **The test for any
proposed use: does the denominator cancel?** Results:

| Cut | Robust? | Evidence |
|---|---|---|
| Absolute `pct`, any trend/delta | **No** | tracks pool size inversely at every step |
| Category rank ordering | **No** | `security` #2 (27.3) on 07-09 → last (3.3) on 07-10; `data` #2 in March → #5 in July |
| **Seniority gradient (ordering)** | **Yes** | monotonic in 5 of 6 categories on real data (`data` shows entry≈mid, statistically tied at that sample size — see 2026-07-28 update below — with a real senior jump, not a genuine three-step increase); order survives 07-10 while levels drop ~2.5x — entry/mid/senior share one pool at one instant, so dilution is common-mode |
| **`required_count / listings_with_ai`** | **Yes** | 96–100% everywhere; both terms drawn from the same listing set. `security` (78%) is small-count noise |
| genai/ml mix | **Partial** | `engineering` 67.4→67.5 and `product` 75.4→76.9 across the boundary, but `ai` 66.3→51.1 and `data` 38.6→28.9 break. Category-dependent robustness is unusable in a shipped feature |

Worked example of the surviving gradient:

```
engineering   2026-07-09:  entry=8.6  mid=11.8  senior=17.3
              2026-07-22:  entry=3.0  mid=7.3   senior=11.0
```

Supportable claim: **AI requirements concentrate at senior levels and are near-absent at entry level
outside the `ai` category** — `security` and `devops` both read 0.0% at entry on 2026-07-22.

### The one sound use

Narration **framing**, never ranking — a fixed, date-stamped sentence beside the deterministic
per-skill narration, e.g. "AI requirements in security roles appear at 5.6% of senior postings and
0.0% of entry-level ones (Datamata AI Requirements Index, 2026-07-22)."

Note this does not change the join verdict: establishing that the seniority gradient is trustworthy
does not create a `skill_name` column. The surviving signal is category-grain and ordinal; the
Arbitrage Score is per-skill and cardinal. **Decision for V1: leave it out** — one line of copy does
not pay for an ingest path, a staleness question, and a citation obligation.

### Park conditions (what would revive this for V2)

Parked rather than closed. Any **one** of these makes it worth re-opening:

1. **The publisher stabilizes the sampling frame.** If a future pull shows `total_listings` roughly
   flat across snapshots — no step changes like 07-10 — the trend becomes readable and the dataset
   gains the time dimension D1/D2/D3 entirely lack. Re-run the denominator-cancellation table above
   before believing it; a flat pool is necessary, not sufficient.
2. **V2 adds seniority to the target-role picker.** The seniority gradient is the robust cut, and
   today it has nothing to attach to because the picker is role-only. Given a target *level*, "AI
   requirements are near-absent at entry level outside `ai` roles" becomes advice about the user's
   actual position rather than a general remark. Still category-grain — this makes it *relevant*,
   not joinable.
3. **A skill-level source with timestamps lands and needs corroboration.** Then this becomes a
   sanity check on that source's category aggregates rather than a data input in its own right.

**2026-07-28 update: spec 028 satisfies condition #2.** `specs/028-seniority-role-picker.md`
(Redwood) shipped `frontend/src/lib/seniorityFraming.ts` — a static `SENIORITY_GRADIENT` table +
`ROLE_TO_DATAMATA_CATEGORY` mapping + `getSeniorityFraming(role, seniority)` template function,
data-layer only (no UI; spec 029 covers the picker control). Initially shipped with 8 of 18 cells
PLACEHOLDER because the gitignored raw file was absent from the checkout; the raw file has since
landed. This is a gitignored, local-only path that has moved at least three times across sessions:
it briefly lived at `data/raw/archive/` before the arshkon LinkedIn Job Postings set (see the entry
below) reused that directory name and displaced it; a 2026-07-28 note then cited
`data/raw/ai-requirements/`; as of 2026-07-29 it is back at
`data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv` — matching this doc's original
citation above (line 15). Re-verify this path on any fresh checkout before trusting it. All 18 cells are
now real, live-extracted figures** (2026-07-28 pull, same 2026-07-22 snapshot, `tier=any_ai`). The
3 previously-cited values here — `engineering`'s full triple (3.0/7.3/11.0), `security`'s
entry+senior (0.0/5.6), `devops`'s entry (0.0) — were cross-checked against the raw pull and match
exactly.

**Finding, investigated and resolved (2026-07-28)**: the `data` category's real figures are
entry_pct=7.4, mid_pct=7.2, senior_pct=11.0 — entry_pct nominally > mid_pct, which appeared to
**break** the "monotonic in all 6 categories" claim in the "Which cuts survive" table above (line
75). That claim predates this category ever being pulled. Direct investigation against the raw CSV
(`data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv`) resolved this as **sample-size noise, not a real
inversion**:

- `data`/entry's pool is ~370-380 total listings; `data`/mid's pool is ~3,800-4,300 — roughly 10x
  larger. At entry's sample size (~375, p≈0.07), the standard error is ~1.3 percentage points.
- Across the surrounding week's snapshots, entry and mid trade places: 07-17 entry(8.0)>mid(7.4);
  07-18 entry(7.2)<mid(7.5); 07-19 entry(6.9)<mid(7.4); 07-22 entry(7.4)>mid(7.2). That's
  statistically indistinguishable noise in either direction, not a resolvable ordering.
- `senior` (10.9-12.0% across the same window) is robustly and consistently **above** both entry
  and mid on every single date — that part of the gradient *is* a real, non-noise signal.

**Verdict, precisely stated**: the seniority-gradient ordering claim holds as designed for 5 of the
6 categories on real data (`ai`, `devops`, `engineering`, `product`, `security`). For `data`,
entry≈mid are statistically tied at the sample size this dataset offers — not a genuine three-step
monotonic increase — while the senior jump remains real and matches the dataset's core validated
claim (AI requirements concentrate at senior level). This is a documented, evidenced exception for
`data` specifically, not a blanket loosening of the monotonic tolerance across all 6 categories,
and not a silent reconciliation of the numbers. `frontend/src/lib/seniorityFraming.ts` carries the
true 7.4/7.2/11.0 values un-adjusted (see that file's `SENIORITY_GRADIENT.data` comment for the
same SE/pool-size reasoning inline), and `seniorityFraming.test.ts` is expected to encode `data` as
a named exception to the monotonic-invariant suite rather than assert the blanket claim against it
(Cypress, spec 028 follow-up) — no re-derivation of this reasoning should be needed there.

Companion V2 candidate: the arshkon LinkedIn postings set (parked for role expansion; derives real
scarcity from four timestamps, but its "skills" are LinkedIn job-function codes, not skills). The two
are complementary — that set has time and grain problems of the opposite kind.

**On re-open, re-validate first.** Both the numbers and the artifact analysis above are pinned to the
2026-07-22 pull. A later pull may have backfilled or re-based the early snapshots.

### If the "AI demand is rising" angle is wanted for real

It needs skill-level rows and a stable sampling frame. Closest candidate on hand is the LinkedIn
postings set already parked for V2, which at least carries timestamps whose provenance can be
reasoned about.

### Housekeeping

The extracted directory arrived named `'AI-Skills-in-Job-Requirements\n'` — with a literal trailing
newline — which breaks `cd`, globs, and any ingest path built by string concatenation. Renamed
2026-07-26. Worth checking for on any future extract.

---

## ai_job_market.csv / AI Job Market Dataset.csv / ai_job_salary_dataset_10k.csv

- **Evaluated**: 2026-07-27
- **Files**: `data/raw/ai_job_market.csv`, `data/raw/AI Job Market Dataset.csv`,
  `data/raw/ai_job_salary_dataset_10k.csv` (gitignored, local-only; source/license unrecorded —
  no dataset card or manifest was found alongside any of the three).
- **Verdict: REJECTED, all three — not PARKED.** Unlike the AI Requirements Index above, there is
  no real signal here to wait on; the rejection reason (synthetic generation) doesn't resolve with
  a future pull, a picker change, or a corroborating source. Evaluated together because all three
  fail the identical test in the identical way.

### The test: does the categorical distribution look like a labor market or a random-number generator?

Real job-posting data follows a power law — a handful of skills/roles dominate, a long tail barely
appears (this is exactly what D1/D2/D3's own skill-frequency data looks like). Synthetic data
built from `random.choice()` over a fixed list instead produces a **flat** distribution — every
category roughly equally likely, converging on the uniform rate as row count grows. All three
files show the flat signature, not the power-law one:

| File | Rows | Evidence of uniform-random generation |
|---|---|---|
| `ai_job_market.csv` | 2,000 | 22 distinct skills, each appearing in **20.3–22.6%** of rows (a ≤2.3-point spread); 8 job titles split 230–271 each (expected 250 if uniform); company names are Faker-library output (`"Foster and Sons"`, `"Boyd, Myers and Ramirez"`) |
| `AI Job Market Dataset.csv` | 10,345 | Only 5 binary skill flags, each true in **49.3–51.1%** of rows — a coin flip; 6 job titles split 1676–1773 each (expected 1724); `job_posting_year` runs through **2026**, i.e. postings dated into the future relative to any real crawl |
| `ai_job_salary_dataset_10k.csv` | 10,000 | 10 distinct skills, each appearing in **29.0–31.0%** of rows; 8 job roles split 1218–1289 each (expected 1250) |

No real labor-market crawl produces a skill-mention spread this tight across a double-digit
distinct-value set — D1/D2's own real skill frequencies span orders of magnitude, not a ~2-point
band. This is the fingerprint of independent-per-row random sampling from a fixed pool, not
scraped postings.

### Why this is a harder rejection than the AI Requirements Index

That dataset had a real, if collection-biased, signal — the seniority gradient survived
denominator-cancellation testing and was PARKED as a future CONTEXT-ONLY source. These three have
**no real signal to extract, biased or otherwise** — there is nothing to be robust or fragile,
because the values were never observations of a labor market to begin with. Any per-skill demand,
scarcity, or salary figure derived from them would silently report the generator's random seed as
if it were market data — an INVARIANT-lane failure (CLAUDE.md): the numbers stay plausible while
meaning nothing, with no visible sign anything is wrong.

### Relevance to the two open V2 candidates

Neither remaining V2 candidate is helped:

- **Seniority in the target-role picker** — `experience_level`/`years_experience` fields exist in
  all three, but carry the same uniform-random problem (no reason to believe a "senior" row's
  skill/salary values are drawn from anything different than an "entry" row's); a synthetic
  seniority split adds nothing the (real, PARKED) AI Requirements Index's seniority gradient
  doesn't already offer more defensibly.
- **Role expansion via the LinkedIn/arshkon dataset** — these three have single-point
  `posted_date`/`job_posting_month`/`job_posting_year` fields, not a real multi-snapshot time
  series; they don't substitute for or corroborate the arshkon set's timestamp dimension.

### Park conditions

None. Re-open only if a *different*, non-synthetic release under one of these filenames surfaces
(re-run the distribution-flatness test above first — that is the fast, cheap check that closed
this evaluation and should gate any future candidate under a similar name).

---

## LinkedIn Job Postings (2023-2024) — arshkon set

- **Evaluated**: 2026-07-28
- **Files**: `data/raw/archive/postings.csv`, `data/raw/archive/{companies,jobs,mappings}/*.csv`
  (gitignored, local-only; extracted from `data/raw/archive.zip`). Kaggle listing:
  `arshkon/linkedin-job-postings`. **License**: not bundled with the download (no dataset card or
  license file in the extracted archive) — unresolved; check the Kaggle listing directly before
  any ingest/redistribution.
- **Verdict: REJECTED as the role-expansion source the V2 candidate proposed. The pre-built
  skill join is REJECTED outright (same "wrong grain" failure as the AI Requirements Index).
  PARKED, narrowly, for a materially different use than originally proposed** — see "The one
  narrow path that survives" below.

### Shape

Real crawl, not synthetic — confirmed by the checks below, not assumed from the listing's
reputation. `wc -l postings.csv` reports 3,383,602 lines; that number is an artifact of
embedded newlines inside quoted `description` fields, not row count. The true grain, verified by
parsing with a real CSV reader:

| File | Rows | Grain |
|---|---|---|
| `postings.csv` | **123,849** (distinct `job_id`) | one row per real job posting, `title` + free-text `description` + `original_listed_time`/`listed_time`/`closed_time`/`expiry` (real Unix-ms timestamps) + `min_salary`/`max_salary`/`normalized_salary` + `formatted_experience_level` |
| `jobs/job_skills.csv` | 213,768 rows, 126,807 distinct `job_id` | `(job_id, skill_abr)` — **`skill_abr` is one of exactly 36 values** (`mappings/skills.csv`) |
| `companies/*.csv`, `mappings/industries.csv`, `jobs/{benefits,salaries,job_industries}.csv` | — | company/industry/benefits metadata, not skill-level |

### Confirmed real (not synthetic) — same test this doc already established

- **Title distribution is a genuine power law**: 72,521 distinct titles across 123,849 postings;
  the single most common title ("Sales Manager") accounts for only 0.5% of rows. This is the
  opposite signature of the three synthetic CSVs rejected above (which clustered every category
  within a 2-3 point band of the uniform rate) — real labor-market data, not `random.choice()`.
- **Timestamps are real and dated**: `original_listed_time` spans **2023-12-05 to 2024-04-20**
  (verified directly, not read from a manifest), with posting volume ramping up through the window
  (150-33,600+ postings/day in the final two weeks) — consistent with an actual scrape converging
  on a cutoff date, not a fabricated uniform spread.

### Why the pre-built skill join is rejected — same failure mode as the AI Requirements Index

`mappings/skills.csv` has exactly 36 rows. Read in full:

```
ART Art/Creative        SUPL Supply Chain       LGL  Legal
DSGN Design             ANLS Analyst            ENG  Engineering
ADVR Advertising        HCPR Health Care Provider  QA Quality Assurance
PRDM Product Management RSCH Research           BD   Business Development
DIST Distribution       SCI  Science             IT   Information Technology
EDU  Education          GENB General Business    ADM  Administrative
TRNG Training           CUST Customer Service     PROD Production
PRJM Project Management STRA Strategy/Planning    MRKT Marketing
CNSL Consulting         FIN  Finance              PR   Public Relations
PRCH Purchasing         OTHR Other                WRT  Writing/Editing
                                                   ACCT Accounting/Auditing
                                                   HR   Human Resources
                                                   MNFC Manufacturing
                                                   SALE Sales
                                                   MGMT Management
```

This is a **job-function taxonomy** (Engineering, IT, Marketing, Sales — the kind of dropdown a
LinkedIn profile picks one of), not a skill vocabulary. There is no `python`, `kubernetes`,
`react`, or any entry from the 141-skill core anywhere in it. Exactly the wrong-grain failure
that rejected the AI Requirements Index as a join input (`category × seniority × tier`, no
`skill_name` column) — confirmed here directly rather than inferred from the earlier flag in this
doc ("its 'skills' are LinkedIn job-function codes, not skills," written before this dataset was
in hand). The top categories by volume (`IT` 26,137, `SALE` 22,475, `MGMT` 20,861, `MNFC` 18,185,
`HCPR` 17,369) confirm this is a general cross-industry crawl, not a tech-sector-focused one —
Sales, Manufacturing, and Health Care Provider all outrank or nearly match `IT`.

### Why role expansion doesn't work either

The app's 15 `role_family` values (Backend, Full Stack, Data Scientist/ML, DevOps/Cloud/SRE, …)
are all tech-sector roles. This dataset's top 10 titles by volume are Sales Manager, Customer
Service Representative, Project Manager, Administrative Assistant, Senior Accountant, Executive
Assistant, Salesperson, Registered Nurse, Receptionist, Staff Accountant — a general LinkedIn
labor-market crawl, not a tech-role corpus. Mapping these titles onto the existing 15 technical
role_family values would be as lossy as the AI Requirements Index's 6-category mapping, without
even that dataset's grain being right to begin with.

### The one narrow path that survives (tested, not assumed)

`description` is real free text (avg. 3,766 chars, max 23,201) and could, in principle, be
regex-matched against the 141-skill core the same way spec 006's `resumeSkills.ts` already
extracts skills from resume text — an entirely different path from the broken `skill_abr` join,
using only `postings.csv` and the existing deterministic vocabulary-scoped matcher. Sanity-tested
directly (1-in-20 sample, 6,193 postings, description-body substring match, no boundary/negation
handling applied — a cruder proxy than `resumeSkills.ts`'s real matcher):

| Skill | Hit rate | | Skill | Hit rate |
|---|---|---|---|---|
| Excel | 14.0% | | JavaScript | 1.7% |
| SQL | 4.5% | | Machine Learning | 1.2% |
| Python | 3.9% | | React | 1.1% |
| AWS | 2.3% | | Kubernetes | 0.8% |
| Java | 2.0% | | Docker | 0.8% |

A real, non-uniform, order-of-magnitude spread — the same power-law shape D1/D2's own skill
frequencies show, not the flat synthetic signature. So a real per-skill, real-dated signal is
technically extractable from this file. **Two things stop this from being a live V2 candidate
today, not just a technicality**:

1. **The crawl is stale.** Dec 2023–Apr 2024 is roughly two years behind this project's other
   snapshot dates (D1/D2/D3 and the AI Requirements Index are all dated 2026). A "real
   timestamps" feature built on a frozen ~2023-2024 window doesn't corroborate or extend anything
   currently shipped — it would need a fresh pull to be worth the ingest path.
2. **It's real, uncosted work**, not a static-table drop-in like specs 025/028 — it means building
   and running a description-level extractor across 123,849 rows (a genuinely new deterministic
   component, not a config change), then deciding what a "skill demand over time" feature would
   even show given the tech/non-tech skew above.

### Park conditions (what would revive this)

1. **A fresher pull** (2026-dated or later) — the single blocking issue for the time-series
   angle; re-run the title-power-law and description-hit-rate checks above on any reopen, don't
   assume they still hold.
2. **A concrete feature spec** for what a real-dated, extracted-from-free-text skill signal would
   render (e.g., "postings mentioning `{skill}` per month," which needs the fresh pull above to be
   worth showing) — this doc is not that spec, only the evidence that the extraction is viable.

Not reviving the original "role expansion" framing from README's V2 candidate list — that's
closed by the tech/non-tech title-skew finding above, independent of pull freshness.

---

## Effort / time-to-competency tag per skill gap — feature evaluation, no dataset

- **Evaluated**: 2026-07-30
- **Requested by**: human reviewer (senior-level career-changer persona) — "add a rough 2-weeks
  vs. 6-months effort tag next to each ranked gap, so leverage isn't the only signal." Routed by
  Pine as INVARIANT (a wrong effort estimate sits on screen looking plausible and misleads a real
  decision, same silent-failure shape as a wrong `arbitrage_score`).
- **Files checked**: `data/schema-notes.md` (D1/D2/D3 full column lists), this doc's existing
  entries for the AI Requirements Index / synthetic ai_job_market files / arshkon LinkedIn set,
  and `ARCHIVED_SESSIONS.md`'s round-3 record of the dropped Coursera (D4) evaluation.
- **Verdict: REJECTED — not viable within V1/V2's zero-guess data discipline. No code written,
  nothing to revert.**

### Why this is a different measurement than anything currently in the app

D1, D2, and D3 all measure **hiring-market demand and scarcity** — how many postings mention a
skill, how long employers struggle to fill it, salary premium, repost rate. "Time for a human to
learn skill X" is a **pedagogical/curriculum** measurement; nothing in any accepted dataset's
column list encodes it, not even approximately.

**The near-miss that must not be conflated**: D1's `median_days_open` measures how long a *role
requiring this skill* sits open before being filled — hiring friction, driven by employer search
cost and candidate scarcity. It says nothing about how long a *learner* takes to acquire the
skill. A skill can show a high `median_days_open` because it's genuinely hard to learn, or
because it's new enough that supply hasn't caught up yet, or because employers are picky for
unrelated reasons — the field can't distinguish these, and no formula derived from it can either.
Using it as an effort proxy would silently repackage a hiring-difficulty number as a
learning-difficulty number under a label the user would reasonably trust.

### Checked against the two previously-rejected candidates for a leftover signal

- **Coursera (D4)**: its 2026-07-24 evaluation (see `ARCHIVED_SESSIONS.md` round 3) recorded no
  duration/difficulty column in its reasoning at all — the rejection was vocabulary-match ceiling
  (33/141 exact, 83/141 = 58.9% with a hand-curated alias table) and course/`Subject`-grain
  mismatch, not a duration field left on the table. There is no unused signal here to revive for
  this feature even if D4 were reopened for its original purpose.
- **arshkon LinkedIn postings set**: `postings.csv` carries `formatted_experience_level` (the
  seniority an *employer* requires for the role) and free-text `description`, but no course
  length, certification duration, or any per-skill learning-time field. Its skill join
  (`job_skills.csv` → 36-value `skill_abr`) is already rejected as a job-function taxonomy, not a
  skill vocabulary — see this doc's existing entry above.

### Why a hand-curated table is rejected, not offered as a fallback

Per CLAUDE.md's Bounded-AI discipline ("never let an LLM calculate the arbitrage score, a gap, a
join, or any ranking") and the README's "every number... comes straight from real, public
hiring-market research, not an AI model's opinion, not a guess," a manually authored
"Kubernetes = 3 months" lookup table would violate the same identity even with zero LLM calls
involved — it is an invented number sitting beside numbers that are traceable to source CSVs, and
it fails exactly like a bad score would: silently, looking equally plausible whether right or
wrong. This is rejected on the same grounds as an LLM-guessed score, not merely deprioritized.

### What would make this viable in a future version

A real, licensed, **per-skill-grain** (not per-course, not per-`Subject`) learning-duration
dataset — e.g., aggregated time-to-certification/time-to-competency figures across multiple
providers, not one vendor's arbitrary self-reported course length — that also clears a defensible
vocabulary-match rate against the 141-skill core. Naming drift is the likely failure point again
(Coursera's expanded-form names vs. this project's acronym-heavy vocabulary), especially for
modern GenAI/cloud-native skills. No such dataset is currently in `data/raw/` or has been located.
Genuinely uncertain whether one exists publicly at the rigor this project requires — worth
recording as a real open question rather than searching indefinitely on each re-ask.

### Park conditions

None currently known. Re-open only if a **named, specific** dataset candidate surfaces meeting
the per-skill grain + real-observation (not single-vendor-authored) bar above — evaluate it with
the same live vocabulary-join test Coursera got before writing any SPEC.
