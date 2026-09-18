import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../../model/types'

export type ScenarioState = {
  insuranceCoverageAnswers: import('../../model/insuranceCoverage').InsuranceCoverageAnswers
  childrenAnswer?: import('../../model/childrenAnswer').ChildrenAnswer
  explicitInsuranceTransition?: number
  input: RentenlueckeInput
  retirementIncomeStreams: RetirementIncomeStream[]
  portfolioBuckets: PortfolioBucket[]
  historical: {
    inflationSourceId: string
  }
}

export type PersistedHistoricalState = {
  inflationSourceId?: string
  inflationSeriesId?: string
}
