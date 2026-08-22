// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_HISTORICAL_RETURN_SERIES_IDS, simulateHistoricalBootstrapReferenceScenario } from '../../model/historicalReturns'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn, createPortfolioComponents, DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { useScenarioState } from '../useScenarioState'
import { createDefaultState } from '../scenarioState/defaults'
import { parsePersistedScenarioState, serializeScenarioState } from '../scenarioState/persistence'

beforeEach(() => {
  localStorage.clear()
})

function persistedJson(value: unknown): string {
  return JSON.stringify(value)
}

describe('parsePersistedScenarioState', () => {
  it('roundtrips a v7 scenario with portfolio buckets', () => {
    const scenario = {
      ...createDefaultState(),
      portfolioBuckets: [
        { id: 'world-etf', name: 'World ETF', value: 35_000, role: 'equity' as const },
        { id: 'bonds', name: 'Bonds', value: 10_000, role: 'bond' as const },
        { id: 'cash-reserve', name: 'Reserve', value: 5_000, role: 'cash' as const },
      ],
    }

    expect(parsePersistedScenarioState(serializeScenarioState(scenario))).toEqual(scenario)
    expect(JSON.parse(serializeScenarioState(scenario))).toMatchObject({
      version: 7,
      portfolioBuckets: scenario.portfolioBuckets,
    })
    expect(JSON.parse(serializeScenarioState(scenario))).not.toHaveProperty('allocation')
  })

  it.each([1, 2, 3, 4, 5])('falls back to defaults for a v%i shape', (version) => {
    expect(parsePersistedScenarioState(persistedJson({
      version,
      input: { ...DEFAULT_INPUT, currentCapital: 123_456 },
      allocation: { equity: 0, bonds: 0, fixed: 1 },
    }))).toEqual(createDefaultState())
  })

  it('falls back to defaults for invalid v6 data', () => {
    expect(parsePersistedScenarioState(persistedJson({
      version: 6,
      input: DEFAULT_INPUT,
      allocation: DEFAULT_ASSET_ALLOCATION,
      historical: createDefaultState().historical,
    }))).toEqual(createDefaultState())
  })
})

describe('createDefaultState', () => {
  it('creates buckets matching the default capital and allocation', () => {
    const state = createDefaultState()

    expect(calculatePortfolioBucketTotal(state.portfolioBuckets)).toBe(DEFAULT_INPUT.currentCapital)
    expect(calculateAllocationFromBuckets(state.portfolioBuckets)).toEqual(DEFAULT_ASSET_ALLOCATION)
  })
})

describe('useScenarioState', () => {
  it('keeps the default scenario output unchanged', () => {
    const { result } = renderHook(() => useScenarioState())
    const defaults = createDefaultState()
    const expectedSettings = {
      portfolioComponents: createPortfolioComponents(DEFAULT_ASSET_ALLOCATION, DEFAULT_HISTORICAL_RETURN_SERIES_IDS),
      inflationSourceId: defaults.historical.inflationSourceId,
      manualCashRealReturn: defaults.historical.manualCashRealReturn,
      simulations: result.current.historicalSettings.simulations,
    }

    expect(result.current.result).toEqual(simulateHistoricalBootstrapReferenceScenario(defaults.input, expectedSettings))
  })

  it('ignores stale v6 allocation and derives input, allocation, and historical components from buckets', () => {
    const persisted = createDefaultState()
    persisted.input = { ...persisted.input, currentCapital: 999_999, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0 }
    persisted.portfolioBuckets = [
      { id: 'world', name: 'World ETF', value: 30_000, role: 'equity' },
      { id: 'small-cap', name: 'Small Cap', value: 5_000, role: 'equity' },
      { id: 'bonds', name: 'Bonds', value: 10_000, role: 'bond' },
      { id: 'reserve', name: 'Reserve', value: 5_000, role: 'cash' },
      { id: 'zero', name: 'Zero', value: 0, role: 'cash' },
    ]
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v6',
      JSON.stringify({ version: 6, ...persisted, allocation: { equity: 0, bonds: 0, fixed: 1 } }),
    )

    const { result } = renderHook(() => useScenarioState())
    const expectedAllocation = { equity: 0.7, bonds: 0.2, fixed: 0.1 }

    expect(result.current.input.currentCapital).toBe(50_000)
    expect(result.current.allocation).toEqual(expectedAllocation)
    expect(result.current.input.annualReturnBeforeRetirement).toBe(calculatePortfolioExpectedReturn(expectedAllocation))
    expect(result.current.input.annualReturnInRetirement).toBe(calculatePortfolioExpectedReturn(expectedAllocation))
    expect(result.current.historicalSettings.portfolioComponents).toEqual([
      { id: 'world', label: 'World ETF', role: 'equity', weight: 0.6, returnSeriesId: persisted.historical.returnSeriesIds.equity },
      { id: 'small-cap', label: 'Small Cap', role: 'equity', weight: 0.1, returnSeriesId: persisted.historical.returnSeriesIds.equity },
      { id: 'bonds', label: 'Bonds', role: 'bond', weight: 0.2, returnSeriesId: persisted.historical.returnSeriesIds.bond },
      { id: 'reserve', label: 'Reserve', role: 'cash', weight: 0.1, returnSeriesId: persisted.historical.returnSeriesIds.cash },
    ])

    act(() => result.current.updateField('currentCapital', 100_000))
    expect(calculatePortfolioBucketTotal(result.current.portfolioBuckets)).toBe(100_000)
    expect(result.current.allocation).toEqual(expectedAllocation)
  })
})
