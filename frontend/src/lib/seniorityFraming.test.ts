// RED phase (spec 028): `frontend/src/lib/seniorityFraming.ts` does not exist yet — Redwood
// builds it next to make these tests pass. This file locks the contract:
//
//   export const SENIORITY_GRADIENT: Record<DatamataCategory, SeniorityGradient>
//   export const ROLE_TO_DATAMATA_CATEGORY: Record<Role, DatamataCategory>
//   export const CATEGORY_LABEL: Record<DatamataCategory, string>
//   export function getSeniorityFraming(role: Role, seniority: SeniorityLevel): string | null
//
// Data-layer only (no UI — that's spec 029). See specs/028-seniority-role-picker.md for the full
// [SPEC]; this suite mirrors its "Edge Cases" list 1:1 plus the extra mid/senior + non-engineering
// fixture coverage called out in the handoff.
//
// FIXTURE-VALIDATION NOTE (judgment call, flagged per the handoff): only two of six
// `SENIORITY_GRADIENT` categories have real, live-verified figures in
// `data/dataset-evaluations.md` as of this writing —
//   engineering: entry 3.0, mid 7.3, senior 11.0
//   security:    entry 0.0, senior 5.6 (mid NOT validated)
// Byte-for-byte fixture assertions below are restricted to exactly those validated numbers.
// `ai`/`data`/`devops`/`product` (all three levels) and `security`'s `mid_pct` are exercised only
// structurally (shape, monotonicity, label rendering) — never a hardcoded fabricated number, per
// the SPEC's Constraints ("an absent figure blocks completion, it does not get estimated"). This
// also means the `mid` template fixture below deliberately uses `engineering` (not `security`,
// whose mid_pct is unknown) and the `senior`/second-`entry` fixtures deliberately use `security`
// (not `ai`/`data`/`devops`/`product`, none of which are validated at all).
//
// Number-rendering judgment call: the templates interpolate `{entry_pct}` etc. directly from the
// numeric field (per the SPEC's literal template strings, no `.toFixed()` mentioned) — so a whole
// number like `3.0` is expected to render as the JS default `String(3.0) === '3'`, not `'3.0'`.
// If Redwood's implementation formats these differently (e.g. always one decimal place), the
// byte-for-byte fixture tests below will (correctly) go red for that reason and the discrepancy
// must be reconciled against this SPEC's literal template text, not silently patched here.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ROLES } from './roles'
import {
  SENIORITY_GRADIENT,
  ROLE_TO_DATAMATA_CATEGORY,
  CATEGORY_LABEL,
  getSeniorityFraming,
  type DatamataCategory,
} from './seniorityFraming'

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_PATH = path.join(LIB_DIR, 'seniorityFraming.ts')

const ALL_SIX_CATEGORIES: DatamataCategory[] = ['ai', 'data', 'devops', 'engineering', 'product', 'security']

// The 5 categories that hold the strict `entry_pct <= mid_pct <= senior_pct` ordering on real,
// live-extracted data (2026-07-28 pull, data/raw/archive/ai-requirements-index.csv). `data` is
// deliberately excluded from this list and asserted separately below — see the dedicated
// `SENIORITY_GRADIENT.data` describe block for the evidenced reason (NOT a blanket loosening: if
// a future data refresh regresses strict ordering in any of these 5, this must still catch it).
const STRICTLY_MONOTONIC_CATEGORIES: DatamataCategory[] = ALL_SIX_CATEGORIES.filter(
  (category) => category !== 'data',
)

const SNAPSHOT_DATE = '2026-07-22'

// ---------------------------------------------------------------------------------------------
// Edge case 1: exact `entry` template fixture, filled with engineering's validated figures.
// ---------------------------------------------------------------------------------------------

