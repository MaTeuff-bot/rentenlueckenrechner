import { assessScalarWithdrawalTax, createRetirementTaxState, fundRetirementYear, simulateRetirementRows } from './simulateRetirement'
import { scaledSparerpauschbetrag } from './tax/capitalIncomeTax'
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
  const taxTemplate = createRetirementTaxState()
  // Per-year scaled allowances depend only on the row's inflation factor, so they
  // are computed once per search (not per survives() trial): the hot loop below
  // reuses them across all bounding/binary-search iterations.
  const scaledAllowances = rows.map((row) => scaledSparerpauschbetrag(row.inflationFactor))
  const survives = (startingCapital: number) => {
    let capital = startingCapital
    // Immutable rollforward from the shared validated template: fresh loss per path.
    let taxState = taxTemplate
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      // Preserve the existing capital-search convention: the selected plan return
      // unless an explicit resolver was supplied, with this path's actual inflation/cashflows.
      // The hypothetical path reassesses the gain-proportional withdrawal tax each year
      // (same function as the ledger) so required capital funds gap + tax. The allowance
      // scales with the row's inflation factor, matching the ledger's per-year amount.
      const rate = getAnnualReturn?.(row.yearIndex, 'retirement') ?? scenario.annualReturnInRetirement
      const investmentReturn = capital * rate
      taxState = { ...taxState, allowanceAnnual: scaledAllowances[rowIndex] }
      const assessed = assessScalarWithdrawalTax(taxState, {
        capitalBeforeCashflow: capital + investmentReturn, investmentReturn, gapWithdrawal: row.gapWithdrawal,
      })
      taxState = assessed.nextState
      const funded = fundRetirementYear(capital, rate, row.gapWithdrawal, { capitalIncomeTax: assessed.result.capitalIncomeTax })
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
