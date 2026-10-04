// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FIXED_INFLATION_SOURCE_ID } from '../../model/historicalReturns'
import { PLANNING_RATE_SOURCE_ID } from '../../model/historicalReturns/constants'
import { useScenarioState } from '../useScenarioState'
import { getConfirmedCashPlanningRate, cashPlanningRateIssue } from '../../model/cashPlanningRate'
import {
  parsePersistedScenarioState,
  serializeScenarioState,
  STORAGE_KEY,
  TAGESGELD_PLANNING_RATE_NOTICE_KEY,
} from '../scenarioState/persistence'
import { createDefaultState } from '../scenarioState/defaults'

describe('tagesgeld persistence', () => {
  beforeEach(() => localStorage.clear())

  it('roundtrips confirmed rate and recomputes deterministically', () => {
    const state = createDefaultState()
    state.portfolioBuckets = [
      { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ]
    state.historical = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3, cashPlanningRate: 0.02, cashPlanningRateConfirmed: true }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const loaded = parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)!)
    expect(loaded.historical.cashPlanningRate).toBe(0.02)
    expect(loaded.historical.cashPlanningRateConfirmed).toBe(true)
    expect(getConfirmedCashPlanningRate(loaded.historical)).toBe(0.02)
    expect(cashPlanningRateIssue(loaded.portfolioBuckets, loaded.historical)).toBeNull()
  })

  it('parses old v15 without fields and raises notice plus issue', () => {
    const state = createDefaultState()
    state.portfolioBuckets = [
      { id: 'bank', name: 'Bank', value: 10_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ]
    state.historical = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3 } as never
    const raw = JSON.parse(serializeScenarioState(state))
    delete raw.historical.cashPlanningRate
    delete raw.historical.cashPlanningRateConfirmed
    raw.version = 15
    const loaded = parsePersistedScenarioState(JSON.stringify(raw))
    expect(() => parsePersistedScenarioState(JSON.stringify(raw))).not.toThrow()
    expect(loaded.historical.cashPlanningRate).toBeUndefined()
    expect(cashPlanningRateIssue(loaded.portfolioBuckets, loaded.historical)).not.toBeNull()
    expect(localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY)).toBe('pending')
  })

  it('does not accept unconfirmed rates', () => {
    expect(getConfirmedCashPlanningRate({ cashPlanningRate: 0.02, cashPlanningRateConfirmed: false })).toBeUndefined()
    expect(getConfirmedCashPlanningRate({ cashPlanningRate: 0.02 })).toBeUndefined()
    expect(cashPlanningRateIssue([{ returnSeriesId: PLANNING_RATE_SOURCE_ID }], { cashPlanningRate: 0.02, cashPlanningRateConfirmed: false })).not.toBeNull()
  })
})

describe('tagesgeld confirmation adopts the displayed proposal', () => {
  it('stores the proposal on explicit confirmation without a prior edit', () => {
    const { result } = renderHook(() => useScenarioState())
    expect(result.current.cashPlanningIssue).not.toBeNull()
    act(() => result.current.updateCashPlanningRateConfirmed(true))
    expect(result.current.cashPlanningIssue).toBeNull()
  })

  it('keeps an explicitly edited rate on confirmation', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => result.current.updateCashPlanningRate(0.015))
    act(() => result.current.updateCashPlanningRateConfirmed(true))
    expect(result.current.cashPlanningIssue).toBeNull()
  })
})
