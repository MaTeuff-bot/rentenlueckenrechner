import { fundRetirementYear, simulateRetirementRows } from './simulateRetirement'
import type { AnnualInflationResolver, AnnualReturnResolver, NormalizedScenario, YearlyPeriodRow } from './types'

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

export function calculateRequiredCapitalAtRetirement(
  scenario: NormalizedScenario,
  getAnnualReturn?: AnnualReturnResolver,
  getAnnualInflation?: AnnualInflationResolver,
  ledger?: readonly YearlyPeriodRow[],
): number {
  // Income and contribution estimates do not depend on capital in this release.
  // Reuse the same path's authoritative ledger, including negative available income.
  const rows = ledger ?? simulateRetirementRows(scenario, 0, getAnnualReturn, getAnnualInflation)
  const nominalGap = rows.reduce((sum, row) => sum + row.gapWithdrawal, 0)
  if (nominalGap === 0) return 0
  const survives = (startingCapital: number) => {
    let capital = startingCapital
    for (const row of rows) {
      // Preserve the existing capital-search convention: the selected plan return
      // unless an explicit resolver was supplied, with this path's actual inflation/cashflows.
      const rate = getAnnualReturn?.(row.yearIndex, 'retirement') ?? scenario.annualReturnInRetirement
      const funded = fundRetirementYear(capital, rate, row.gapWithdrawal)
      if (funded.depleted) return false
      capital = funded.closingCapital
    }
    return true
  }
  let high = Math.max(1, nominalGap)
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
