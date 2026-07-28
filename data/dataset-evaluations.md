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
| **Seniority gradient (ordering)** | **Yes** | monotonic in all 6 categories; order survives 07-10 while levels drop ~2.5x — entry/mid/senior share one pool at one instant, so dilution is common-mode |
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
