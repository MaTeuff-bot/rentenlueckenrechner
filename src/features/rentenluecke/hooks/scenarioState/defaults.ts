import { DEFAULT_INPUT } from '../../model/defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  FIXED_INFLATION_SOURCE_ID,
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
    inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  }
}

export function createSyntheticHistoricalState(): ScenarioState['historical'] {
  return {
    inflationSourceId: FIXED_INFLATION_SOURCE_ID,
  }
}

export function withDeterministicPortfolioReturn(input: RentenlueckeInput, annualReturn: number): RentenlueckeInput {
  return {
    ...input,
    annualReturnBeforeRetirement: annualReturn,
    annualReturnInRetirement: annualReturn,
  }
}
