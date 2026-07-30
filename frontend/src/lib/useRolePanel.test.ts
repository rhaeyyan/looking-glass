import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { RoleSkillRow } from './supabaseClient'
import { extractResumeSkills } from './resumeSkills'
import { computeSkillGap } from './gap'
import { narrateTopGaps } from './narrate'
import { normalizeSkillName } from './normalize'

// RED phase (spec 035) — `useRolePanel.ts` does not exist yet, so importing it below fails at
// module resolution ("Cannot find module ...useRolePanel"), which is the correct, expected red
// for this file until Redwood builds it. Nothing here should be "fixed" by editing this test to
// avoid that failure.
//
// `./supabaseClient` is mocked wholesale (same pattern as `App.test.tsx`) so no network/credentials
// ever load. `fetchRoleSkillProfile` is stubbed to return a manually-controlled ("deferred")
// promise per call, queued in call order, so a test can resolve any given call independently of
// when it was made — this is what lets the out-of-order resolution the SPEC requires be expressed
// deterministically rather than via real timing.
vi.mock('./supabaseClient', () => ({
  fetchRoleSkillProfile: vi.fn(),
}))

import { fetchRoleSkillProfile } from './supabaseClient'
// Not yet created — this import is the genuine red until Redwood builds
// frontend/src/lib/useRolePanel.ts (spec 035, [SPEC] Files item 1).
import { useRolePanel } from './useRolePanel'

const mockFetch = vi.mocked(fetchRoleSkillProfile)

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function makeRow(role: string, skillName: string, overrides: Partial<RoleSkillRow> = {}): RoleSkillRow {
  return {
    role_family: role,
    skill_name_raw: skillName,
    skill_key: skillName.toLowerCase(),
    pct_of_role: 50,
    postings_with_skill: 100,
    demand_score: 50,
    scarcity_index: 50,
    arbitrage_score: 5,
    scarcity_data_completeness: 'complete',
    d3_corroborated: true,
    d3_pct_of_all_postings: 5,
    ...overrides,
  }
}

// Queue of {role, deferred} in fetch-call order (not per-role — the same role can be fetched more
// than once, e.g. after a role change and back), so any individual call can be resolved
// independently of the others, in any order the test chooses.
let fetchQueue: Array<{ role: string; deferred: Deferred<RoleSkillRow[]> }>

beforeEach(() => {
  fetchQueue = []
  mockFetch.mockReset()
  mockFetch.mockImplementation((role: string) => {
    const deferred = createDeferred<RoleSkillRow[]>()
    fetchQueue.push({ role, deferred })
    return deferred.promise
  })
})

