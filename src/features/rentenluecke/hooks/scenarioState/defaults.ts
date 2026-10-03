import { defaultCoverageAnswers } from '../../model/insuranceCoverage'
import { createDefaultRetirementInsurance, earliestPensionAge } from '../../model/retirementInsurance'
import { DEFAULT_INPUT } from '../../model/defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  FIXED_INFLATION_SOURCE_ID,
} from '../../model/historicalReturns'
import { createDefaultPortfolioBuckets } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn, DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import type { RentenlueckeInput } from '../../model/types'
import { createDefaultRetirementIncomeStreams } from '../../model/retirementIncomeStreams'
import type { ScenarioState } from './types'

export function createDefaultState(): ScenarioState {
  const baseInput = withDeterministicPortfolioReturn(DEFAULT_INPUT, calculatePortfolioExpectedReturn(DEFAULT_ASSET_ALLOCATION))
  const retirementIncomeStreams = createDefaultRetirementIncomeStreams(baseInput)
  const input = { ...baseInput, retirementIncomeStreams, retirementInsurance: createDefaultRetirementInsurance(earliestPensionAge(retirementIncomeStreams)) }
  return {
    input,
    insuranceCoverageAnswers: defaultCoverageAnswers(),
    childrenAnswer: { kind: 'missing' },
    retirementIncomeStreams,
    portfolioBuckets: createDefaultPortfolioBuckets(DEFAULT_INPUT.currentCapital, DEFAULT_ASSET_ALLOCATION),
    historical: createDefaultHistoricalState(),
  }
}

export function createDefaultHistoricalState(): ScenarioState['historical'] {
  return {
    inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  }
}

// Test-only fixture: deterministic synthetic sources with a reduced Monte Carlo
// count. No test below asserts on percentile precision (P10/P50/P90 bands or
// survival probability), so 100 paths keep the full recompute stack fast
// without changing any test's purpose; production defaults stay at 1,000.
export function createSyntheticHistoricalState(): ScenarioState['historical'] {
  return {
    inflationSourceId: FIXED_INFLATION_SOURCE_ID,
    simulations: 100,
  }
}

export function withDeterministicPortfolioReturn(input: RentenlueckeInput, annualReturn: number): RentenlueckeInput {
  return {
    ...input,
    annualReturnBeforeRetirement: annualReturn,
    annualReturnInRetirement: annualReturn,
  }
}
