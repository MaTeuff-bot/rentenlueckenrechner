import { DEFAULT_INPUT } from '../../model/defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  SYNTHETIC_RETURN_SERIES_IDS,
} from '../../model/historicalReturns'
import { createDefaultPortfolioBuckets } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn, DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import type { RentenlueckeInput } from '../../model/types'
import type { ScenarioState } from './types'

export function createDefaultState(): ScenarioState {
  return {
    input: withDeterministicPortfolioReturn(DEFAULT_INPUT, calculatePortfolioExpectedReturn(DEFAULT_ASSET_ALLOCATION)),
    portfolioBuckets: createDefaultPortfolioBuckets(DEFAULT_INPUT.currentCapital, DEFAULT_ASSET_ALLOCATION),
    historical: createDefaultHistoricalState(),
  }
}

export function createDefaultHistoricalState(): ScenarioState['historical'] {
  return {
    returnSeriesIds: DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
    inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    manualCashRealReturn: 0,
  }
}

export function createSyntheticHistoricalState(): ScenarioState['historical'] {
  return {
    returnSeriesIds: SYNTHETIC_RETURN_SERIES_IDS,
    inflationSourceId: FIXED_INFLATION_SOURCE_ID,
    manualCashRealReturn: 0,
  }
}

export function withDeterministicPortfolioReturn(input: RentenlueckeInput, annualReturn: number): RentenlueckeInput {
  return {
    ...input,
    annualReturnBeforeRetirement: annualReturn,
    annualReturnInRetirement: annualReturn,
  }
}
