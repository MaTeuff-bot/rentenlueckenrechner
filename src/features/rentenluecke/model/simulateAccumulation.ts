import type { AnnualReturnResolver, NormalizedScenario, YearlyPeriodRow } from './types'

export function simulateAccumulationRows(
  scenario: NormalizedScenario,
  getAnnualReturn?: AnnualReturnResolver,
): YearlyPeriodRow[] {
  let capital = scenario.currentCapital
  const rows: YearlyPeriodRow[] = []

  for (let yearIndex = 0; yearIndex < scenario.yearsToRetirement; yearIndex += 1) {
    const ageStart = scenario.currentAge + yearIndex
    const ageEnd = ageStart + 1
    const inflationFactor = Math.pow(1 + scenario.annualInflationRate, yearIndex)
    const contribution = scenario.annualContributionToday * inflationFactor
    const nominalReturnRate = getAnnualReturn?.(yearIndex, 'accumulation') ?? scenario.annualReturnBeforeRetirement
    const investmentReturn = capital * nominalReturnRate
    const capitalBeforeCashflow = capital + investmentReturn
    const closingCapital = capitalBeforeCashflow + contribution
    const closingCapitalToday = closingCapital / Math.pow(1 + scenario.annualInflationRate, yearIndex + 1)

    rows.push({
      yearIndex,
      ageStart,
      ageEnd,
      phase: 'accumulation',
      inflationFactor,
      nominalReturnRate,
      openingCapital: capital,
      investmentReturn,
      capitalBeforeCashflow,
      contribution,
      desiredSpending: 0,
      retirementIncome: 0,
      gapWithdrawal: 0,
      closingCapital,
      closingCapitalToday,
      depleted: false,
      unfundedWithdrawal: 0,
    })

    capital = closingCapital
  }

  return rows
}
