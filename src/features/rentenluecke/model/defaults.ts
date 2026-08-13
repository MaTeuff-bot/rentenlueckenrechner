import type { RentenlueckeInput } from './types'

export const DEFAULT_INPUT: RentenlueckeInput = {
  currentAge: 40,
  retirementAge: 67,
  planningAge: 90,
  currentCapital: 50_000,
  monthlyContributionToday: 500,
  monthlyDesiredSpendingToday: 3_000,
  monthlyRetirementIncomeToday: 1_800,
  annualInflationRate: 0.02,
  annualReturnBeforeRetirement: 0.05,
  annualReturnInRetirement: 0.03,
}
