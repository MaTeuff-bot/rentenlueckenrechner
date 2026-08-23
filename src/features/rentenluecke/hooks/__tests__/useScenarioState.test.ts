// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_HISTORICAL_RETURN_SERIES_IDS, SYNTHETIC_RETURN_SERIES_IDS, simulateHistoricalBootstrapReferenceScenario } from '../../model/historicalReturns'
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
  it('roundtrips a v8 scenario with bucket-owned return sources', () => {
    const scenario = {
      ...createDefaultState(),
      portfolioBuckets: [
        { id: 'world-etf', name: 'World ETF', value: 35_000, role: 'equity' as const, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
        { id: 'bonds', name: 'Bonds', value: 10_000, role: 'bond' as const, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond },
        { id: 'cash-reserve', name: 'Reserve', value: 5_000, role: 'cash' as const, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
      ],
    }

    expect(parsePersistedScenarioState(serializeScenarioState(scenario))).toEqual(scenario)
    expect(JSON.parse(serializeScenarioState(scenario))).toMatchObject({
      version: 8,
      portfolioBuckets: scenario.portfolioBuckets,
    })
    expect(JSON.parse(serializeScenarioState(scenario))).not.toHaveProperty('allocation')
    expect(JSON.parse(serializeScenarioState(scenario))).not.toHaveProperty('historical.returnSeriesIds')
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
      simulations: result.current.historicalSettings.simulations,
    }

    expect(result.current.result).toEqual(simulateHistoricalBootstrapReferenceScenario(defaults.input, expectedSettings))
  })

  it('derives input, allocation, and historical components from persisted buckets', () => {
    const persisted = createDefaultState()
    persisted.input = { ...persisted.input, currentCapital: 999_999, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0 }
    persisted.portfolioBuckets = [
      { id: 'world', name: 'World ETF', value: 30_000, role: 'equity', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'small-cap', name: 'Small Cap', value: 5_000, role: 'equity', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bonds', name: 'Bonds', value: 10_000, role: 'bond', returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond },
      { id: 'reserve', name: 'Reserve', value: 5_000, role: 'cash', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
      { id: 'zero', name: 'Zero', value: 0, role: 'cash', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
    ]
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v8',
      JSON.stringify({ version: 8, ...persisted }),
    )

    const { result } = renderHook(() => useScenarioState())
    const expectedAllocation = { equity: 0.7, bonds: 0.2, fixed: 0.1 }

    expect(result.current.input.currentCapital).toBe(50_000)
    expect(result.current.allocation).toEqual(expectedAllocation)
    expect(result.current.input.annualReturnBeforeRetirement).toBe(calculatePortfolioExpectedReturn(expectedAllocation))
    expect(result.current.input.annualReturnInRetirement).toBe(calculatePortfolioExpectedReturn(expectedAllocation))
    expect(result.current.historicalSettings.portfolioComponents).toEqual([
      { id: 'world', label: 'World ETF', role: 'equity', weight: 0.6, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'small-cap', label: 'Small Cap', role: 'equity', weight: 0.1, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bonds', label: 'Bonds', role: 'bond', weight: 0.2, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond },
      { id: 'reserve', label: 'Reserve', role: 'cash', weight: 0.1, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
    ])

    act(() => result.current.updateField('currentCapital', 100_000))
    expect(calculatePortfolioBucketTotal(result.current.portfolioBuckets)).toBe(100_000)
    expect(result.current.allocation).toEqual(expectedAllocation)
    expect(result.current.portfolioBuckets.map((bucket) => bucket.returnSeriesId)).toEqual([
      SYNTHETIC_RETURN_SERIES_IDS.equity,
      SYNTHETIC_RETURN_SERIES_IDS.equity,
      DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
      SYNTHETIC_RETURN_SERIES_IDS.cash,
      SYNTHETIC_RETURN_SERIES_IDS.cash,
    ])
  })

  it('resets an incompatible source when a bucket role changes', () => {
    const { result } = renderHook(() => useScenarioState())
    const equity = result.current.portfolioBuckets.find((bucket) => bucket.role === 'equity')!

    act(() => result.current.updatePortfolioBucket(equity.id, { role: 'cash' }))

    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === equity.id)).toMatchObject({
      role: 'cash',
      returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
    })
  })
})
