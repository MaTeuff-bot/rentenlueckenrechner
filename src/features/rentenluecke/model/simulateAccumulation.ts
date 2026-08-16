import type { AnnualInflationResolver, AnnualReturnResolver, NormalizedScenario, YearlyPeriodRow } from './types'

export function simulateAccumulationRows(
  scenario: NormalizedScenario,
  getAnnualReturn?: AnnualReturnResolver,
  getAnnualInflation?: AnnualInflationResolver,
): YearlyPeriodRow[] {
  let capital = scenario.currentCapital
  const rows: YearlyPeriodRow[] = []
  const getInflationFactor = createInflationFactorResolver(scenario.annualInflationRate, getAnnualInflation)

  for (let yearIndex = 0; yearIndex < scenario.yearsToRetirement; yearIndex += 1) {
    const ageStart = scenario.currentAge + yearIndex
    const ageEnd = ageStart + 1
    const inflationFactor = getInflationFactor(yearIndex)
    const contribution = scenario.annualContributionToday * inflationFactor
    const nominalReturnRate = getAnnualReturn?.(yearIndex, 'accumulation') ?? scenario.annualReturnBeforeRetirement
    const investmentReturn = capital * nominalReturnRate
    const capitalBeforeCashflow = capital + investmentReturn
    const closingCapital = capitalBeforeCashflow + contribution
    const closingCapitalToday = closingCapital / getInflationFactor(yearIndex + 1)

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

export function createInflationFactorResolver(
  fixedAnnualInflationRate: number,
  getAnnualInflation?: AnnualInflationResolver,
): (yearIndex: number) => number {
  const factors = [1]

  return (yearIndex: number) => {
    for (let index = factors.length; index <= yearIndex; index += 1) {
      const previousYearInflation = getAnnualInflation?.(index - 1) ?? fixedAnnualInflationRate
      factors[index] = factors[index - 1] * (1 + previousYearInflation)
    }

    return factors[yearIndex]
  }
}
