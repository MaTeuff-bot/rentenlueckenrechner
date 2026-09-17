import type { LifecycleBucketKind, Milestone, AllocationTransition } from '../../model/lifecycleAllocation/types.js'
import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../../model/types'

export type LifecycleClassification = LifecycleBucketKind
export type LifecycleTaxSettings = {
  allowanceAnnualToday?: number
  churchRate?: 0 | 0.08 | 0.09
  basisRate?: number
  expenseAllowanceAnnualToday?: number
}
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
  lifecycleClassification: Record<string, LifecycleClassification | undefined>
  lifecycleAcquisitionCost: Record<string, number | undefined>
  lifecycleTaxCashId?: string
  lifecycleTaxSettings: LifecycleTaxSettings
  lifecycleMilestones?: Milestone[]
  lifecycleTransitions?: AllocationTransition[]
}

export type PersistedHistoricalState = {
  inflationSourceId?: string
  inflationSeriesId?: string
}
