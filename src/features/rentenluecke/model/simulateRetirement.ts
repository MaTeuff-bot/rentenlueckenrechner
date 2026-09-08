import { createInflationFactorResolver } from './simulateAccumulation'
import { calculateRetirementIncomeForYear } from './retirementIncomeStreams'
import type { AnnualInflationResolver, AnnualReturnResolver, NormalizedScenario, YearlyPeriodRow } from './types'

export const MONEY_EPSILON = 1e-7

export function simulateRetirementRows(
  scenario: NormalizedScenario,
  startingCapitalAtRetirement: number,
  getAnnualReturn?: AnnualReturnResolver,
  getAnnualInflation?: AnnualInflationResolver,
): YearlyPeriodRow[] {
  let capital = startingCapitalAtRetirement
  const rows: YearlyPeriodRow[] = []
  const getInflationFactor = createInflationFactorResolver(scenario.annualInflationRate, getAnnualInflation)

  for (let retirementYear = 0; retirementYear < scenario.retirementYears; retirementYear += 1) {
    const yearIndex = scenario.yearsToRetirement + retirementYear
    const ageStart = scenario.retirementAge + retirementYear
    const ageEnd = ageStart + 1
    const inflationFactor = getInflationFactor(yearIndex)
    const desiredSpending = scenario.annualDesiredSpendingToday * inflationFactor
    const income = calculateRetirementIncomeForYear(scenario.retirementIncomeStreams, ageStart, inflationFactor, scenario.retirementInsurance)
    const gapWithdrawal = Math.max(0, desiredSpending - income.net)
    // Record the uninflated cashflow using the same rules. Deflating the nominal
    // gap introduces rounding changes to legacy summaries, including bootstrap.
    const incomeToday = inflationFactor === 1 ? income : calculateRetirementIncomeForYear(
      scenario.retirementIncomeStreams, ageStart, 1, scenario.retirementInsurance,
    )
    const gapWithdrawalToday = Math.max(0, scenario.annualDesiredSpendingToday - incomeToday.net)
    const surplusIncome = Math.max(0, income.net - desiredSpending)
    const nominalReturnRate = getAnnualReturn?.(yearIndex, 'retirement') ?? scenario.annualReturnInRetirement
    const investmentReturn = capital * nominalReturnRate
    const capitalBeforeCashflow = capital + investmentReturn
    const rawClosingCapital = capitalBeforeCashflow - gapWithdrawal
    const depleted = rawClosingCapital < -MONEY_EPSILON
    const unfundedWithdrawal = depleted ? -rawClosingCapital : 0
    const closingCapital = rawClosingCapital < MONEY_EPSILON ? 0 : rawClosingCapital
    const closingCapitalToday = closingCapital / getInflationFactor(yearIndex + 1)

    rows.push({
      yearIndex,
      ageStart,
      ageEnd,
      phase: 'retirement',
      inflationFactor,
      nominalReturnRate,
      openingCapital: capital,
      investmentReturn,
      capitalBeforeCashflow,
      contribution: 0,
      desiredSpending,
      retirementIncome: income.net,
      retirementIncomeGross: income.gross,
      retirementIncomeDeductions: income.deductions,
      retirementIncomeCombinedDeductions: income.combinedDeductions,
      retirementIncomeOtherDeductions: income.otherDeductions,
      healthInsurance: income.kv,
      careInsurance: income.pv,
      portfolioContributionBase: income.portfolioBase,
      retirementIncomeNet: income.net,
      surplusIncome,
      gapWithdrawal,
      gapWithdrawalToday,
      closingCapital,
      closingCapitalToday,
      depleted,
      unfundedWithdrawal,
    })

    capital = closingCapital
  }

  return rows
}
