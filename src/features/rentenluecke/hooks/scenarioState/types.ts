import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../../model/types'
import type { PortfolioEstimatorSettings } from '../../model/capitalIncome/portfolioEstimator'
import type { AllocationDraft } from '../../model/capitalIncome/allocationEvent'

export type ScenarioState = {
  insuranceCoverageAnswers: import('../../model/insuranceCoverage').InsuranceCoverageAnswers
  childrenAnswer?: import('../../model/childrenAnswer').ChildrenAnswer
  explicitInsuranceTransition?: number
  input: RentenlueckeInput
  retirementIncomeStreams: RetirementIncomeStream[]
  portfolioBuckets: PortfolioBucket[]
  portfolioEstimatorSettings?: PortfolioEstimatorSettings
  /** Optional one-time allocation at Arbeitsende. Absent means disabled; no
   * migration, reset notice, or acknowledgment is attached to this field. */
  allocationAtRetirement?: AllocationDraft
  historical: {
    inflationSourceId: string
    simulations?: number
    cashMode?: string
    cashPlanningRate?: number
    cashRealRate?: number
    cashPlanningRateConfirmed?: boolean
  }
}

export type PersistedHistoricalState = {
  inflationSourceId?: string
  inflationSeriesId?: string
  simulations?: number
  cashMode?: string
  cashPlanningRate?: number
  cashRealRate?: number
  cashPlanningRateConfirmed?: boolean
}