describe('useRolePanel — per-instance data isolation (spec 035)', () => {
  it(
    'keeps each of 3 concurrently-mounted instances scoped to only its own most-recent role, ' +
      'even when fetches resolve out of order and a role changes mid-flight (mirrors spec 036\'s ' +
      'compare-mode call pattern)',
    async () => {
      // Three independent hook instances, each given a different role — exactly how spec 036 will
      // call `useRolePanel` up to 3 times simultaneously.
      const instance0 = renderHook(() => useRolePanel('Backend'))
      const instance1 = renderHook(() => useRolePanel('Frontend'))
      const instance2 = renderHook(() => useRolePanel('Data Engineer'))

      // Each instance's own initial fetch fired exactly once, for its own role, in mount order.
      expect(fetchQueue).toHaveLength(3)
      expect(fetchQueue[0].role).toBe('Backend')
      expect(fetchQueue[1].role).toBe('Frontend')
      expect(fetchQueue[2].role).toBe('Data Engineer')
      expect(instance0.result.current.status).toBe('loading')
      expect(instance1.result.current.status).toBe('loading')
      expect(instance2.result.current.status).toBe('loading')

      // Instance 0's role is changed to 'Mobile' BEFORE its own first ('Backend') fetch resolves —
      // this must fire a 4th fetch call (queue index 3) and must NOT touch instance 1 or 2.
      act(() => {
        instance0.result.current.loadRole('Mobile')
      })
      expect(fetchQueue).toHaveLength(4)
      expect(fetchQueue[3].role).toBe('Mobile')

      // Resolve OUT OF ORDER: instance 2's (Data Engineer) fetch settles first, before either
      // instance 0's or instance 1's.
      await act(async () => {
        fetchQueue[2].deferred.resolve([makeRow('Data Engineer', 'Airflow')])
      })
      await waitFor(() => expect(instance2.result.current.status).toBe('success'))
      expect(instance2.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['Airflow'])
      // Untouched siblings.
      expect(instance0.result.current.status).toBe('loading')
      expect(instance1.result.current.status).toBe('loading')

      // Now resolve instance 0's STALE 'Backend' fetch (the one made before the role change to
      // 'Mobile'). This must be discarded by the per-instance request-generation guard: instance 0
      // must NOT pick up Backend's rows, and must remain on its still-pending 'Mobile' fetch.
      await act(async () => {
        fetchQueue[0].deferred.resolve([makeRow('Backend', 'PostgreSQL')])
      })
      // Flush a tick for any errant microtask to (not) apply, then assert the stale response never
      // landed.
      await act(async () => {
        await Promise.resolve()
      })
      expect(instance0.result.current.rows).toEqual([])
      expect(instance0.result.current.status).toBe('loading')

      // Resolve instance 0's actual current ('Mobile') fetch.
      await act(async () => {
        fetchQueue[3].deferred.resolve([makeRow('Mobile', 'Swift')])
      })
      await waitFor(() => expect(instance0.result.current.status).toBe('success'))
      expect(instance0.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['Swift'])

      // Resolve instance 1's (Frontend) fetch last of all.
      await act(async () => {
        fetchQueue[1].deferred.resolve([makeRow('Frontend', 'React')])
      })
      await waitFor(() => expect(instance1.result.current.status).toBe('success'))
      expect(instance1.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['React'])

      // Final cross-check, all three instances at rest: each instance's rows reflect ONLY its own
      // most-recent role — never another instance's data, never the discarded stale value.
      expect(instance0.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['Swift'])
      expect(instance1.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['React'])
      expect(instance2.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['Airflow'])

      // haveSkillKeys is untouched by any of the above (no resume ever submitted) — must
      // independently be undefined per instance, never a leaked/shared `Set` reference.
      expect(instance0.result.current.haveSkillKeys).toBeUndefined()
      expect(instance1.result.current.haveSkillKeys).toBeUndefined()
      expect(instance2.result.current.haveSkillKeys).toBeUndefined()
    },
  )

  it("confirming instance0's submitted resume only mutates that instance's own haveSkillKeys/topGaps, never a sibling instance's", async () => {
    const instance0 = renderHook(() => useRolePanel('Backend'))
    const instance1 = renderHook(() => useRolePanel('Frontend'))

    await act(async () => {
      fetchQueue[0].deferred.resolve([
        makeRow('Backend', 'PostgreSQL', { skill_key: 'postgresql' }),
      ])
    })
    await waitFor(() => expect(instance0.result.current.status).toBe('success'))

    await act(async () => {
      fetchQueue[1].deferred.resolve([makeRow('Frontend', 'React', { skill_key: 'react' })])
    })
    await waitFor(() => expect(instance1.result.current.status).toBe('success'))

    // Two-step API (spec 038a): submitResume only stages a draft; confirmSkills (called here with
    // the unedited auto-detected set, same pattern as this file's own 038a zero-drift test) is
    // what actually computes haveSkillKeys/topGaps.
    act(() => {
      instance0.result.current.submitResume('I know PostgreSQL.')
    })
    act(() => {
      instance0.result.current.confirmSkills(
        instance0.result.current.pendingConfirmation!.autoDetectedKeys,
      )
    })

    expect(instance0.result.current.haveSkillKeys).toBeDefined()
    expect(instance0.result.current.haveSkillKeys?.has('postgresql')).toBe(true)

    // Sibling instance must be completely untouched by instance 0's submitResume/confirmSkills calls.
    expect(instance1.result.current.haveSkillKeys).toBeUndefined()
    expect(instance1.result.current.topGaps).toBeUndefined()
  })

  it('resets to idle with empty rows when the role is cleared (loadRole(\'\')), without affecting a sibling instance', async () => {
    const instance0 = renderHook(() => useRolePanel('Backend'))
    const instance1 = renderHook(() => useRolePanel('Frontend'))

    await act(async () => {
      fetchQueue[0].deferred.resolve([makeRow('Backend', 'PostgreSQL')])
    })
    await waitFor(() => expect(instance0.result.current.status).toBe('success'))

    act(() => {
      instance0.result.current.loadRole('')
    })

    expect(instance0.result.current.status).toBe('idle')
    expect(instance0.result.current.rows).toEqual([])
    // Clearing instance 0's role must not touch instance 1, which is still mid-flight on its own
    // 'Frontend' fetch.
    expect(instance1.result.current.status).toBe('loading')

    await act(async () => {
      fetchQueue[1].deferred.resolve([makeRow('Frontend', 'React')])
    })
    await waitFor(() => expect(instance1.result.current.status).toBe('success'))
    expect(instance1.result.current.rows.map((r) => r.skill_name_raw)).toEqual(['React'])
  })
})

