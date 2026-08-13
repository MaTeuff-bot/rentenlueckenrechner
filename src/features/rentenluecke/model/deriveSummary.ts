import type { NormalizedScenario, SimulationSummary, YearlyPeriodRow } from './types'

export function deriveSummary(
  scenario: NormalizedScenario,
  projectedCapitalAtRetirement: number,
  requiredCapitalAtRetirement: number,
  retirementRows: YearlyPeriodRow[],
): SimulationSummary {
  const annualGapToday = Math.max(0, scenario.annualDesiredSpendingToday - scenario.annualRetirementIncomeToday)
  const monthlyGapToday = annualGapToday / 12
  const capitalShortfallAtRetirement = Math.max(0, requiredCapitalAtRetirement - projectedCapitalAtRetirement)
  const capitalSurplusAtRetirement = Math.max(0, projectedCapitalAtRetirement - requiredCapitalAtRetirement)
  const firstDepletedRow = retirementRows.find((row) => row.depleted) ?? null

  return {
    annualGapToday,
    monthlyGapToday,
    projectedCapitalAtRetirement,
    requiredCapitalAtRetirement,
    capitalShortfallAtRetirement,
    capitalSurplusAtRetirement,
    depletionAge: firstDepletedRow?.ageStart ?? null,
    depletionAgeEnd: firstDepletedRow?.ageEnd ?? null,
    survivesUntilPlanningAge: retirementRows.every((row) => !row.depleted),
  }
}
