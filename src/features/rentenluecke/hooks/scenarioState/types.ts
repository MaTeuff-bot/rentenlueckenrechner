import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../../model/types'

export type ScenarioState = {
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
