import type { SimulationSummary, YearlyPeriodRow } from './types'

export function deriveSummary(
  projectedCapitalAtRetirement: number,
  retirementRows: YearlyPeriodRow[],
): SimulationSummary {
  const firstRetirementRow = retirementRows[0]
  const annualGapToday = firstRetirementRow?.gapWithdrawalToday ?? 0
  const monthlyGapToday = annualGapToday / 12
  const firstDepletedRow = retirementRows.find((row) => row.depleted) ?? null

  return {
    annualGapToday,
    monthlyGapToday,
    projectedCapitalAtRetirement,
    depletionAge: firstDepletedRow?.ageStart ?? null,
    depletionAgeEnd: firstDepletedRow?.ageEnd ?? null,
    survivesUntilPlanningAge: retirementRows.every((row) => !row.depleted),
  }
}
