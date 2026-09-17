// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useScenarioState } from '../useScenarioState'

beforeEach(() => {
  localStorage.clear()
})

describe('lifecycle milestone state', () => {
  it('re-prefill calls the holdings adapter once and never recurses', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      for (const bucket of result.current.portfolioBuckets) {
        result.current.updateLifecycleClassification(bucket.id, 'deposit')
      }
      result.current.updateLifecycleTaxCashId(result.current.portfolioBuckets[0]?.id)
    })
    act(() => {
      result.current.initLifecycleMilestones()
    })
    expect(result.current.lifecycleMilestones).toHaveLength(2)
    expect(result.current.lifecycleTransitions).toHaveLength(1)
    act(() => {
      result.current.rePrefillLifecycleMilestones()
    })
    expect(result.current.lifecycleMilestones).toHaveLength(2)
    expect(result.current.lifecycleTransitions).toHaveLength(1)
  })

  it('re-prefill on zero wealth keeps explicit allocation instead of crashing', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      for (const bucket of result.current.portfolioBuckets) {
        result.current.updatePortfolioBucket(bucket.id, { value: 0 })
        result.current.updateLifecycleClassification(bucket.id, 'deposit')
      }
      result.current.updateLifecycleTaxCashId(result.current.portfolioBuckets[0]?.id)
    })
    act(() => {
      result.current.initLifecycleMilestones()
    })
    const before = result.current.lifecycleMilestones
    expect(before).toHaveLength(2)
    act(() => {
      result.current.rePrefillLifecycleMilestones()
    })
    expect(result.current.lifecycleMilestones).toEqual(before)
  })
})
