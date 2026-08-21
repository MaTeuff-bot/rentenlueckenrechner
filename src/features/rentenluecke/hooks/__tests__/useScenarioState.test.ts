import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../../model/defaults'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { createDefaultState } from '../scenarioState/defaults'
import { parsePersistedScenarioState, serializeScenarioState } from '../scenarioState/persistence'

function persistedJson(value: unknown): string {
  return JSON.stringify(value)
}

describe('parsePersistedScenarioState', () => {
  it('roundtrips a v6 scenario with portfolio buckets', () => {
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
      version: 6,
      portfolioBuckets: scenario.portfolioBuckets,
    })
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
