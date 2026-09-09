import type { RetirementInsurance } from './retirementInsurance'

export type RetirementIncomeStreamKind =
  | 'gesetzliche-rente'
  | 'betriebsrente'
  | 'private-rente'
  | 'rental-income'
  | 'side-income'
  | 'bridge-income'
  | 'other'

export type RetirementIncomeStream = {
  id: string
  name: string
  kind?: RetirementIncomeStreamKind
  amountMonthlyToday: number
  startAge: number
  endAge: number | null
  amountBasis: 'net' | 'gross'
  deductionMode: 'none' | 'effectiveHaircut'
  effectiveDeductionRate: number
  support?: 'standard' | 'unsupported'
  rentalAssessmentMonthlyToday?: number

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
  retirementInsurance?: RetirementInsurance
  annualInflationRate: number
  annualReturnBeforeRetirement: number
  annualReturnInRetirement: number
}

export type NormalizedScenario = {
  currentAge: number
  retirementAge: number
  planningAge: number
  sourceInput: RentenlueckeInput
  yearsToRetirement: number
  retirementYears: number
  currentCapital: number
  annualContributionToday: number
  annualDesiredSpendingToday: number
  annualRetirementIncomeToday: number
  retirementIncomeStreams: RetirementIncomeStream[]
  retirementInsurance: RetirementInsurance
  annualInflationRate: number
  annualReturnBeforeRetirement: number
  annualReturnInRetirement: number
}

export type YearlyPeriodRow = {
  insurance?: import('./retirementInsurance').CompleteContribution
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
  retirementIncomeOtherDeductions: number
  healthInsurance: number
  careInsurance: number
  portfolioContributionBase: number
  retirementIncomeNet: number
  surplusIncome: number
  gapWithdrawal: number
  gapWithdrawalToday: number
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
