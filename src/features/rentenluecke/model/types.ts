export type RetirementIncomeStream = {
  id: string
  name: string
  amountMonthlyToday: number
  startAge: number
  endAge: number | null
  amountBasis: 'net' | 'gross'
  deductionMode: 'none' | 'effectiveHaircut'
  effectiveDeductionRate: number
}

export type RentenlueckeInput = {
  currentAge: number
  retirementAge: number
  planningAge: number
  currentCapital: number
  monthlyContributionToday: number
  monthlyDesiredSpendingToday: number
  monthlyRetirementIncomeToday: number
  retirementIncomeStreams?: RetirementIncomeStream[]
  annualInflationRate: number
  annualReturnBeforeRetirement: number
  annualReturnInRetirement: number
}

export type NormalizedScenario = {
  currentAge: number
  retirementAge: number
  planningAge: number
  yearsToRetirement: number
  retirementYears: number
  currentCapital: number
  annualContributionToday: number
  annualDesiredSpendingToday: number
  annualRetirementIncomeToday: number
  retirementIncomeStreams: RetirementIncomeStream[]
  annualInflationRate: number
  annualReturnBeforeRetirement: number
  annualReturnInRetirement: number
}

export type YearlyPeriodRow = {
  yearIndex: number
  ageStart: number
  ageEnd: number
  phase: 'accumulation' | 'retirement'
  inflationFactor: number
  nominalReturnRate: number
  openingCapital: number
  investmentReturn: number
  capitalBeforeCashflow: number
  contribution: number
  desiredSpending: number
  retirementIncome: number
  retirementIncomeGross: number
  retirementIncomeDeductions: number
  retirementIncomeNet: number
  surplusIncome: number
  gapWithdrawal: number
  closingCapital: number
  closingCapitalToday: number
  depleted: boolean
  unfundedWithdrawal: number
}

export type SimulationSummary = {
  annualGapToday: number
  monthlyGapToday: number
  projectedCapitalAtRetirement: number
  requiredCapitalAtRetirement: number
  capitalShortfallAtRetirement: number
  capitalSurplusAtRetirement: number
  depletionAge: number | null
  depletionAgeEnd: number | null
  survivesUntilPlanningAge: boolean
}

export type SimulationResult = {
  rows: YearlyPeriodRow[]
  accumulationRows: YearlyPeriodRow[]
  retirementRows: YearlyPeriodRow[]
  summary: SimulationSummary
}

export type ReturnPhase = YearlyPeriodRow['phase']

export type AnnualReturnResolver = (yearIndex: number, phase: ReturnPhase) => number
export type AnnualInflationResolver = (yearIndex: number) => number
