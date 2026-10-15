import { act, renderHook } from '@testing-library/react'

import { scenariosApi } from '@/services/api'
import type { ScenarioRunProgress, ScenarioProgressHeader, ScenarioProgressSummary } from '@/types'

import { SCENARIO_RUN_POLL_INTERVAL_MS, useScenarioRunProgress } from './useScenarioRunProgress'

jest.mock('@/services/api', () => ({
  scenariosApi: { getRunProgress: jest.fn() },
}))
jest.mock('@/services/errors', () => ({
  toApiError: (error: unknown) => ({ status: 500, message: String(error) }),
}))

const mockGetRunProgress = scenariosApi.getRunProgress as jest.Mock

const RUN: ScenarioProgressHeader = {
  scenario_result_id: 'run-1',
  scenario_name: 'TestScenario',
  scenario_version: 1,
  status: 'IN_PROGRESS',
  created_at: '2026-01-01T00:00:00Z',
}

function makePage(overrides: Partial<ScenarioRunProgress> = {}): ScenarioRunProgress {
  const summary = {} as unknown as ScenarioProgressSummary
  return { run: RUN, plan: null, results: [], summary, next_cursor: null, has_more: false, plan_complete: true, ...overrides }
}

describe('useScenarioRunProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers() })
    jest.useRealTimers()
  })

  it('stops paging instead of looping forever when the cursor does not advance', async () => {
    mockGetRunProgress.mockImplementation(() =>
      Promise.resolve(makePage({ has_more: true, next_cursor: undefined })),
    )

    renderHook(() => useScenarioRunProgress('run-1'))
    await act(async () => {})

    const afterFirstCycle = mockGetRunProgress.mock.calls.length
    expect(afterFirstCycle).toBe(1)

    await act(async () => { jest.advanceTimersByTime(SCENARIO_RUN_POLL_INTERVAL_MS) })
    await act(async () => { jest.advanceTimersByTime(SCENARIO_RUN_POLL_INTERVAL_MS) })
    await act(async () => { jest.advanceTimersByTime(SCENARIO_RUN_POLL_INTERVAL_MS) })

    // One request per poll interval, not an endless recursion of the same page.
    expect(mockGetRunProgress.mock.calls.length).toBeLessThanOrEqual(afterFirstCycle + 3)
  })

  it('follows an advancing cursor across pages', async () => {
    mockGetRunProgress
      .mockResolvedValueOnce(makePage({ has_more: true, next_cursor: 'cursor-1' }))
      .mockResolvedValueOnce(makePage({ has_more: true, next_cursor: 'cursor-2' }))
      .mockResolvedValueOnce(makePage({ has_more: false, next_cursor: 'cursor-3' }))

    renderHook(() => useScenarioRunProgress('run-1'))
    await act(async () => {})

    expect(mockGetRunProgress).toHaveBeenCalledTimes(3)
    expect(mockGetRunProgress.mock.calls[1][1]).toEqual({ since: 'cursor-1', limit: 500 })
    expect(mockGetRunProgress.mock.calls[2][1]).toEqual({ since: 'cursor-2', limit: 500 })
  })
})
