import { createDefaultRetirementInsurance, insuranceSetupIssues } from './retirementInsurance'
import type { NormalizedScenario, RentenlueckeInput } from './types'
import { createDefaultRetirementIncomeStreams } from './retirementIncomeStreams'

export function normalizeInput(rawInput: RentenlueckeInput): NormalizedScenario {
  const input = { ...rawInput, retirementIncomeStreams: rawInput.retirementIncomeStreams ?? createDefaultRetirementIncomeStreams(rawInput) }
  const issues = insuranceSetupIssues(input)
  if (issues.length) throw new Error(issues.join(' '))
  return {
    sourceInput: input,
    currentAge: input.currentAge,
    retirementAge: input.retirementAge,
    planningAge: input.planningAge,
    yearsToRetirement: input.retirementAge - input.currentAge,
    retirementYears: input.planningAge - input.retirementAge,
    currentCapital: input.currentCapital,
    annualContributionToday: input.monthlyContributionToday * 12,
    annualDesiredSpendingToday: input.monthlyDesiredSpendingToday * 12,
    annualRetirementIncomeToday: input.monthlyRetirementIncomeToday * 12,
    retirementIncomeStreams:
      input.retirementIncomeStreams ?? createDefaultRetirementIncomeStreams(input),
    retirementInsurance: input.retirementInsurance ?? createDefaultRetirementInsurance(),
    annualInflationRate: input.annualInflationRate,
    annualReturnBeforeRetirement: input.annualReturnBeforeRetirement,
    annualReturnInRetirement: input.annualReturnInRetirement,
  }
}
