import type { NormalizedScenario, YearlyPeriodRow } from './types'

export const MONEY_EPSILON = 1e-7

export function simulateRetirementRows(
  scenario: NormalizedScenario,
  startingCapitalAtRetirement: number,
): YearlyPeriodRow[] {
  let capital = startingCapitalAtRetirement
  const rows: YearlyPeriodRow[] = []

  for (let retirementYear = 0; retirementYear < scenario.retirementYears; retirementYear += 1) {
    const yearIndex = scenario.yearsToRetirement + retirementYear
    const ageStart = scenario.retirementAge + retirementYear
    const ageEnd = ageStart + 1
    const inflationFactor = Math.pow(1 + scenario.annualInflationRate, yearIndex)
    const desiredSpending = scenario.annualDesiredSpendingToday * inflationFactor
    const retirementIncome = scenario.annualRetirementIncomeToday * inflationFactor
    const gapWithdrawal = Math.max(0, desiredSpending - retirementIncome)
    const investmentReturn = capital * scenario.annualReturnInRetirement
    const capitalBeforeCashflow = capital + investmentReturn
    const rawClosingCapital = capitalBeforeCashflow - gapWithdrawal
    const depleted = rawClosingCapital < -MONEY_EPSILON
    const unfundedWithdrawal = depleted ? -rawClosingCapital : 0
    const closingCapital = rawClosingCapital < MONEY_EPSILON ? 0 : rawClosingCapital
    const closingCapitalToday = closingCapital / Math.pow(1 + scenario.annualInflationRate, yearIndex + 1)

    rows.push({
      yearIndex,
      ageStart,
      ageEnd,
      phase: 'retirement',
      inflationFactor,
      nominalReturnRate: scenario.annualReturnInRetirement,
      openingCapital: capital,
      investmentReturn,
      capitalBeforeCashflow,
      contribution: 0,
      desiredSpending,
      retirementIncome,
      gapWithdrawal,
      closingCapital,
      closingCapitalToday,
      depleted,
      unfundedWithdrawal,
    })

    capital = closingCapital
  }

  return rows
}
