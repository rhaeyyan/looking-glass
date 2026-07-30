import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { RoleSkillRow } from './supabaseClient'

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

  it("submitResume on one instance only mutates that instance's own haveSkillKeys/topGaps, never a sibling instance's", async () => {
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

    act(() => {
      instance0.result.current.submitResume('I know PostgreSQL.')
    })

    expect(instance0.result.current.haveSkillKeys).toBeDefined()
    expect(instance0.result.current.haveSkillKeys?.has('postgresql')).toBe(true)

    // Sibling instance must be completely untouched by instance 0's submitResume call.
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
