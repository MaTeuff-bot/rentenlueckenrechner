import { simulateRetirementRows } from './simulateRetirement'
import type { NormalizedScenario } from './types'

export const REQUIRED_CAPITAL_EPSILON = 1
export const MAX_REQUIRED_CAPITAL = 1_000_000_000_000
export const MAX_BOUNDING_ITERATIONS = 100
export const MAX_BINARY_SEARCH_ITERATIONS = 200

export class RequiredCapitalCalculationError extends Error {
  constructor() {
    super('Required capital upper bound could not be found')
    this.name = 'RequiredCapitalCalculationError'
  }
}

export function calculateRequiredCapitalAtRetirement(scenario: NormalizedScenario): number {
  if (estimateNominalGapWithoutReturns(scenario) === 0) {
    return 0
  }

  const survives = (capital: number) => simulateRetirementRows(scenario, capital).every((row) => !row.depleted)

  let high = Math.max(1, estimateNominalGapWithoutReturns(scenario))
  let boundIterations = 0

  while (!survives(high)) {
    high *= 2
    boundIterations += 1

    if (high > MAX_REQUIRED_CAPITAL || boundIterations > MAX_BOUNDING_ITERATIONS) {
      throw new RequiredCapitalCalculationError()
    }
  }

  let low = 0
  let iterations = 0

  while (high - low > REQUIRED_CAPITAL_EPSILON && iterations < MAX_BINARY_SEARCH_ITERATIONS) {
    const mid = (low + high) / 2
    if (survives(mid)) {
      high = mid
    } else {
      low = mid
    }
    iterations += 1
  }

  return high
}

function estimateNominalGapWithoutReturns(scenario: NormalizedScenario): number {
  let total = 0

  for (let retirementYear = 0; retirementYear < scenario.retirementYears; retirementYear += 1) {
    const yearIndex = scenario.yearsToRetirement + retirementYear
    const inflationFactor = Math.pow(1 + scenario.annualInflationRate, yearIndex)
    const desiredSpending = scenario.annualDesiredSpendingToday * inflationFactor
    const retirementIncome = scenario.annualRetirementIncomeToday * inflationFactor
    total += Math.max(0, desiredSpending - retirementIncome)
  }

  return total
}
