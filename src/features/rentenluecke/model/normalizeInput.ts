import type { NormalizedScenario, RentenlueckeInput } from './types'

export function normalizeInput(input: RentenlueckeInput): NormalizedScenario {
  return {
    currentAge: input.currentAge,
    retirementAge: input.retirementAge,
    planningAge: input.planningAge,
    yearsToRetirement: input.retirementAge - input.currentAge,
    retirementYears: input.planningAge - input.retirementAge,
    currentCapital: input.currentCapital,
    annualContributionToday: input.monthlyContributionToday * 12,
    annualDesiredSpendingToday: input.monthlyDesiredSpendingToday * 12,
    annualRetirementIncomeToday: input.monthlyRetirementIncomeToday * 12,
    annualInflationRate: input.annualInflationRate,
    annualReturnBeforeRetirement: input.annualReturnBeforeRetirement,
    annualReturnInRetirement: input.annualReturnInRetirement,
  }
}
