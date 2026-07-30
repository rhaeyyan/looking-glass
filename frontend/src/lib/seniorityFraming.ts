// Spec 028 — Seniority gradient framing (data-layer only, no UI; see specs/028-seniority-role-picker.md).
//
// Packages the ONE cut of the Datamata AI Requirements Index that survives the pool-growth
// artifact analysis in `data/dataset-evaluations.md` (the seniority gradient's *ordering*,
// per category, @ snapshot_date 2026-07-22) as static, checked-in data — same idiom as spec 025's
// `ALIAS_TABLE`. This module is deliberately import-isolated: it must never import from `./gap`,
// `./supabaseClient`, or `./narrate`, so the seniority value a user picks can never reach
// `computeSkillGap`, the Arbitrage Score, or any Supabase query (Bounded-AI boundary, enforced
// structurally by a source-text test in seniorityFraming.test.ts, not just by convention).
//
// ---------------------------------------------------------------------------------------------
// PROVENANCE FLAG — read before editing SENIORITY_GRADIENT.
//
// All 18 cells below are now REAL, live-extracted figures — the raw file the SPEC's Constraints
// section calls for has landed in this checkout at
// `data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv` (this is a gitignored,
// local-only path that has moved at least three times across sessions — briefly `data/raw/archive/`,
// then `data/raw/ai-requirements/`, now back to matching the original citation in
// `data/dataset-evaluations.md`; re-verify this path before trusting it on a fresh checkout).
// Extracted 2026-07-28 via:
//   grep -E '^2026-07-22,(ai|data|devops|engineering|product|security),(entry|mid|senior),any_ai,' \
//     data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv
// i.e. `snapshot_date=2026-07-22`, `tier=any_ai`, one row per category x seniority, `pct` column.
// The 3 previously-cited-as-REAL values (engineering's full triple; security's entry+senior;
// devops's entry) were cross-checked against this raw pull and match exactly — no discrepancy.
//
// FINDING — flagged, not silently reconciled (per the SPEC's Constraints), then investigated and
// resolved (2026-07-28): the `data` category's real figures are entry_pct=7.4, mid_pct=7.2,
// senior_pct=11.0 — entry_pct nominally > mid_pct, which appears to BREAK the monotonic
// `entry_pct <= mid_pct <= senior_pct` ordering that dataset-evaluations.md line 75 claims holds
// "in all 6 categories" (that claim was made before this category's real figures were ever
// pulled). Direct investigation against the raw CSV found this is sample-size noise, not a real
// inversion: `data`/entry's pool (~370-380 total listings) is ~10x smaller than `data`/mid's
// (~3,800-4,300), giving entry an SE of ~1.3 percentage points at that sample size — entry and mid
// trade places day to day across the surrounding week (see the `data` cell's own comment below for
// the full readings). `senior_pct` remains robustly and consistently above both entry and mid on
// every date in that window, so the dataset's core claim (AI requirements concentrate at senior
// level) survives — only the entry-vs-mid step of the "monotonic in all 6 categories" claim needed
// narrowing to "5 of 6 categories monotonic; `data` shows entry≈mid, statistically tied at that
// sample size, with a real senior jump" (see dataset-evaluations.md for the full writeup). The
// SENIORITY_GRADIENT.data cell below still carries the true, sourced 7.4/7.2/11.0 values (not
// adjusted to force monotonicity); `seniorityFraming.test.ts` is expected to encode `data` as a
// named exception rather than assert the blanket monotonic invariant against it (Cypress, spec 028
// follow-up).
// ---------------------------------------------------------------------------------------------

import type { Role } from './roles'

export type DatamataCategory = 'ai' | 'data' | 'devops' | 'engineering' | 'product' | 'security'
export type SeniorityLevel = 'entry' | 'mid' | 'senior'

interface SeniorityGradient {
  category: DatamataCategory
  snapshot_date: string // frozen '2026-07-22' — the validated pull in dataset-evaluations.md
  entry_pct: number
  mid_pct: number
  senior_pct: number
}

const SNAPSHOT_DATE = '2026-07-22'