describe('getSeniorityFraming — entry template (byte-for-byte, engineering, validated figures)', () => {
  it('renders the exact entry-level sentence for a role mapped to engineering', () => {
    const result = getSeniorityFraming('Backend', 'entry')

    expect(result).toBe(
      'AI requirements in engineering roles are concentrated at senior level and nearly absent ' +
        'at entry: just 3% of entry-level postings vs 11% at senior (Datamata AI Requirements ' +
        'Index, 2026-07-22).',
    )
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 2: determinism — identical arguments, byte-identical output.
// ---------------------------------------------------------------------------------------------

describe('getSeniorityFraming — determinism', () => {
  it('returns byte-identical output across repeated calls with identical arguments', () => {
    const first = getSeniorityFraming('Backend', 'entry')
    const second = getSeniorityFraming('Backend', 'entry')

    expect(first).toBe(second)
  })

  it('is deterministic for a different role/seniority pair too (Security / senior)', () => {
    const first = getSeniorityFraming('Security', 'senior')
    const second = getSeniorityFraming('Security', 'senior')

    expect(first).toBe(second)
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 3: exhaustive mapping — every one of the 15 Role values has an entry, as a set.
// ---------------------------------------------------------------------------------------------

describe('ROLE_TO_DATAMATA_CATEGORY — exhaustive mapping', () => {
  it('has exactly the 15 Role values as keys, order-independent (mirrors roles.test.ts)', () => {
    expect(new Set(Object.keys(ROLE_TO_DATAMATA_CATEGORY))).toEqual(new Set(ROLES))
  })

  it('maps every role to one of the six DatamataCategory values', () => {
    for (const role of ROLES) {
      expect(ALL_SIX_CATEGORIES).toContain(ROLE_TO_DATAMATA_CATEGORY[role])
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 4: monotonic gradient invariant — entry_pct <= mid_pct <= senior_pct, 5 of 6
// categories strictly, `data` as a named exception. Real, live-extracted figures landed
// 2026-07-28 (data/raw/archive/ai-requirements-index.csv) and `data` genuinely reads
// entry_pct=7.4 > mid_pct=7.2 — investigated and resolved as sample-size noise (see
// SENIORITY_GRADIENT.data's own comment in seniorityFraming.ts and dataset-evaluations.md's
// seniority-gradient section for the full writeup: data/entry's pool is ~370-380 listings vs.
// data/mid's ~3,800-4,300 — ~10x smaller — giving entry an SE of ~1.3pp; entry and mid trade
// places across the surrounding week's snapshots; senior_pct sits robustly and consistently
// above both on every date). This is a single, evidenced, named exception for `data` — NOT a
// blanket loosened tolerance. The other 5 categories still assert strict, zero-tolerance
// ordering and must keep catching any future real regression.
// ---------------------------------------------------------------------------------------------

describe('SENIORITY_GRADIENT — monotonic gradient invariant (near-INVARIANT lane)', () => {
  it('has an entry for all six DatamataCategory values', () => {
    expect(new Set(Object.keys(SENIORITY_GRADIENT))).toEqual(new Set(ALL_SIX_CATEGORIES))
  })

  it.each(STRICTLY_MONOTONIC_CATEGORIES)(
    'entry_pct <= mid_pct <= senior_pct for category %s (strict, zero tolerance)',
    (category) => {
      const gradient = SENIORITY_GRADIENT[category]

      expect(gradient.entry_pct).toBeLessThanOrEqual(gradient.mid_pct)
      expect(gradient.mid_pct).toBeLessThanOrEqual(gradient.senior_pct)
    },
  )

  it('each entry\'s own category field matches the key it is stored under', () => {
    for (const category of ALL_SIX_CATEGORIES) {
      expect(SENIORITY_GRADIENT[category].category).toBe(category)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 4b: `data` category — named, evidenced exception to strict monotonicity.
//
// Real figures (2026-07-28 pull, tier=any_ai, snapshot_date=2026-07-22): entry_pct=7.4,
// mid_pct=7.2, senior_pct=11.0. entry_pct nominally exceeds mid_pct by 0.2 points, which would
// fail the strict `entry_pct <= mid_pct` check applied to the other 5 categories above.
//
// Investigated and resolved as sample-size noise, not a genuine inversion:
//   - `data`/entry's pool is ~370-380 total listings; `data`/mid's pool is ~3,800-4,300 — ~10x
//     larger. At entry's sample size (~375), the standard error is ~1.3 percentage points —
//     an order of magnitude larger than the observed 0.2pp gap.
//   - Across the surrounding week's snapshots, entry and mid trade places day to day:
//     07-17 entry(8.0)>mid(7.4); 07-18 entry(7.2)<mid(7.5); 07-19 entry(6.9)<mid(7.4);
//     07-22 entry(7.4)>mid(7.2) — statistically indistinguishable in either direction.
//   - `senior_pct` (11.0) sits robustly and consistently ABOVE both entry and mid on every date
//     in that window — that half of the gradient claim (AI requirements concentrate at senior
//     level) is real and not noise for `data`.
//
// So instead of asserting the (unreliable) strict entry<=mid step for `data`, this test asserts
// the two things that ARE true and load-bearing: (1) senior clearly dominates both entry and
// mid, and (2) the entry/mid gap is small enough to be plausible noise relative to the ~1.3pp SE
// — bounded at 1 point, chosen to sit comfortably under that SE (so a gap here would need to
// nearly double, i.e. become a ~1-SE event, before this test would stop treating it as noise),
// while still being tight enough to catch a real, non-noise-scale inversion (e.g. entry
// nominally "beating" mid by several points) that the strict check would otherwise have caught.
// See SENIORITY_GRADIENT.data's own comment in seniorityFraming.ts and dataset-evaluations.md's
// seniority-gradient section (2026-07-28 update) for the full writeup this test summarizes.
// ---------------------------------------------------------------------------------------------

describe('SENIORITY_GRADIENT.data — named exception to strict monotonicity (evidenced, not silent)', () => {
  it('carries the true, sourced, un-adjusted figures: entry_pct=7.4, mid_pct=7.2, senior_pct=11.0', () => {
    const gradient = SENIORITY_GRADIENT.data

    expect(gradient.entry_pct).toBe(7.4)
    expect(gradient.mid_pct).toBe(7.2)
    expect(gradient.senior_pct).toBe(11.0)
  })

  it('does NOT satisfy strict entry_pct <= mid_pct (the real, sourced 0.2pp inversion)', () => {
    const gradient = SENIORITY_GRADIENT.data

    expect(gradient.entry_pct).toBeGreaterThan(gradient.mid_pct)
  })

  it('senior_pct is still robustly above both entry_pct and mid_pct — the part of the claim that IS robust', () => {
    const gradient = SENIORITY_GRADIENT.data

    expect(gradient.senior_pct).toBeGreaterThan(gradient.entry_pct)
    expect(gradient.senior_pct).toBeGreaterThan(gradient.mid_pct)
  })

  it('the entry/mid gap is small enough to be plausibly sample-size noise (bound: 1pp, vs. ~1.3pp SE at entry\'s ~375-listing pool)', () => {
    const gradient = SENIORITY_GRADIENT.data

    expect(Math.abs(gradient.entry_pct - gradient.mid_pct)).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 5: Bounded-AI structural boundary — no import from the scoring/gap pipeline.
// This is the load-bearing test: it proves the file is structurally unreachable from
// computeSkillGap / the Arbitrage Score / Supabase, not merely conventionally unused by them.
// Same source-text-assertion technique as tests/test_frontend_read_layer_migration.py, ported to
// TS (mirrors the `readFileSync` idiom frontend/src/styles/colorTokens.test.ts already uses).
// ---------------------------------------------------------------------------------------------

describe('seniorityFraming.ts — Bounded-AI structural import boundary', () => {
  it('imports no forbidden module from the scoring/gap/db pipeline', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8')

    expect(source).not.toMatch(/from\s+['"]\.\/gap['"]/)
    expect(source).not.toMatch(/from\s+['"]\.\/supabaseClient['"]/)
    expect(source).not.toMatch(/from\s+['"]\.\/narrate['"]/)
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 6: all 6 CATEGORY_LABEL values render correctly (capitalization matters).
// ---------------------------------------------------------------------------------------------

describe('CATEGORY_LABEL — exact capitalization for all six categories', () => {
  it('matches the SPEC\'s exact label table', () => {
    expect(CATEGORY_LABEL).toEqual({
      ai: 'AI',
      data: 'data',
      devops: 'DevOps',
      engineering: 'engineering',
      product: 'product',
      security: 'security',
    })
  })

  it('"ai" renders as "AI", never lowercase "ai" (would read as a typo mid-sentence)', () => {
    expect(CATEGORY_LABEL.ai).toBe('AI')
    expect(CATEGORY_LABEL.ai).not.toBe('ai')
  })

  it('"devops" renders as "DevOps", never "Devops" or "devops"', () => {
    expect(CATEGORY_LABEL.devops).toBe('DevOps')
    expect(CATEGORY_LABEL.devops).not.toBe('Devops')
    expect(CATEGORY_LABEL.devops).not.toBe('devops')
  })

  it('renders the DevOps label correctly inside a real sentence, via a role that maps to devops', () => {
    // DevOps / Cloud / SRE -> devops is the only role in the 15-role union mapped to this
    // category, so this is the one reachable end-to-end check for CATEGORY_LABEL.devops. Only
    // the label placement is asserted (structural), not the exact pct figures, which are not yet
    // live-verified for the devops category (see fixture-validation note at top of file).
    const result = getSeniorityFraming('DevOps / Cloud / SRE', 'entry')

    expect(result).not.toBeNull()
    expect(result).toContain('AI requirements in DevOps roles')
    expect(result).not.toContain('devops roles')
    expect(result).not.toContain('Devops roles')
  })
})

// ---------------------------------------------------------------------------------------------
// Edge case 7: every snapshot_date is the literal string '2026-07-22' (frozen-date regression).
// ---------------------------------------------------------------------------------------------

describe('SENIORITY_GRADIENT — frozen snapshot_date', () => {
  it.each(ALL_SIX_CATEGORIES)('category %s is stamped 2026-07-22', (category) => {
    expect(SENIORITY_GRADIENT[category].snapshot_date).toBe(SNAPSHOT_DATE)
  })

  it('never uses Date.now() or any other date at runtime (all six frozen identically)', () => {
    const dates = new Set(ALL_SIX_CATEGORIES.map((c) => SENIORITY_GRADIENT[c].snapshot_date))
    expect(dates).toEqual(new Set([SNAPSHOT_DATE]))
  })
})

// ---------------------------------------------------------------------------------------------
// Additional fixture coverage per the handoff: mid + senior templates (not just entry), and a
// non-engineering category mapping (Security), restricted to the figures already validated in
// data/dataset-evaluations.md (engineering full triple; security entry+senior).
// ---------------------------------------------------------------------------------------------

describe('getSeniorityFraming — mid template (byte-for-byte, engineering, validated figures)', () => {
  it('renders the exact mid-level sentence for a role mapped to engineering', () => {
    const result = getSeniorityFraming('Full Stack', 'mid')

    expect(result).toBe(
      'AI requirements in engineering roles rise with seniority — 7.3% of mid-level postings, ' +
        'between 3% at entry and 11% at senior (Datamata AI Requirements Index, 2026-07-22).',
    )
  })
})

describe('getSeniorityFraming — non-engineering category (Security -> security), validated figures only', () => {
  it("maps 'Security' to the security category, not engineering", () => {
    expect(ROLE_TO_DATAMATA_CATEGORY.Security).toBe('security')
  })

  it('renders the exact entry-level sentence for Security, using security\'s validated entry/senior figures', () => {
    const result = getSeniorityFraming('Security', 'entry')

    expect(result).toBe(
      'AI requirements in security roles are concentrated at senior level and nearly absent at ' +
        'entry: just 0% of entry-level postings vs 5.6% at senior (Datamata AI Requirements ' +
        'Index, 2026-07-22).',
    )
  })

  it('renders the exact senior-level sentence for Security, using security\'s validated entry/senior figures', () => {
    // The `senior` template only interpolates senior_pct and entry_pct (never mid_pct), so this
    // is byte-for-byte assertable even though security's mid_pct is not yet live-verified.
    const result = getSeniorityFraming('Security', 'senior')

    expect(result).toBe(
      'AI requirements in security roles concentrate at your level: 5.6% of senior postings, up ' +
        'from 0% at entry (Datamata AI Requirements Index, 2026-07-22).',
    )
  })

  it('does NOT byte-for-byte assert the security mid sentence (mid_pct not yet live-verified) — structural check only', () => {
    const result = getSeniorityFraming('Security', 'mid')

    expect(result).not.toBeNull()
    expect(result).toContain('AI requirements in security roles')
    expect(result).toContain('mid-level postings')
    // entry/senior figures ARE validated and must still appear correctly even in the mid template.
    expect(result).toContain('0% at entry')
    expect(result).toContain('5.6% at senior')
  })
})

// ---------------------------------------------------------------------------------------------
// Bounded-AI: getSeniorityFraming is a pure, synchronous function (never touches gap/score data).
// ---------------------------------------------------------------------------------------------

describe('getSeniorityFraming — purity', () => {
  it('is not an async function and never returns a Promise', () => {
    expect(getSeniorityFraming.constructor.name).not.toBe('AsyncFunction')
    const result = getSeniorityFraming('Backend', 'entry')
    expect(result).not.toBeInstanceOf(Promise)
  })
})
