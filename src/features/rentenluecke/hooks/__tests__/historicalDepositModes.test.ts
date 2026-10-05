// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CASH_MODE_CONSTANT,
  CASH_MODE_HISTORICAL,
  CASH_MODE_REAL,
  FIXED_INFLATION_SOURCE_ID,
  HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
  PLANNING_RATE_SOURCE_ID,
  REAL_ASSUMPTION_SOURCE_ID,
} from '../../model/historicalReturns/constants'
import {
  cashPlanningRateIssue,
  getConfirmedCashMode,
  getConfirmedCashPlanningRate,
  getConfirmedCashRealRate,
  getEffectiveCashMode,
} from '../../model/cashPlanningRate'
import { useScenarioState } from '../useScenarioState'
import {
  parsePersistedScenarioState,
  serializeScenarioState,
  STORAGE_KEY,
} from '../scenarioState/persistence'
import { createDefaultState } from '../scenarioState/defaults'

function bankBuckets() {
  return [
    { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID },
  ]
}

describe('cash mode confirmation and recompute', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the constant default without reinterpretation', () => {
    const { result } = renderHook(() => useScenarioState())
    expect(getEffectiveCashMode(result.current.historical)).toBe(CASH_MODE_CONSTANT)
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.cashPlanningIssue).toBeNull()
    expect(getConfirmedCashPlanningRate(result.current.historical)).toBe(0.02)
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')?.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
  })

  it('requires fresh consent on mode change and adopts the mode source on confirm', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.cashPlanningIssue).toBeNull()
    act(() => {
      result.current.updateCashMode(CASH_MODE_HISTORICAL)
    })
    expect(result.current.historical.cashPlanningRateConfirmed).toBe(false)
    expect(result.current.cashPlanningIssue).not.toBeNull()
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')?.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.cashPlanningIssue).toBeNull()
    expect(getConfirmedCashMode(result.current.historical)).toBe(CASH_MODE_HISTORICAL)
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')?.returnSeriesId).toBe(
      HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
    )
  })

  it('confirms the real target and blocks invalid real input', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashMode(CASH_MODE_REAL)
    })
    act(() => {
      result.current.updateCashRealRate(Number.NaN)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.historical.cashPlanningRateConfirmed).toBe(false)
    expect(result.current.cashPlanningIssue).not.toBeNull()
    expect(getConfirmedCashRealRate(result.current.historical)).toBeUndefined()
    act(() => {
      result.current.updateCashRealRate(-0.0028)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.cashPlanningIssue).toBeNull()
    expect(getConfirmedCashRealRate(result.current.historical)).toBe(-0.0028)
  })

  it('does not clear confirmation on unrelated edits', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashMode(CASH_MODE_HISTORICAL)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.cashPlanningIssue).toBeNull()
    act(() => {
      result.current.updateSimulations(500)
    })
    act(() => {
      result.current.updateInflationSource(FIXED_INFLATION_SOURCE_ID)
    })
    expect(result.current.historical.cashPlanningRateConfirmed).toBe(true)
    expect(getConfirmedCashMode(result.current.historical)).toBe(CASH_MODE_HISTORICAL)
  })

  it('resets a historical bank source on an actual bank-to-fund transition', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashMode(CASH_MODE_HISTORICAL)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')?.returnSeriesId).toBe(
      HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
    )
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'accumulating-equity-fund' })
    })
    const fundBucket = result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!
    expect(fundBucket.holding).toBe('accumulating-equity-fund')
    expect(fundBucket.returnSeriesId).not.toBe(HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID)
  })

  it('reloads persisted historical and real modes without reinterpretation', () => {
    const historicalState = createDefaultState()
    historicalState.portfolioBuckets = bankBuckets().map((bucket) => ({
      ...bucket,
      returnSeriesId: HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
    }))
    historicalState.historical = {
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      simulations: 3,
      cashMode: CASH_MODE_HISTORICAL,
      cashPlanningRateConfirmed: true,
    }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(historicalState))
    const reloadedHistorical = parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)!)
    expect(reloadedHistorical.historical.cashMode).toBe(CASH_MODE_HISTORICAL)
    expect(cashPlanningRateIssue(reloadedHistorical.portfolioBuckets, reloadedHistorical.historical)).toBeNull()

    const realState = createDefaultState()
    realState.portfolioBuckets = bankBuckets().map((bucket) => ({
      ...bucket,
      returnSeriesId: REAL_ASSUMPTION_SOURCE_ID,
    }))
    realState.historical = {
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      simulations: 3,
      cashMode: CASH_MODE_REAL,
      cashRealRate: -0.0028,
      cashPlanningRateConfirmed: true,
    }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(realState))
    const reloadedReal = parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)!)
    expect(reloadedReal.historical.cashRealRate).toBe(-0.0028)
    expect(getConfirmedCashRealRate(reloadedReal.historical)).toBe(-0.0028)
    expect(cashPlanningRateIssue(reloadedReal.portfolioBuckets, reloadedReal.historical)).toBeNull()
  })

  it('treats unknown or malformed persisted modes as invalid, never as constant', () => {
    expect(
      cashPlanningRateIssue([{ returnSeriesId: PLANNING_RATE_SOURCE_ID }], {
        cashMode: 'tagesgeld-turbomodus',
        cashPlanningRate: 0.02,
        cashPlanningRateConfirmed: true,
      }),
    ).not.toBeNull()
    expect(getEffectiveCashMode({ cashMode: 'tagesgeld-turbomodus' })).toBeUndefined()
    expect(
      cashPlanningRateIssue([{ returnSeriesId: REAL_ASSUMPTION_SOURCE_ID }], {
        cashMode: CASH_MODE_REAL,
        cashRealRate: -1,
        cashPlanningRateConfirmed: true,
      }),
    ).not.toBeNull()
    expect(
      cashPlanningRateIssue([{ returnSeriesId: REAL_ASSUMPTION_SOURCE_ID }], {
        cashMode: CASH_MODE_REAL,
        cashPlanningRateConfirmed: true,
      }),
    ).not.toBeNull()
    expect(getEffectiveCashMode({})).toBe(CASH_MODE_CONSTANT)
  })
})