export const SENIORITY_GRADIENT: Record<DatamataCategory, SeniorityGradient> = {
  // REAL — data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv @ 2026-07-22, tier=any_ai.
  ai: { category: 'ai', snapshot_date: SNAPSHOT_DATE, entry_pct: 35.0, mid_pct: 40.2, senior_pct: 46.7 },
  // REAL — data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv @ 2026-07-22, tier=any_ai.
  // NOMINAL INVERSION, RESOLVED AS SAMPLE-SIZE NOISE (2026-07-28): entry_pct (7.4) > mid_pct
  // (7.2) here, but this is not a real inversion of the entry<=mid<=senior gradient — it's noise.
  // The `data`/entry pool (~370-380 total listings) is ~10x smaller than `data`/mid (~3,800-4,300),
  // so entry's standard error is ~1.3 percentage points at that sample size (p≈0.07); entry and mid
  // trade places across the surrounding week's snapshots (07-17 entry 8.0>mid 7.4; 07-18 entry
  // 7.2<mid 7.5; 07-19 entry 6.9<mid 7.4; 07-22 entry 7.4>mid 7.2) — statistically indistinguishable
  // either direction, not a genuine ordering. senior_pct (11.0), by contrast, sits robustly and
  // consistently above both entry and mid on every date in that window — the dataset's core
  // validated claim (AI requirements concentrate at senior level) holds for `data`; it's only the
  // entry-vs-mid *ordering* that's too noisy to resolve either way. Values below are the true,
  // sourced 7.4/7.2/11.0 — not adjusted to force monotonicity. Documented as a category-specific
  // exception, not a blanket tolerance change; see dataset-evaluations.md's seniority-gradient
  // section for the full writeup. seniorityFraming.test.ts encodes this exception (Cypress, spec
  // 028 follow-up), not a code fix here.
  data: { category: 'data', snapshot_date: SNAPSHOT_DATE, entry_pct: 7.4, mid_pct: 7.2, senior_pct: 11.0 },
  // REAL — data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv @ 2026-07-22, tier=any_ai. entry_pct (0.0)
  // matches dataset-evaluations.md line 87's prior citation exactly.
  devops: { category: 'devops', snapshot_date: SNAPSHOT_DATE, entry_pct: 0.0, mid_pct: 3.1, senior_pct: 4.3 },
  // REAL — data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv @ 2026-07-22, tier=any_ai. Matches
  // dataset-evaluations.md's worked example exactly (3.0/7.3/11.0).
  engineering: { category: 'engineering', snapshot_date: SNAPSHOT_DATE, entry_pct: 3.0, mid_pct: 7.3, senior_pct: 11.0 },
  // REAL — data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv @ 2026-07-22, tier=any_ai.
  product: { category: 'product', snapshot_date: SNAPSHOT_DATE, entry_pct: 2.8, mid_pct: 7.5, senior_pct: 13.4 },
  // REAL — data/raw/AI-Skills-in-Job-Requirements/ai-requirements-index.csv @ 2026-07-22, tier=any_ai. entry_pct (0.0)
  // and senior_pct (5.6) match dataset-evaluations.md's prior citation exactly; mid_pct (1.7) is
  // newly extracted — an unvalidated placeholder estimate of 2.5 stood here before this pull.
  security: { category: 'security', snapshot_date: SNAPSHOT_DATE, entry_pct: 0.0, mid_pct: 1.7, senior_pct: 5.6 },
}

// Hand-authored, approximate, many-to-one (15 roles -> 6 categories). Used ONLY to select which
// framing sentence to show — never a score input, never a join key. Authored by Cedar in
// specs/028-seniority-role-picker.md; reproduced here verbatim, not re-derived.
export const ROLE_TO_DATAMATA_CATEGORY: Record<Role, DatamataCategory> = {
  Backend: 'engineering',
  'Full Stack': 'engineering',
  'Data Scientist / ML': 'data',
  'Data Engineer': 'data',
  'Software Engineer': 'engineering',
  'DevOps / Cloud / SRE': 'devops',
  Frontend: 'engineering',
  'Data Analyst / BI': 'data',
  Mobile: 'engineering',
  Security: 'security',
  'QA / Test': 'engineering',
  'Business Analyst': 'product',
  'Designer (UX/UI)': 'product',
  'Product Manager': 'product',
  'Project / Program Mgr': 'product',
}

export const CATEGORY_LABEL: Record<DatamataCategory, string> = {
  ai: 'AI',
  data: 'data',
  devops: 'DevOps',
  engineering: 'engineering',
  product: 'product',
  security: 'security',
}

export function getSeniorityFraming(role: Role, seniority: SeniorityLevel): string | null {
  const category = ROLE_TO_DATAMATA_CATEGORY[role]
  if (category === undefined) return null

  const gradient = SENIORITY_GRADIENT[category]
  if (gradient === undefined) return null

  const label = CATEGORY_LABEL[category]
  const { entry_pct, mid_pct, senior_pct, snapshot_date } = gradient

  switch (seniority) {
    case 'entry':
      return (
        `AI requirements in ${label} roles are concentrated at senior level and nearly absent ` +
        `at entry: just ${entry_pct}% of entry-level postings vs ${senior_pct}% at senior ` +
        `(Datamata AI Requirements Index, ${snapshot_date}).`
      )
    case 'mid':
      return (
        `AI requirements in ${label} roles rise with seniority — ${mid_pct}% of mid-level ` +
        `postings, between ${entry_pct}% at entry and ${senior_pct}% at senior (Datamata AI ` +
        `Requirements Index, ${snapshot_date}).`
      )
    case 'senior':
      return (
        `AI requirements in ${label} roles concentrate at your level: ${senior_pct}% of senior ` +
        `postings, up from ${entry_pct}% at entry (Datamata AI Requirements Index, ${snapshot_date}).`
      )
    default:
      return null
  }
}
