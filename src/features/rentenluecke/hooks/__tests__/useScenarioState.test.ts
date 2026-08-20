import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  SYNTHETIC_RETURN_SERIES_IDS,
} from '../../model/historicalReturns'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { parsePersistedScenarioState } from '../useScenarioState'

function persistedJson(value: unknown): string {
  return JSON.stringify(value)
}

describe('parsePersistedScenarioState', () => {
  it('migrates v3 synthetic mode to synthetic asset return sources', () => {
    const state = parsePersistedScenarioState(
      persistedJson({
        version: 3,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        returnModel: 'synthetic',
        historical: {
          returnSeriesIds: {
            equity: 'jst-r6-developed-equal-weight-equity-real-post1950',
            bond: 'jst-r6-developed-equal-weight-bonds-real-post1950',
            cash: 'jst-r6-developed-equal-weight-bills-real-post1950',
          },
          inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
          manualCashRealReturn: 0,
        },
      }),
    )

    expect(state.historical.returnSeriesIds).toEqual(SYNTHETIC_RETURN_SERIES_IDS)
    expect(state.historical.inflationSourceId).toBe(FIXED_INFLATION_SOURCE_ID)
  })

  it('migrates old provisional fixture ids to production defaults', () => {
    const state = parsePersistedScenarioState(
      persistedJson({
        version: 4,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        historical: {
          returnSeriesIds: {
            equity: 'fixture-global-equity-eur-provisional',
            bond: 'fixture-eur-bonds-provisional',
            cash: 'fixture-eur-cash-provisional',
          },
          inflationSeriesId: 'fixture-de-eur-inflation-provisional',
          manualCashRealReturn: 0,
        },
      }),
    )

    expect(state.historical.returnSeriesIds).toEqual(DEFAULT_HISTORICAL_RETURN_SERIES_IDS)
    expect(state.historical.inflationSourceId).toBe(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)
  })

  it('falls back to the production CPI default for unknown persisted inflation sources', () => {
    const state = parsePersistedScenarioState(
      persistedJson({
        version: 5,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        historical: {
          returnSeriesIds: { ...DEFAULT_HISTORICAL_RETURN_SERIES_IDS },
          inflationSourceId: 'missing-inflation-source',
          manualCashRealReturn: 0,
        },
      }),
    )

    expect(state.historical.inflationSourceId).toBe(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)
  })

  it('preserves v3 historical manual Cash selections during migration', () => {
    const state = parsePersistedScenarioState(
      persistedJson({
        version: 3,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        returnModel: 'historicalAnnualBootstrap',
        historical: {
          returnSeriesIds: {
            equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
            bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
            cash: 'manual-fixed-real',
          },
          inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
          manualCashRealReturn: 0.01,
        },
      }),
    )

    expect(state.historical.returnSeriesIds.cash).toBe('manual-fixed-real')
    expect(state.historical.manualCashRealReturn).toBe(0.01)
  })

  it('migrates v2 synthetic scenarios to synthetic asset return sources', () => {
    const state = parsePersistedScenarioState(
      persistedJson({
        version: 2,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
      }),
    )

    expect(state.historical.returnSeriesIds).toEqual(SYNTHETIC_RETURN_SERIES_IDS)
    expect(state.historical.inflationSourceId).toBe(FIXED_INFLATION_SOURCE_ID)
  })
})