// RED phase (spec 038a) — `pendingConfirmation`/`confirmSkills`/`cancelConfirmation` do not exist
// on the current hook's return shape yet: `submitResume` still runs extraction AND
// `computeSkillGap` in one step, synchronously setting `haveSkillKeys`/`topGaps` and never
// producing a `pendingConfirmation` at all. Every assertion below that reads
// `pendingConfirmation`/calls `confirmSkills`/calls `cancelConfirmation` is therefore expected to
// fail — either as a defined-vs-undefined mismatch, or as a "confirmSkills/cancelConfirmation is
// not a function" TypeError — until Redwood builds the split described in spec 038a. Nothing here
// should be "fixed" by editing the test to avoid that failure.
describe('useRolePanel — confirmation split (spec 038a)', () => {
  const CONFIRM_ROWS: RoleSkillRow[] = [
    makeRow('Backend', 'PostgreSQL', { skill_key: 'postgresql' }),
    makeRow('Backend', 'React', { skill_key: 'react' }),
    makeRow('Backend', 'Kubernetes', { skill_key: 'kubernetes' }),
  ]
  // Deliberately genuine negation ("I have not used Kubernetes") so extraction alone must NOT
  // affirm it — verified directly against the real, unmodified `extractResumeSkills` below, never
  // hand-waved/hardcoded.
  const RESUME_TEXT = 'I have shipped PostgreSQL and React projects. I have not used Kubernetes.'

  const VOCABULARY = CONFIRM_ROWS.map((r) => r.skill_name_raw)
  // Ground truth for what extraction alone produces — the real function, the real fixture text.
  const EXTRACTED_NAMES = extractResumeSkills(RESUME_TEXT, VOCABULARY)

  function rowKey(row: RoleSkillRow): string {
    return row.skill_key ?? normalizeSkillName(row.skill_name_raw)
  }

  const EXPECTED_AUTO_DETECTED_KEYS = new Set(
    CONFIRM_ROWS.filter((r) => EXTRACTED_NAMES.includes(r.skill_name_raw)).map(rowKey),
  )

  function sortedKeys(set: Set<string> | undefined): string[] {
    return set ? [...set].sort() : []
  }

  async function renderConfirmedInstance() {
    const instance = renderHook(() => useRolePanel('Backend'))
    await act(async () => {
      fetchQueue[0].deferred.resolve(CONFIRM_ROWS)
    })
    await waitFor(() => expect(instance.result.current.status).toBe('success'))
    return instance
  }

  it('submitResume populates pendingConfirmation from extraction alone, leaving haveSkillKeys/topGaps uncomputed until confirmSkills runs', async () => {
    const instance = await renderConfirmedInstance()

    act(() => {
      instance.result.current.submitResume(RESUME_TEXT)
    })

    expect(instance.result.current.pendingConfirmation).toBeDefined()
    expect(instance.result.current.pendingConfirmation?.rows).toEqual(CONFIRM_ROWS)
    expect(sortedKeys(instance.result.current.pendingConfirmation?.autoDetectedKeys)).toEqual(
      sortedKeys(EXPECTED_AUTO_DETECTED_KEYS),
    )

    // The gap computation must NOT have run yet — that is confirmSkills' job, not submitResume's.
    expect(instance.result.current.haveSkillKeys).toBeUndefined()
    expect(instance.result.current.topGaps).toBeUndefined()
  })

  it("confirmSkills with an edited set (uncheck a correct match, add a missed one) reflects the EDIT, not the auto-detected set", async () => {
    const instance = await renderConfirmedInstance()

    act(() => {
      instance.result.current.submitResume(RESUME_TEXT)
    })
    expect(instance.result.current.pendingConfirmation).toBeDefined()

    // Edited set: uncheck 'react' (extraction correctly matched it), add 'kubernetes' (extraction
    // missed it because of the genuine negation cue above).
    const editedKeys = new Set(['postgresql', 'kubernetes'])
    expect(sortedKeys(editedKeys)).not.toEqual(sortedKeys(EXPECTED_AUTO_DETECTED_KEYS))

    act(() => {
      instance.result.current.confirmSkills(editedKeys)
    })

    // Independently-derived expectation per the SPEC's own description of confirmSkills: re-slice
    // CONFIRM_ROWS by the EDITED keys (never the auto-detected ones), hand that skill_name_raw
    // subset to the real, unmodified computeSkillGap/narrateTopGaps.
    const expectedNames = CONFIRM_ROWS.filter((r) => editedKeys.has(rowKey(r))).map(
      (r) => r.skill_name_raw,
    )
    const expectedGap = computeSkillGap(CONFIRM_ROWS, expectedNames)
    const expectedTopGaps = narrateTopGaps(expectedGap.rows, expectedGap.haveSkillKeys)

    expect(sortedKeys(instance.result.current.haveSkillKeys)).toEqual(
      sortedKeys(expectedGap.haveSkillKeys),
    )
    // React must NOT be in the confirmed have-set even though extraction matched it — the edit
    // (unchecking it) wins.
    expect(instance.result.current.haveSkillKeys?.has('react')).toBe(false)
    // Kubernetes MUST be in the confirmed have-set even though extraction missed it — the edit
    // (checking it) wins.
    expect(instance.result.current.haveSkillKeys?.has('kubernetes')).toBe(true)
    expect(instance.result.current.topGaps).toEqual(expectedTopGaps)

    // The draft is consumed once confirmed.
    expect(instance.result.current.pendingConfirmation).toBeUndefined()
  })

  it("confirming the auto-detected set UNEDITED reproduces today's single-step submitResume output byte-for-byte (zero-drift regression net)", async () => {
    // "Today's" (pre-038a) behavior, computed directly against the same unmodified functions —
    // this is the independent oracle the SPEC's regression requirement demands, not a copy of
    // whatever the split hook happens to produce.
    const todaysGap = computeSkillGap(CONFIRM_ROWS, EXTRACTED_NAMES)
    const todaysTopGaps = narrateTopGaps(todaysGap.rows, todaysGap.haveSkillKeys)

    const instance = await renderConfirmedInstance()

    act(() => {
      instance.result.current.submitResume(RESUME_TEXT)
    })
    const autoDetected = instance.result.current.pendingConfirmation?.autoDetectedKeys

    act(() => {
      instance.result.current.confirmSkills(autoDetected as Set<string>)
    })

    expect(sortedKeys(instance.result.current.haveSkillKeys)).toEqual(
      sortedKeys(todaysGap.haveSkillKeys),
    )
    expect(instance.result.current.topGaps).toEqual(todaysTopGaps)
  })

  // RED (spec 038a amendment) — `submitResumeAutoConfirm` does not exist yet on the current
  // hook's return shape. It is a new *permanent* export (App.tsx's compare-mode call sites'
  // steady-state path, not a shim to delete once 038b lands): one synchronous call that runs
  // extraction AND computeSkillGap/narrateTopGaps immediately, bypassing `pendingConfirmation`
  // entirely — exactly what the retired single-step `submitResume` used to do inline. This test
  // is expected to fail as "submitResumeAutoConfirm is not a function" until Redwood adds it.
  it("submitResumeAutoConfirm reproduces today's exact single-step output synchronously, bypassing pendingConfirmation entirely", async () => {
    // Independent oracle: the same pre-038a algorithm, computed directly against the real,
    // unmodified extractResumeSkills/computeSkillGap/narrateTopGaps — not a copy of whatever the
    // hook happens to produce.
    const todaysGap = computeSkillGap(CONFIRM_ROWS, EXTRACTED_NAMES)
    const todaysTopGaps = narrateTopGaps(todaysGap.rows, todaysGap.haveSkillKeys)

    const instance = await renderConfirmedInstance()

    act(() => {
      instance.result.current.submitResumeAutoConfirm(RESUME_TEXT)
    })

    // Bypasses the draft entirely — never stages a pendingConfirmation on the way.
    expect(instance.result.current.pendingConfirmation).toBeUndefined()
    expect(sortedKeys(instance.result.current.haveSkillKeys)).toEqual(
      sortedKeys(todaysGap.haveSkillKeys),
    )
    expect(instance.result.current.topGaps).toEqual(todaysTopGaps)
  })

  it('cancelConfirmation discards the draft and leaves haveSkillKeys/topGaps uncomputed, returning to pre-submission idle shape', async () => {
    const instance = await renderConfirmedInstance()

    act(() => {
      instance.result.current.submitResume(RESUME_TEXT)
    })
    expect(instance.result.current.pendingConfirmation).toBeDefined()

    act(() => {
      instance.result.current.cancelConfirmation()
    })

    expect(instance.result.current.pendingConfirmation).toBeUndefined()
    expect(instance.result.current.haveSkillKeys).toBeUndefined()
    expect(instance.result.current.topGaps).toBeUndefined()
    // Cancellation is scoped only to the confirmation draft — it must not touch the already-
    // fetched role rows or trigger a re-fetch/role change.
    expect(instance.result.current.status).toBe('success')
    expect(instance.result.current.rows).toEqual(CONFIRM_ROWS)
  })

  it('loadRole discards an outstanding pendingConfirmation rather than letting it be confirmed against the new role', async () => {
    const instance = await renderConfirmedInstance()

    act(() => {
      instance.result.current.submitResume(RESUME_TEXT)
    })
    expect(instance.result.current.pendingConfirmation).toBeDefined()

    act(() => {
      instance.result.current.loadRole('Mobile')
    })

    // The stale draft from role 'Backend' must not survive into role 'Mobile' — extends spec
    // 035's per-instance request-generation isolation guard rather than a second,
    // independently-drifting mechanism.
    expect(instance.result.current.pendingConfirmation).toBeUndefined()
    expect(instance.result.current.haveSkillKeys).toBeUndefined()
    expect(instance.result.current.topGaps).toBeUndefined()
  })
})
